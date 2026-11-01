#!/usr/bin/env bash
# 绿联 UPK 版本映射。规则见 ugos/README.md「版本号映射」。
#   1.0.3b1 → 1.0.3.0001
#   1.0.3   → 1.0.3.0100

ugos_store_version() {
  local ver="${1:-}"
  local major minor patch num build
  if [[ "$ver" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)b([0-9]+)$ ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
    num=$((10#${BASH_REMATCH[4]}))
    if [ "$num" -lt 1 ] || [ "$num" -gt 99 ]; then
      echo "绿联 UPK 版本无法编码 beta 序号: $ver" >&2
      return 1
    fi
    build=$num
  elif [[ "$ver" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
    build=100
  else
    echo "绿联 UPK 版本只接受 X.Y.Z 或 X.Y.ZbN，收到: $ver" >&2
    return 1
  fi
  printf '%s.%s.%s.%04d\n' "$major" "$minor" "$patch" "$build"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  ugos_store_version "${1:-}"
fi
