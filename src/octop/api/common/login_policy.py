"""Explicit opt-in; strings/numbers must not be coerced into legal acceptance."""

from pydantic import BaseModel, StrictBool


class LoginConsentBody(BaseModel):
    consent_accepted: StrictBool = False
