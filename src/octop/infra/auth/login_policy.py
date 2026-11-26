"""Operator-controlled login consent, shared by all interactive sign-in methods."""

from octop.config import OctopConfig
from octop.infra.errors import ErrorCode, OctopError


def public_login_policy(config: OctopConfig) -> dict[str, bool | str]:
    return {
        "enabled": config.login_consent_enabled,
        "ready": bool(config.user_agreement_url and config.privacy_policy_url),
        "user_agreement_url": config.user_agreement_url,
        "privacy_policy_url": config.privacy_policy_url,
    }


def ensure_login_consent(config: OctopConfig, accepted: bool) -> None:
    if not config.login_consent_enabled:
        return
    if not config.user_agreement_url or not config.privacy_policy_url:
        raise OctopError(ErrorCode.LOGIN_POLICY_UNAVAILABLE, "login policy links not configured")
    if accepted is not True:
        raise OctopError(ErrorCode.LOGIN_CONSENT_REQUIRED, "login consent required")
