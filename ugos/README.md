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

## 版本号映射

绿联安装包版本是四段数字 `x.y.z.b`。[`project.yaml` 的 `version`](https://developer.ugnas.com/doc/tools/project-yaml.html) 只写 `x.y.z`，打包时 `ugcli pack --build` 追加 4 位、左补零的构建号。应用中心按四段数字逐段比较，数字越大表示版本越新。版本字符串里不能带 `b`、`beta`、`rc`。

Octop 发版号是 PEP 440，beta 写成 `X.Y.ZbN`（例如 `1.0.3b1`）。`scripts/ugos/store_version.sh` 在打包时把 beta 序号放进构建号，正式版固定用构建号 `100`：

| Octop（`pyproject.toml`、镜像标签） | `project.yaml` `version` | `--build` | 应用中心版本 |
|-------------------------------------|--------------------------|-----------|--------------|
| `X.Y.ZbN`（N 为 1–99） | `X.Y.Z` | `N` | `X.Y.Z` + 4 位左补零的 N |
| `X.Y.Z` | `X.Y.Z` | `100` | `X.Y.Z.0100` |

| Octop | 应用中心版本 |
|-------|----------------|
| `1.0.2b9` | `1.0.2.0009` |
| `1.0.2` | `1.0.2.0100` |
| `1.0.3b1` | `1.0.3.0001` |
| `1.0.3b9` | `1.0.3.0009` |
| `1.0.3` | `1.0.3.0100` |

上面几行的大小关系与 PEP 440 一致：`1.0.2b9` < `1.0.2` < `1.0.3b1` < `1.0.3b9` < `1.0.3`。

打进包里的镜像标签和 Release 文件名仍用 PEP 440，来自 `pyproject.toml`，例如 `ghcr.io/tencentcloud/octop:1.0.3b1`、`dist/Octop-ugos-amd64-1.0.3b1.upk`。绿联包文件名里的版本是四段数字，例如 `amd64_nasync_com.tencentcloud.docker.octop_1.0.3.0001.upk`。

仓库里的 `ugos/project.yaml` `version` 和 `ugos/rootfs_common/docker-compose.yaml` 的 `image` 都是占位 `0.0.0`，发版不改。`scripts/build-upk.sh` 打包时从 `pyproject.toml` 写入真实镜像标签，并按上表改写 `project.yaml` 的 `version`。

打包只接受 `X.Y.Z` 和 `X.Y.ZbN`。`1.0.2a1`、`1.0.2rc1`、`1.0.2b0`、`1.0.2b100`，以及带 `.dev`、`.post` 的版本会失败。同一个 `X.Y.ZbN` 对应同一个构建号，再次提交前要把 beta 序号加一。

## 本地构建

依赖：Linux amd64、Docker、能拉取 GHCR、绿联 `ugcli`。

```bash
# 仓库根目录
bash scripts/build-upk.sh
```

脚本会：

1. 从 `pyproject.toml` 读取 PEP 440 版本。镜像标签与 `dist/` 文件名保持该字符串（如 `1.0.3b1`）
2. 按 [版本号映射](#版本号映射) 写入 `project.yaml` 的 `version`，并用 `ugcli pack --build` 带上构建号
3. `docker pull ghcr.io/tencentcloud/octop:<version>`（可用 `OCTOP_UPK_IMAGE` 覆盖仓库名）
4. `docker save` 到 `ugos/rootfs_amd64/images/`
5. 若本机没有 `ugcli`，从 `https://osswaf.ugnas.com/pro/ugcli/download/` 下载 `ugcli-v1.1.0.25-linux-amd64` 到 `.verify/ugcli`
6. `ugcli check` 后 `ugcli pack --arch amd64 --product-series nasync --build <N>`

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `OCTOP_UPK_IMAGE` | `ghcr.io/tencentcloud/octop` | 镜像仓库（不含 tag） |
| `UGCLI_VERSION` | 默认 `1.1.0.25`（官方当前版） | `ugcli-v<ver>-linux-amd64` |
| `SKIP_IMAGE` | 空 | 设为 `1` 时不 pull/save（仅改元数据；无 tar 时 `ugcli pack` 会失败） |

产物：

- `ugos/build_dir/pkgs/upk/amd64_nasync_com.tencentcloud.docker.octop_<x.y.z.bbbb>.upk`（如 `1.0.3.0001`）
- 同时复制到 `dist/Octop-ugos-amd64-<pep440>.upk`（如 `Octop-ugos-amd64-1.0.3b1.upk`）

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
3. 应用中心 → 手动安装，选择 amd64 / nasync 的 `.upk`。安装时填写管理员用户名和密码（必填）；显示名称和日志级别可选
4. 浏览器打开 `http://<设备IP>:8088`，用刚才的账号登录。密码未通过策略（至少 8 位且同时含字母和数字）时不会建号，打开页面走设置向导，向导口令在数据卷 `octop-login.txt`

## 限制

- **无官方 arm64 镜像**：`docker-publish.yml` 只推 `linux/amd64`，本包 `support_arch` 仅为 amd64
- **须嵌入镜像 tar**：绿联 Docker 应用要求 compose 的 `image` 与 `rootfs_amd64/images/*.tar` 的 tag 一致，且禁止 `latest`
- **安装签名**：打出 `.upk` 不等于可在未授权设备上安装；上架应用中心另走绿联审核
