#!/usr/bin/env python3
"""A tiny stand-in for the cloud account service.

Use it to develop the local side before the real service exists. It implements
exactly the contract in ``docs/CLOUD_ACCOUNTS.zh.md`` and keeps every account in
memory.

    python scripts/mock_cloud_account.py --port 8787

Demo accounts (password ``pw`` for both):

    alice   member, permissions ["experts", "tasks"]
    root    administrator

Configure the installation with ``base_url = http://127.0.0.1:8787``,
``client_id = octop-desktop`` and ``client_secret = mock-secret``. Loopback is
the only place plain HTTP is accepted.
"""

from __future__ import annotations

import argparse
import json
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

CLIENT_ID = "octop-desktop"
CLIENT_SECRET = "mock-secret"
TOKEN_TTL_SECONDS = 3600

ACCOUNTS: dict[str, dict[str, Any]] = {
    "alice": {
        "password": "pw",
        "user": {
            "sub": "u-alice",
            "username": "alice",
            "name": "Alice",
            "email": "alice@corp.example",
            "role": "user",
            "permissions": ["experts", "tasks"],
            "locale": "zh",
            "tenant": "demo",
        },
    },
    "root": {
        "password": "pw",
        "user": {
            "sub": "u-root",
            "username": "root",
            "name": "Root",
            "email": "root@corp.example",
            "role": "admin",
            "permissions": [],
            "locale": "zh",
            "tenant": "demo",
        },
    },
}

# token -> {"username": ..., "kind": "access"|"refresh", "expires_at": ...}
TOKENS: dict[str, dict[str, Any]] = {}
# mfa_token -> username
MFA_PENDING: dict[str, str] = {}


def _issue(username: str) -> dict[str, Any]:
    access = secrets.token_urlsafe(24)
    refresh = secrets.token_urlsafe(24)
    now = int(time.time())
    TOKENS[access] = {"username": username, "kind": "access", "expires_at": now + TOKEN_TTL_SECONDS}
    TOKENS[refresh] = {
        "username": username,
        "kind": "refresh",
        "expires_at": now + 7 * 24 * 3600,
    }
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "Bearer",
        "expires_in": TOKEN_TTL_SECONDS,
        "user": ACCOUNTS[username]["user"],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "OctopMockCloud/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:  # keep the demo quiet
        print(f"[mock-cloud] {fmt % args}")

    # ----- helpers ----------------------------------------------------

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return {}

    def _bearer(self) -> dict[str, Any] | None:
        header = self.headers.get("authorization") or ""
        if not header.lower().startswith("bearer "):
            return None
        return TOKENS.get(header[7:].strip())

    def _check_client(self, body: dict[str, Any]) -> bool:
        return body.get("client_id") == CLIENT_ID and body.get("client_secret") == CLIENT_SECRET

    # ----- routes -----------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/v1/health":
            self._json(200, {"service": "octop-cloud", "version": "mock-1.0"})
            return
        if path == "/api/v1/auth/userinfo":
            token = self._bearer()
            if token is None or token["kind"] != "access":
                self._json(401, {"error": "invalid_credentials"})
                return
            self._json(200, {"user": ACCOUNTS[token["username"]]["user"]})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        body = self._body()
        if path == "/api/v1/auth/token":
            self._token(body)
            return
        if path == "/api/v1/auth/revoke":
            token = str(body.get("token") or "")
            TOKENS.pop(token, None)
            self._json(200, {"revoked": True})
            return
        self._json(404, {"error": "not_found"})

    def _token(self, body: dict[str, Any]) -> None:
        if not self._check_client(body):
            self._json(401, {"error": "invalid_client"})
            return
        grant = body.get("grant_type")
        if grant == "refresh_token":
            record = TOKENS.get(str(body.get("refresh_token") or ""))
            if record is None or record["kind"] != "refresh":
                self._json(401, {"error": "invalid_grant"})
                return
            self._json(200, _issue(record["username"]))
            return
        if grant != "password":
            self._json(400, {"error": "unsupported_grant_type"})
            return

        username = str(body.get("username") or "")
        account = ACCOUNTS.get(username)
        if account is None or account["password"] != str(body.get("password") or ""):
            self._json(401, {"error": "invalid_credentials"})
            return

        # ``root`` demonstrates the second-factor branch; ``alice`` signs in directly.
        if username != "root":
            self._json(200, _issue(username))
            return

        if body.get("otp"):
            pending = MFA_PENDING.pop(str(body.get("mfa_token") or ""), None)
            if pending != username or str(body["otp"]).strip() != "123456":
                self._json(401, {"error": "mfa_invalid"})
                return
            self._json(200, _issue(username))
            return

        challenge = secrets.token_urlsafe(16)
        MFA_PENDING[challenge] = username
        self._json(
            200,
            {
                "mfa_required": True,
                "mfa_token": challenge,
                "methods": ["totp"],
                "error_description": "enter 123456",
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Mock cloud account service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"mock cloud account service on http://{args.host}:{args.port}")
    print("accounts: alice/pw (direct), root/pw (second factor 123456)")
    server.serve_forever()


if __name__ == "__main__":
    main()
