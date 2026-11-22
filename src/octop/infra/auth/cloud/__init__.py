"""Cloud-managed accounts that run on a local installation."""

from octop.infra.auth.cloud.claims import CloudIdentity
from octop.infra.auth.cloud.client import CloudAuthError, CloudClient, CloudToken
from octop.infra.auth.cloud.config import (
    CloudAccountConfig,
    CloudConfigError,
    load_config,
    normalize_base_url,
    save_config,
)
from octop.infra.auth.cloud.service import CloudAccountService, IssuedCloudSession

__all__ = [
    "CloudAccountConfig",
    "CloudAccountService",
    "CloudAuthError",
    "CloudClient",
    "CloudConfigError",
    "CloudIdentity",
    "CloudToken",
    "IssuedCloudSession",
    "load_config",
    "normalize_base_url",
    "save_config",
]
