"""UGOS Pro UPK versions encode PEP 440 betas into the 4-digit build number."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

posix_only = pytest.mark.skipif(os.name != "posix", reason="bash helpers")

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "ugos" / "store_version.sh"
BUILD = REPO / "scripts" / "build-upk.sh"
WORKFLOW = REPO / ".github" / "workflows" / "ugos-build-upk.yml"
PROJECT_YAML = REPO / "ugos" / "project.yaml"
COMPOSE = REPO / "ugos" / "rootfs_common" / "docker-compose.yaml"


def _pyproject_version() -> str:
    for line in (REPO / "pyproject.toml").read_text(encoding="utf-8").splitlines():
        if line.startswith("version"):
            return line.split("=", 1)[1].strip().strip('"')
    raise AssertionError("pyproject.toml 没有 version")


@posix_only
@pytest.mark.parametrize(
    ("pep440", "store"),
    [
        ("1.0.2b9", "1.0.2.0009"),
        ("1.0.2", "1.0.2.0100"),
        ("1.0.3b1", "1.0.3.0001"),
        ("1.0.3b9", "1.0.3.0009"),
        ("1.0.3", "1.0.3.0100"),
        ("1.0.3b10", "1.0.3.0010"),
        ("1.0.3b99", "1.0.3.0099"),
    ],
)
def test_ugos_store_version_maps_beta_into_build(pep440: str, store: str) -> None:
    got = subprocess.check_output(["bash", str(SCRIPT), pep440], text=True).strip()
    assert got == store


@posix_only
def test_ugos_store_version_orders_like_pep440() -> None:
    def quad(pep440: str) -> tuple[int, int, int, int]:
        raw = subprocess.check_output(["bash", str(SCRIPT), pep440], text=True).strip()
        major, minor, patch, build = raw.split(".")
        return int(major), int(minor), int(patch), int(build)

    assert quad("1.0.2b9") < quad("1.0.2") < quad("1.0.3b1") < quad("1.0.3")


@posix_only
def test_ugos_store_version_rejects_unencoded_prerelease() -> None:
    for raw in ("1.0.2a1", "1.0.2rc1", "1.0.2b0", "1.0.2b100", "1.0.2b8.dev0", "1.0.3b1.post1"):
        result = subprocess.run(["bash", str(SCRIPT), raw], capture_output=True, text=True)
        assert result.returncode != 0, raw


def test_build_upk_uses_store_version_not_fixed_build() -> None:
    text = BUILD.read_text(encoding="utf-8")
    assert "ugos_store_version" in text
    assert "YAML_VER" in text
    assert "UPK_BUILD" not in text
    workflow = WORKFLOW.read_text(encoding="utf-8")
    assert "UPK_BUILD" not in workflow


def test_ugos_sources_keep_placeholder_versions() -> None:
    pep440 = _pyproject_version()
    yaml = PROJECT_YAML.read_text(encoding="utf-8")
    compose = COMPOSE.read_text(encoding="utf-8")
    assert "\nversion: 0.0.0\n" in yaml
    assert "image: ghcr.io/tencentcloud/octop:0.0.0\n" in compose
    assert pep440 not in yaml
    assert pep440 not in compose
    build = BUILD.read_text(encoding="utf-8")
    assert 'IMAGE="${IMAGE_REPO}:${VER}"' in build
    assert "YAML_VER" in build
