import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEB_AUTH_TOKEN_KEY,
  pageRelayEndpoint,
  parseSetCookie,
  remotePageUrl,
  webAuthBootstrapSource,
} from "./web-credential";

test("the cloud page is that origin, with the shell theme query", () => {
  assert.equal(
    remotePageUrl("https://octop.example.com:8443", "dark"),
    "https://octop.example.com:8443/?octopTheme=dark",
  );
  assert.equal(remotePageUrl("http://127.0.0.1:8080", "system"), "http://127.0.0.1:8080/?octopTheme=system");
});

test("the bootstrap writes auth_token only on the signed-in origin", () => {
  const source = webAuthBootstrapSource("https://octop.example.com", 'tok"en');
  assert.match(source, /location\.origin === "https:\/\/octop\.example\.com"/);
  assert.match(source, new RegExp(`localStorage\\.setItem\\("${WEB_AUTH_TOKEN_KEY}"`));
  assert.match(source, /"tok\\"en"/);
  assert.equal(source.includes("password"), false);
});

test("a remote page is not given the loopback relay", () => {
  const endpoint = { baseUrl: "ws://127.0.0.1:9", token: "relay" };
  assert.equal(pageRelayEndpoint("remote", endpoint), null);
  assert.equal(pageRelayEndpoint("local", endpoint), endpoint);
  assert.equal(pageRelayEndpoint("local", null), null);
});

test("Set-Cookie keeps HttpOnly and the Secure flag the server sent", () => {
  const parsed = parseSetCookie("octop_session=jwt; HttpOnly; Secure; Path=/; Max-Age=3600; SameSite=Lax");
  assert.ok(parsed);
  assert.equal(parsed.name, "octop_session");
  assert.equal(parsed.value, "jwt");
  assert.equal(parsed.httpOnly, true);
  assert.equal(parsed.secure, true);
  assert.equal(parsed.maxAge, 3600);
  assert.equal(parsed.sameSite, "lax");

  const plain = parseSetCookie("octop_session=jwt; HttpOnly; Path=/; SameSite=Lax");
  assert.ok(plain);
  assert.equal(plain.secure, false);
});
