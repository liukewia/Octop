#!/usr/bin/env bash
# =============================================================================
# 构建 Octop 绿联 UGOS Pro Docker 应用包 (.UPK)
#
# 复用 docker-publish 已推送的镜像，不在此 docker build。
#
# 用法（仓库根目录）:
#   bash scripts/build-upk.sh
#
# 环境变量见 ugos/README.md。
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/ugos"
OUT="$ROOT/dist"
UGCLI_BASE_URL="https://osswaf.ugnas.com/pro/ugcli/download"
UGCLI_VERSION_FLOOR="1.1.0.25"

VER="$(grep -m1 '^version' "$ROOT/pyproject.toml" | sed -E 's/.*"([0-9][0-9.]*[0-9])".*/\1/')"
[ -n "$VER" ] || { echo "无法从 pyproject.toml 解析版本"; exit 1; }

IMAGE_REPO="${OCTOP_UPK_IMAGE:-ghcr.io/tencentcloud/octop}"
IMAGE="${IMAGE_REPO}:${VER}"
BUILD_NUM="${UPK_BUILD:-1}"

echo "[build-upk] Octop 版本: $VER"
echo "[build-upk] 镜像: $IMAGE"
echo "[build-upk] ugcli --build: $BUILD_NUM"

[ -f "$PKG/project.yaml" ] || { echo "[build-upk] 缺少 $PKG/project.yaml"; exit 1; }
[ -f "$PKG/rootfs_common/docker-compose.yaml" ] || { echo "[build-upk] 缺少 docker-compose.yaml"; exit 1; }
[ -f "$PKG/rootfs_common/icon.png" ] || { echo "[build-upk] 缺少 icon.png"; exit 1; }

# version: x.y.z in project.yaml
sed -i.bak -E "s/^(version: ).*/\\1${VER}/" "$PKG/project.yaml" && rm -f "$PKG/project.yaml.bak"

# image: repo:tag — keep a single image line
sed -i.bak -E "s|^(    image: ).*|\\1${IMAGE}|" "$PKG/rootfs_common/docker-compose.yaml" && rm -f "$PKG/rootfs_common/docker-compose.yaml.bak"

IMAGES_DIR="$PKG/rootfs_amd64/images"
mkdir -p "$IMAGES_DIR"
TAR="$IMAGES_DIR/octop-${VER}-amd64.tar"

if [ "${SKIP_IMAGE:-}" = "1" ]; then
  echo "[build-upk] SKIP_IMAGE=1，跳过镜像导出"
else
  export_image() {
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      echo "[build-upk] docker pull --platform linux/amd64 $IMAGE"
      docker pull --platform linux/amd64 "$IMAGE"
      echo "[build-upk] docker save → $TAR"
      docker save -o "$TAR" "$IMAGE"
      return 0
    fi
    if command -v skopeo >/dev/null 2>&1; then
      echo "[build-upk] docker 守护进程不可用，改用 skopeo copy → docker-archive"
      skopeo copy --override-os linux --override-arch amd64 \
        "docker://${IMAGE}" "docker-archive:${TAR}:${IMAGE}"
      return 0
    fi
    echo "[build-upk] 需要可用的 docker daemon 或 skopeo 以导出镜像 tar"
    return 1
  }
  export_image
  ls -lh "$TAR"
fi

ugcli_url() {
  printf '%s/ugcli-v%s-linux-amd64' "$UGCLI_BASE_URL" "$1"
}

resolve_ugcli() {
  if [ -n "${UGCLI:-}" ] && [ -x "$UGCLI" ]; then
    echo "$UGCLI"
    return 0
  fi
  if command -v ugcli >/dev/null 2>&1; then
    command -v ugcli
    return 0
  fi
  if [ -x "$ROOT/.verify/ugcli" ]; then
    echo "$ROOT/.verify/ugcli"
    return 0
  fi

  mkdir -p "$ROOT/.verify"
  local ver="${UGCLI_VERSION:-}" dest="$ROOT/.verify/ugcli" url
  if [ -z "$ver" ]; then
    ver="$UGCLI_VERSION_FLOOR"
    local patch i
    patch="${ver##*.}"
    for i in $(seq 0 20); do
      local try="1.1.0.$((patch + i))"
      url="$(ugcli_url "$try")"
      if curl -fsI -o /dev/null "$url"; then
        ver="$try"
      else
        [ "$i" -eq 0 ] || break
      fi
    done
  fi
  url="$(ugcli_url "$ver")"
  echo "[build-upk] 下载 ugcli $ver: $url" >&2
  curl -fL --retry 3 -o "$dest" "$url"
  chmod +x "$dest"
  if ! python3 -c 'import sys; p=sys.argv[1]; d=open(p,"rb").read(4); sys.exit(0 if d==b"\x7fELF" else 1)' "$dest"; then
    echo "[build-upk] 下载的 ugcli 不是 ELF，可能是 HTML 错误页"
    rm -f "$dest"
    exit 1
  fi
  echo "$dest"
}

UGCLI_BIN="$(resolve_ugcli)"
echo "[build-upk] 使用 ugcli: $UGCLI_BIN"
"$UGCLI_BIN" --version || true

echo "[build-upk] ugcli check"
( cd "$PKG" && "$UGCLI_BIN" check )

echo "[build-upk] ugcli pack --arch amd64 --product-series nasync --build $BUILD_NUM"
( cd "$PKG" && "$UGCLI_BIN" pack --arch amd64 --product-series nasync --build "$BUILD_NUM" )

mkdir -p "$OUT"
SRC="$(find "$PKG/build_dir" -name '*.upk' -type f 2>/dev/null | head -1 || true)"
[ -n "$SRC" ] || { echo "[build-upk] 未找到 .upk（见 $PKG/build_dir）"; exit 1; }

OUTNAME="Octop-ugos-amd64-${VER}.upk"
cp -f "$SRC" "$OUT/$OUTNAME"
echo "[build-upk] 产物: $SRC"
echo "[build-upk] 复制: $OUT/$OUTNAME"
ls -lh "$SRC" "$OUT/$OUTNAME"
