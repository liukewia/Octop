import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { connect as tlsConnect, type ConnectionOptions } from "node:tls";

import type { BackendTarget } from "../connection/target";
import type { WsRelayEndpoint } from "../../shared/ipc-contract";
import { isApiPath } from "./stream-proxy";

/**
 * WebSocket relay for the privileged ``octop://`` page (§5.2).
 *
 * A custom scheme cannot carry a WebSocket handshake — Chromium's upgrade
 * bypasses the protocol handler, and `webRequest.onBeforeRequest` may not
 * redirect one (measured: the request is visible, the redirect is dropped). So
 * the page is told to dial a loopback relay instead, which forwards the
 * handshake to the sidecar that is actually listening.
 *
 * The renderer learns the relay's ephemeral port and a per-launch token, never
 * the backend port: the relay re-reads it on every connection, so a sidecar
 * restart after an update needs no new URL in the page.
 *
 * URL shape: ``ws://127.0.0.1:<port>/<token>/api/<path>?<query>`` — the token is
 * a path segment rather than a query parameter so callers can keep appending
 * their own query string.
 */

const MAX_HEAD_BYTES = 16 * 1024;
const HANDSHAKE_TIMEOUT_MS = 5_000;

export interface WsRelayOptions {
  /** Current backend, or null while it is down / being replaced. */
  backend: () => BackendTarget | null;
  /** Origin the shell's own pages report, e.g. ``octop://app``. */
  allowedOrigin: string;
  /**
   * Other origins this shell itself navigates to. Dev hot reload uses a
   * loopback Vite origin while a remote session stays on ``octop://app``.
   */
  extraOrigins?: readonly string[];
}

/** Dial options for one backend. Remote targets verify the certificate. */
export function upstreamOptions(
  target: BackendTarget,
): { tls: false; host: string; port: number } | (ConnectionOptions & { tls: true }) {
  if (!target.tls) return { tls: false, host: target.host, port: target.port };
  return {
    tls: true,
    host: target.host,
    port: target.port,
    servername: target.host,
    rejectUnauthorized: true,
  };
}

