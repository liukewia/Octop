"""Normalising cloud user documents into a shape the local account table can hold.

Cloud deployments differ in small ways (``sub`` vs ``id``, ``name`` vs
``display_name``, a permissions array vs a role string). The adapter keeps that
variation here so neither the client nor ``UserManager`` has to guess.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from octop.infra.auth.cloud.client import CloudAuthError


def _text(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _string_list(value: object) -> list[str] | None:
    if not isinstance(value, list):
        return None
    items = [str(item).strip() for item in value if str(item).strip()]
    return items


@dataclass(frozen=True)
class CloudIdentity:
    subject: str
    username: str
    display_name: str | None = None
    email: str | None = None
    role: str | None = None
    permissions: list[str] | None = None
    locale: str | None = None
    tenant: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_user_document(
        cls,
        document: dict[str, Any],
        *,
        fallback_username: str,
    ) -> CloudIdentity:
        subject = _text(document.get("sub"), document.get("id"), document.get("user_id"))
        if subject is None:
            raise CloudAuthError("invalid_response", "cloud user document has no subject")

        username = _text(
            document.get("username"),
            document.get("preferred_username"),
            document.get("login"),
        )
        email = _text(document.get("email"))
        if username is None and email:
            username = email.split("@", maxsplit=1)[0]
        if username is None:
            username = fallback_username.strip()
        if not username:
            raise CloudAuthError("invalid_response", "cloud user document has no username")

        role = _text(document.get("role"), document.get("user_role"))
        if role is None:
            roles = _string_list(document.get("roles"))
            if roles:
                # "admin" anywhere in the role list is the only escalation the
                # local side recognises; everything else maps to the default role.
                role = "admin" if "admin" in [r.lower() for r in roles] else "user"
        permissions = _string_list(document.get("permissions"))
        if permissions is None:
            permissions = _string_list(document.get("scopes"))

        return cls(
            subject=subject,
            username=username,
            display_name=_text(document.get("name"), document.get("display_name")),
            email=email,
            role=role.lower() if role else None,
            permissions=permissions,
            locale=_text(document.get("locale"), document.get("language")),
            tenant=_text(document.get("tenant"), document.get("tenant_id")),
            extra={
                key: value
                for key, value in document.items()
                if key
                in {
                    "avatar_url",
                    "picture",
                    "phone",
                    "department",
                    "title",
                }
            },
        )
