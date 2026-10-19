# Octop — 绿联 UGOS Pro 安装包（`.UPK`）

将已发布的 Octop Docker 镜像打成绿联 NAS（UGOS Pro）可安装的 Docker 应用包。

**不重建镜像。** 打包时 `docker pull` + `docker save` 复用：

- 文档与对外引用：`ghcr.io/tencentcloud/octop:<pyproject 版本>`
- 发版：`.github/workflows/docker-publish.yml`（`v*` tag）同步推 GHCR 与 Docker Hub
- 平台：目前 **仅 `linux/amd64`**（与 `docker-publish.yml` 的 `platforms:` 一致）

官方规范：

- [开发准备](https://developer.ugnas.com/doc/backend/quick-start/prepare.html)（Linux + `ugcli pack`、固件 ≥ 1.13.0.0000、侧载需 `ugdev.sig`）
- [打包 Docker 应用](https://developer.ugnas.com/doc/backend/quick-start/develop-docker-app.html)
- [`project.yaml`](https://developer.ugnas.com/doc/tools/project-yaml.html)
- [`ugcli`](https://developer.ugnas.com/doc/tools/ugcli.html)

## 目录

```
ugos/
├── project.yaml                 # UGOS 应用元数据（spec 2.1）
├── rootfs_common/
│   ├── icon.png                 # 256×256 PNG（复用 fnos/docker/ICON_256.PNG）
│   └── docker-compose.yaml      # 引用 ghcr.io/tencentcloud/octop:<version>
└── rootfs_amd64/images/         # 构建时写入镜像 tar（仅允许 .tar，不入库）
```

应用 ID：`com.tencentcloud.docker.octop`  
产品线：`nasync`（绿联 NAS）  
端口：`8088`（`open_type: tab`）

## 本地构建

依赖：Linux amd64、Docker、能拉取 GHCR、绿联 `ugcli`。

```bash
# 仓库根目录
bash scripts/build-upk.sh
```

脚本会：

1. 从 `pyproject.toml` 读取版本，写入 `project.yaml` 与 compose 的 `image:`
2. `docker pull ghcr.io/tencentcloud/octop:<version>`（可用 `OCTOP_UPK_IMAGE` 覆盖仓库名）
3. `docker save` 到 `ugos/rootfs_amd64/images/`
4. 若本机没有 `ugcli`，从 `https://osswaf.ugnas.com/pro/ugcli/download/` 下载 `ugcli-v1.1.0.25-linux-amd64` 到 `.verify/ugcli`
5. `ugcli check` 后 `ugcli pack --arch amd64 --product-series nasync --build <N>`

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `UPK_BUILD` | `1` | `ugcli pack --build`，同一 `x.y.z` 下须递增 |
| `OCTOP_UPK_IMAGE` | `ghcr.io/tencentcloud/octop` | 镜像仓库（不含 tag） |
| `UGCLI_VERSION` | 默认 `1.1.0.25`（官方当前版） | `ugcli-v<ver>-linux-amd64` |
| `SKIP_IMAGE` | 空 | 设为 `1` 时不 pull/save（仅改元数据；无 tar 时 `ugcli pack` 会失败） |

产物：

- `ugos/build_dir/pkgs/upk/amd64_nasync_com.tencentcloud.docker.octop_<x.y.z.bbbb>.upk`
- 同时复制到 `dist/Octop-ugos-amd64-<version>.upk`

`.tar` 与 `build_dir/` 已加入 `.gitignore`。

## 自动发版

正式发布的自动链路：

1. `v*` tag 触发 `.github/workflows/release.yml` 与 `docker-publish.yml`
2. Release 创建成功后，`release.yml` 按该 tag dispatch
   `.github/workflows/ugos-build-upk.yml`
3. UPK workflow 等待 `ghcr.io/tencentcloud/octop:<version>` 可用
4. 执行 `bash scripts/build-upk.sh`，不重新构建 Docker 镜像
5. 将 `Octop-ugos-amd64-<version>.upk` 上传为对应 GitHub Release asset，
   同时保留为 Actions artifact

也可在 GitHub Actions 中对 **`v*` tag** 手动运行 `Build Octop UPK`。
workflow 会拒绝分支 ref 或与 `pyproject.toml` 版本不一致的 tag。

## 在绿联 NAS 上安装

1. 设备需已安装 Docker 套件（`com.ugreen.docker` ≥ `1.7.0.0000`），固件 ≥ `1.13.0.0000`
2. **侧载测试**需向绿联申请开发者授权（`ugdev.sig`），见 [开发准备](https://developer.ugnas.com/doc/backend/quick-start/prepare.html)
3. 应用中心 → 手动安装，选择 amd64 / nasync 的 `.upk`
4. 浏览器打开 `http://<设备IP>:8088`。未设密码时见数据卷 `credential.txt`

## 限制

- **无官方 arm64 镜像**：`docker-publish.yml` 只推 `linux/amd64`，本包 `support_arch` 仅为 amd64
- **须嵌入镜像 tar**：绿联 Docker 应用要求 compose 的 `image` 与 `rootfs_amd64/images/*.tar` 的 tag 一致，且禁止 `latest`
- **安装签名**：打出 `.upk` 不等于可在未授权设备上安装；上架应用中心另走绿联审核