/** Constant-time compare that does not leak the length of the expected token. */
function sameSecret(presented: string, expected: string): boolean {
  const left = Buffer.from(presented, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function reject(socket: Socket, status: number, reason: string, body: string): void {
  const payload = Buffer.from(`${body}\n`, "utf8");
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      "connection: close\r\n" +
      "content-type: text/plain; charset=utf-8\r\n" +
      `content-length: ${payload.length}\r\n\r\n${payload.toString("utf8")}`,
  );
}

/** Headers a WebSocket handshake must carry through untouched. */
const FORWARD_REQUEST_HEADERS = [
  ["sec-websocket-key", "Sec-WebSocket-Key"],
  ["sec-websocket-version", "Sec-WebSocket-Version"],
  ["sec-websocket-protocol", "Sec-WebSocket-Protocol"],
  ["sec-websocket-extensions", "Sec-WebSocket-Extensions"],
] as const;

export class WsRelay {
  private readonly options: WsRelayOptions;
  private readonly token: string;
  private server: Server | null = null;
  private port = 0;
  private readonly sockets = new Set<Socket>();

  constructor(options: WsRelayOptions) {
    this.options = options;
    this.token = randomBytes(18).toString("base64url");
  }

  get endpoint(): WsRelayEndpoint | null {
    if (!this.port) return null;
    return { baseUrl: `ws://127.0.0.1:${this.port}/${this.token}`, token: this.token };
  }

  async start(): Promise<WsRelayEndpoint> {
    const server = createServer((_req, res) => {
      // Plain HTTP is never served here; only upgrades are meaningful.
      res.writeHead(404).end("websocket relay\n");
    });
    server.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket as Socket, head));
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });

    await new Promise<void>((resolve, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", rejectListen);
        resolve();
      });
    });

    const address = server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
    this.server = server;
    const endpoint = this.endpoint;
    if (!endpoint) throw new Error("websocket relay failed to bind a loopback port");
    return endpoint;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** ``/<token>/api/<path>`` → ``/api/<path>``, or null when it is not ours. */
  private route(rawUrl: string | undefined): { path: string; search: string } | null {
    const url = new URL(rawUrl ?? "/", "http://127.0.0.1");
    const segments = url.pathname.split("/");
    const presented = segments[1] ?? "";
    if (!sameSecret(presented, this.token)) return null;
    const path = `/${segments.slice(2).join("/")}`;
    if (!isApiPath(path)) return null;
    return { path, search: url.search };
  }

  private handleUpgrade(req: IncomingMessage, client: Socket, head: Buffer): void {
    client.setNoDelay(true);
    client.on("error", () => client.destroy());

    const target = this.route(req.url);
    if (!target) {
      reject(client, 403, "Forbidden", "unknown relay target");
      return;
    }
    // A browser always sends Origin on a WebSocket; requiring the shell's own
    // origin keeps a random page from borrowing this port.
    const origin = req.headers.origin ?? "";
    const allowed =
      origin === this.options.allowedOrigin ||
      (this.options.extraOrigins?.includes(origin) ?? false);
    if (!allowed) {
      reject(client, 403, "Forbidden", "unexpected origin");
      return;
    }

    const backend = this.options.backend();
    if (!backend) {
      reject(client, 503, "Service Unavailable", "backend not ready");
      return;
    }

    const key = req.headers["sec-websocket-key"];
    const version = req.headers["sec-websocket-version"];
    if (typeof key !== "string" || typeof version !== "string") {
      reject(client, 400, "Bad Request", "not a websocket handshake");
      return;
    }

    const dial = upstreamOptions(backend);
    const upstream = dial.tls
      ? tlsConnect({
          host: dial.host,
          port: dial.port,
          servername: dial.servername,
          rejectUnauthorized: true,
        })
      : connect({ host: dial.host, port: dial.port });
    upstream.setNoDelay(true);
    this.sockets.add(upstream);

    const teardown = () => {
      upstream.destroy();
      client.destroy();
    };
    upstream.on("error", teardown);
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => {
      this.sockets.delete(upstream);
      client.destroy();
    });

    // An unreachable backend must not hang the page's reconnect loop.
    let ready = false;
    const timer = setTimeout(() => {
      if (!ready) {
        reject(client, 504, "Gateway Timeout", "backend unreachable");
        teardown();
      }
    }, HANDSHAKE_TIMEOUT_MS);
    const markReady = () => {
      ready = true;
      clearTimeout(timer);
    };
    if (dial.tls) upstream.once("secureConnect", markReady);
    else upstream.once("connect", markReady);

    const headers = [
      `${req.method ?? "GET"} ${target.path}${target.search} HTTP/1.1`,
      `Host: ${backend.hostHeader}`,
      "Connection: Upgrade",
      "Upgrade: websocket",
      `Origin: ${backend.origin}`,
      "x-octop-proxy: 1",
    ];
    for (const [header, canonical] of FORWARD_REQUEST_HEADERS) {
      const value = req.headers[header];
      if (typeof value === "string" && value) headers.push(`${canonical}: ${value}`);
    }
    upstream.write(`${headers.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);

    let response = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      const end = response.indexOf("\r\n\r\n");
      if (end === -1) {
        if (response.length > MAX_HEAD_BYTES) {
          upstream.off("data", onData);
          reject(client, 502, "Bad Gateway", "upstream response header too large");
          teardown();
        }
        return;
      }
      upstream.off("data", onData);
      const statusLine = response.subarray(0, response.indexOf("\r\n")).toString("latin1");
      client.write(response);
      if (!statusLine.includes(" 101 ")) {
        // The sidecar refused (401/404/…): pass its answer through, then close.
        teardown();
        return;
      }
      upstream.pipe(client);
      client.pipe(upstream);
    };
    upstream.on("data", onData);
  }
}
