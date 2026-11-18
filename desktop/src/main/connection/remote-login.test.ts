import assert from "node:assert/strict";
import { test } from "node:test";

import { publicLoginResult, RemoteLogin } from "./remote-login";

interface Seen {
  url: string;
  body: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(options: {
  password?: string | null;
  respond: (seen: Seen) => Response | Promise<Response>;
}) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const call = { url: String(input), body };
    seen.push(call);
    return options.respond(call);
  }) as typeof fetch;
  const login = new RemoteLogin({
    fetchImpl,
    origin: () => "https://octop.example.com",
    username: () => "ada",
    password: () => (options.password === undefined ? "secret" : options.password),
    shellVersion: "1.4.0",
  });
  return { login, seen };
}

test("a health body that is not Octop never posts the password", async () => {
  const { login, seen } = client({
    respond: () => json(200, { ok: true }),
  });
  const outcome = await login.connect();
  assert.equal(outcome.kind, "unreachable");
  assert.equal(seen.length, 2);
  assert.equal(seen.every((call) => call.url.endsWith("/api/health")), true);
});

test("a successful login returns a token and does not call the device endpoints", async () => {
  const { login, seen } = client({
    respond: (call) => {
      if (call.url.endsWith("/api/health")) return json(200, { ok: true, db: true, version: "1.4.2" });
      return json(200, { access_token: "jwt-1", expires_in: 3600 });
    },
  });
  const outcome = await login.connect();
  assert.equal(outcome.kind, "token");
  if (outcome.kind !== "token") return;
  assert.equal(outcome.accessToken, "jwt-1");
  assert.equal(outcome.versionWarning, null);
  const urls = seen.map((call) => call.url);
  assert.deepEqual(urls, [
    "https://octop.example.com/api/health",
    "https://octop.example.com/api/auth/login",
  ]);
  const posted = seen[1]?.body as { password?: string };
  assert.equal(posted.password, "secret");
  const pub = publicLoginResult(outcome);
  assert.equal("password" in pub, false);
  assert.equal(pub.access_token, "jwt-1");
});

test("a cookie without a token is still a successful login", async () => {
  const { login } = client({
    respond: (call) => {
      if (call.url.endsWith("/api/health")) return json(200, { ok: true, db: true, version: "1.4.2" });
      return new Response(JSON.stringify({ user: { username: "ada" } }), {
        status: 200,
        headers: [
          ["content-type", "application/json"],
          ["set-cookie", "octop_session=jwt-cookie; HttpOnly; Path=/; SameSite=Lax"],
        ],
      });
    },
  });
  const outcome = await login.connect();
  assert.equal(outcome.kind, "cookie");
  if (outcome.kind !== "cookie") return;
  assert.equal(outcome.cookies.length, 1);
  assert.equal(outcome.cookies[0]?.includes("octop_session=jwt-cookie"), true);
  const pub = publicLoginResult(outcome);
  assert.equal(pub.ok, true);
  assert.equal(pub.access_token, undefined);
  assert.equal(JSON.stringify(pub).includes("jwt-cookie"), false);
});

test("401 is not retried", async () => {
  const { login, seen } = client({
    respond: (call) => {
      if (call.url.endsWith("/api/health")) return json(200, { ok: true, db: false });
      return json(401, { error: { code: "AUTH_FAILED", message: "no" } });
    },
  });
  const outcome = await login.connect();
  assert.equal(outcome.kind, "unauthorized");
  assert.equal(seen.filter((call) => call.url.endsWith("/api/auth/login")).length, 1);
});

test("captcha and MFA hand control to the page without returning the password", async () => {
  const captcha = client({
    respond: (call) => {
      if (call.url.endsWith("/api/health")) return json(200, { ok: true, db: true });
      return json(400, { error: { code: "CAPTCHA_REQUIRED", message: "captcha" } });
    },
  });
  const captchaOutcome = await captcha.login.connect();
  assert.equal(captchaOutcome.kind, "captcha");
  const captchaPublic = publicLoginResult(captchaOutcome);
  assert.equal("password" in captchaPublic, false);
  assert.equal(captchaPublic.access_token, undefined);

  const mfa = client({
    respond: (call) => {
      if (call.url.endsWith("/api/health")) return json(200, { ok: true, db: true, version: "2.0.0" });
      return json(200, {
        mfa_required: true,
        mfa_token: "mfa-1",
        methods: ["totp"],
        user_hint: "ada",
        locale: "zh",
      });
    },
  });
  const mfaOutcome = await mfa.login.connect();
  assert.equal(mfaOutcome.kind, "mfa");
  if (mfaOutcome.kind !== "mfa") return;
  assert.equal(mfaOutcome.versionWarning, "本机 1.4.0，云端 2.0.0");
  const mfaPublic = publicLoginResult(mfaOutcome);
  assert.equal("password" in mfaPublic, false);
  assert.equal(mfaPublic.mfa?.mfa_token, "mfa-1");
  const verifyBody = JSON.stringify(mfaPublic);
  assert.equal(verifyBody.includes("secret"), false);
});

test("aborting the probe does not post the password", async () => {
  const abort = new AbortController();
  const seen: string[] = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    seen.push(String(_input));
    return await new Promise<Response>((_resolve, reject) => {
      const fail = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (init?.signal?.aborted) {
        fail();
        return;
      }
      init?.signal?.addEventListener("abort", fail, { once: true });
      abort.abort();
    });
  }) as typeof fetch;
  const login = new RemoteLogin({
    fetchImpl,
    origin: () => "https://octop.example.com",
    username: () => "ada",
    password: () => "secret",
    shellVersion: "1.4.0",
    signal: abort.signal,
  });
  const outcome = await login.connect();
  assert.equal(outcome.kind, "unreachable");
  assert.equal(seen.some((url) => url.endsWith("/api/auth/login")), false);
});

test("a redirect is a failed connection and is not followed", async () => {
  const { login, seen } = client({
    respond: () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/api/health" } }),
  });
  const outcome = await login.connect();
  assert.equal(outcome.kind, "unreachable");
  assert.equal(seen.length, 2);
  assert.equal(seen.every((call) => call.url === "https://octop.example.com/api/health"), true);
});
