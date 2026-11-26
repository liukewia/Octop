"""Absolute session boundaries, including legacy JWTs and renewal/rotation."""

import time

import jwt
import pytest

from octop.infra.auth.tokens import (
    MAX_SESSION_SECONDS,
    PURPOSE_ACCESS,
    PURPOSE_MFA,
    InvalidToken,
    TokenExpired,
    decode_token,
    sign_token,
)

SECRET = b"s" * 32


def test_access_token_caps_an_oversized_configured_ttl():
    token = sign_token(
        SECRET,
        sub=1,
        uname="alice",
        role="user",
        purpose=PURPOSE_ACCESS,
        ttl_seconds=MAX_SESSION_SECONDS * 2,
    )
    payload = decode_token(SECRET, token)
    assert payload["exp"] == payload["session_started_at"] + MAX_SESSION_SECONDS


@pytest.mark.parametrize("offset,expired", [(-1, False), (0, True), (1, True)])
def test_legacy_token_fixed_deadline(monkeypatch, offset, expired):
    now = int(time.time())
    # Legacy tokens had no session origin but did have iat. Even a far-future
    # exp must not let these sessions escape the new maximum lifetime.
    token = jwt.encode(
        {"sub": "1", "iat": now - MAX_SESSION_SECONDS - offset, "exp": now + 1000},
        SECRET,
        algorithm="HS256",
    )
    monkeypatch.setattr("octop.infra.auth.tokens.time.time", lambda: now)
    if expired:
        with pytest.raises(TokenExpired):
            decode_token(SECRET, token)
    else:
        assert decode_token(SECRET, token)["sub"] == 1


@pytest.mark.parametrize("start", [None, True, "123", 99999999999])
def test_access_token_without_a_valid_origin_fails_closed(start):
    payload = {"sub": "1", "exp": int(time.time()) + 60, "session_started_at": start}
    with pytest.raises(InvalidToken):
        decode_token(SECRET, jwt.encode(payload, SECRET, algorithm="HS256"))


def test_mfa_challenges_keep_their_short_lifetime():
    token = sign_token(
        SECRET,
        sub=1,
        uname="alice",
        role="user",
        purpose=PURPOSE_MFA,
        amr="password",
        ttl_seconds=300,
    )
    payload = decode_token(SECRET, token)
    assert payload["exp"] - payload["iat"] == 300
    assert "session_started_at" not in payload
