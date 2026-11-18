# 桌面端连接云上后端：实现方案

> 对应 `DESKTOP_ARCHITECTURE.zh.md` §3.1、§5.2 与 `../README.md` Accounts。
> 本文只解决：**桌面壳可选填写 host、用户名、密码，连到一台已经在跑的 Octop 服务端；不填则维持现在的本机 sidecar。**
> 本文是实现规格，代码已按此落地。单点登录仍不在桌面连接页里。

## 1. 问题

现在每次启动都拉起本机 Python，只监听 `127.0.0.1` 上的随机端口。页面从 `octop://app/` 加载壳自带的 Dashboard，`/api/*` 和 WebSocket 由主进程转到这次 sidecar。账户靠设备凭据，不走密码。

云上（或任意一台已部署的）Octop 是另一套数据：用户、智能体、会话、渠道都在那台服务端。用户要在同一套壳里使用它，需要给出三样东西：服务端地址、用户名、密码。三样都不填的人保持今天的本机行为。

设备凭据不能拿去连云端。`POST /api/auth/device/token` 要求 `OCTOP_DESKTOP_SHELL=1` 且对端是回环地址。云端是普通多用户服务，没有这个标志，也不该为桌面放开回环限制。

## 2. 决定

一次启动只有一个后端。

| 配置 | 启动 |
|---|---|
| host、用户名、密码都空 | 本机 sidecar。与现在相同 |
| 三者都有 | 不拉起 Python。主进程把 `octop://app/api/*` 和 WebSocket 中继转到该 origin，并用用户名密码换 JWT |
| 只填了其中一部分 | 拒绝保存。不静默退回本机 |

云端模式下，窗口直接打开这台服务器自己的网页，壳只作为浏览器。登录得到的 JWT 在页面脚本运行之前写入该源的 `localStorage`（键 `auth_token`）。页面随后用自己的地址访问 `/api` 和 WebSocket，不经过壳的静态 Dashboard，也不能指定别的代理目标。本机模式仍加载壳自带的页面，开发时则加载 Vite。

密码只进钥匙串。host 和用户名写在壳自己的连接文件里。更新检测仍请求 `https://octop.cloud/api/downloads`，不改成这台云端。

智能体、工作区文件、浏览器、定时任务、渠道、远程桌面都跑在**连上的那台服务端**上。远程模式下，远程桌面看到的是云端那台机器，不是正在运行壳的这台电脑。本机文件仍由壳的文件选择器选出，再经现有上传接口送到服务端。

## 3. 谁在何时填写

三个入口，同一份配置：

1. **首次和之后的本机启动。** 启动画面写明「正在加载本机服务…」，并加一个「连接到云端 Octop」。默认路径不等待这个按钮，照旧拉起 sidecar。点下去则取消尚未就绪的 sidecar（已就绪则停掉进程树），再显示表单。
2. **已保存的云端配置。** 下次启动跳过 sidecar，直接探活并登录。启动画面保持打开，状态是「正在加载云端 Octop…」，并提供「改用本机」：停掉这次登录，忘掉云端配置，再拉起 sidecar。成功则不显示表单。
3. **应用菜单。** macOS 在 Octop 菜单里，Windows 和 Linux 在标题栏最左边的 Octop 菜单里，项名都是「云端实例」。打开连接表单。本机 Dashboard 在当前窗口里弹出；窗口正显示别的网页时，换成壳自己的连接页。保存后应用重新启动，才会换成另一个后端。不写 `config.json`，也不放在检查更新旁边。

「记住密码」默认勾选。取消勾选时，密码只留在本次进程内存里；host 与用户名仍然记住，下次启动停在表单上要求密码，不退回本机。

没有可用钥匙串的机器（headless Linux、WSL、CI）不允许把密码落盘。这种机器上云端模式每次启动都要重填密码，规则与设备凭据相同。

## 4. 地址

用户输入的 host 先规范化成 origin，再保存。接受下面三种写法，结果相同：

- `octop.example.com`
- `octop.example.com:8443`
- `https://octop.example.com:8443`
- `http://octop.example.com:8080`

没写协议时按 `https`。写了 `http://` 就保持 `http`，端口缺省是 80。规范化之后只保留 `protocol`、`hostname`、`port`。路径只允许空或 `/`。用户信息、查询字符串、片段一律拒绝。

`https` 的证书校验用系统信任库，不提供「忽略证书错误」。`http` 不走 TLS。

私网地址允许连接。用户明确填写的主机就是目标，壳不去拦 `10.x` 或 `192.168.x`。渲染进程不能按请求改目标，所以这不是开放的代理。

`/api` 的重定向不跟随。Octop 的 API 不靠跳转到另一台主机。跳转直接当成连接失败。

## 5. 启动

```text
读取连接配置
        │
        ├─ 本机 ─► 现有 sidecar 路径（随机端口、/api/health、最多 3 分钟）
        │
        └─ 云端 ─► 不申请端口，不 spawn
                    GET {origin}/api/health，超时 15 秒，失败再试一次
                    响应必须是 JSON 且 ok === true、db 为布尔
                    POST {origin}/api/auth/login
```

探活成功但 `version` 缺失，或与壳的版本主版本号不同：仍然连接，连接状态里写出两端版本。不因为版本差拒绝。`/api/health` 增加可选字段 `version`（包版本字符串）。旧服务端没有这个字段，桌面照常连接。

登录结果：

| 响应 | 壳的动作 |
|---|---|
| `access_token` | 打开该 origin。响应里的 `Set-Cookie` 写入窗口 cookie 罐；响应里的 `access_token` 写入 `localStorage`。旧服务端只有后者，新服务端两者都有。壳子不按版本号选择 |
| `mfa_required` | 打开该 origin。挑战经一次性 IPC 留给页面（页面会领时进入验证步骤）。密码留在主进程 |
| 需要 captcha | 打开该 origin。用户名经一次性 IPC 预填。页面收集 captcha 后让主进程用已保存的密码提交，密码不进页面状态 |
| 401 / 凭证错误 | 停在壳的连接页，写明用户名或密码错误。不打开一个已经连上、却没有会话的 Dashboard |
| 网络、TLS、探活形状不对、超时 | 停在壳的连接页，保留已填的 host 和用户名，密码框清空。提供「改用本机」 |

壳代发登录时，`/api/auth/login` 看到的客户端地址是这台电脑的出口地址。失败节流沿用服务端现有登录锁定，壳不额外重试密码错误。

JWT 过期后，壳用保存的密码再换一次。这次失败就进入登录页，不再试。云端模式下 `session.renew` 直接返回空，不请求 `/api/auth/device/token`。

切回本机会重新启动并加载本机页面。云端网页是另一个源，令牌写在那个源里，不会跟着进本机页面。

## 6. 代理与 WebSocket

云端页面不走下面这条反向代理，也不使用回环上的 WebSocket 中继。它就是该 origin 的普通网页。本机模式仍由壳提供页面，所以代理和中继保持不变。

HTTP 反向代理仍服务壳自己的 `octop://app/api/*`（本机模式）。云端窗口不经过它。请求头过滤保持现在的集合：去掉 hop-by-hop，以及 `Host`、`Origin`、`Cookie`、`Content-Length`。SSE 仍不在主进程里缓冲。

WebSocket 中继继续只听 `127.0.0.1` 上的临时端口，只告诉本机页面。云端页面拿到的是空，于是拨自己的主机。上游从 `net.connect(127.0.0.1, port)` 改为按目标拨号：本机仍是明文 TCP，云端目标仍可走 `tls.connect`（SNI 用该主机名，拒绝校验失败的证书）。握手头原样转发。中继仍不注入 JWT。上游未就绪是 503，拨号失败是 504，后端拒绝原样透传。

更新安装在云端模式下没有 Python 可停。准入锁照旧拒绝新的 API 请求，然后壳直接退出并把安装包交给安装器。本机模式仍要求 sidecar 以退出码 0 结束。

退出时云端模式只关掉中继套接字。不向本机发进程组信号。

## 7. 落盘与 IPC

`<OCTOP_HOME>/desktop-connection.json`，与 `desktop-settings.json` 分开，避免主题那类设置的读写碰到地址：

```json
{ "mode": "remote", "origin": "https://octop.example.com", "username": "ada" }
```

本机模式写成 `{ "mode": "local" }`。文件权限 `0600`。密码不在这个文件里，也不进日志。

密码用现有的 `safeStorage` 加密，写到 `<OCTOP_HOME>/desktop-remote-login.json`。明文不落盘。没有钥匙串时不写这个文件。切换到本机或清空连接时删掉它。

| IPC | 渲染进程入参 | 主进程行为 |
|---|---|---|
| `connection.get` | 无 | `{ mode, origin, username, hasPassword }`。没有密码字段 |
| `connection.set` | `local`，或 `origin` + `username` + `password` + `rememberPassword` | 校验 origin。通过后写入连接文件。`rememberPassword` 为真才加密落盘 |
| `connection.clear` | 无 | 删除连接文件和密码文件，下次启动为本机 |
| `session.loginRemote` | 可选 `captchaToken`、可选 MFA 码 | 用主进程里的密码调用云端登录。供 captcha / MFA 补全。不把密码返回页面 |

通道加在 `desktop/src/shared/ipc-contract.ts`，由 preload 暴露。入参在主进程校验：origin 最长 2048，用户名最长 256，密码最长 1024，类型必须是字符串。`connection.set` 不能改更新清单地址。

Dashboard 在没有 `window.octopDesktop` 时不渲染这块设置。浏览器打开的服务端不受影响。

## 8. 设置页与连接页

连接页是壳的 renderer 页面，加载在现有 Early Window 里，带 preload。沿用启动失败页的两层文案：一句话给用户，技术细节默认折叠。不要把 TLS 栈跟踪直接放在标题下。

入口在应用菜单的 Octop 一项里（「云端实例」），不放进「文件」，也不放进检查更新。本机 Dashboard 弹出表单；别的网页则换成壳的连接页。字段是 host、用户名、密码，外加「记住密码」和「改用本机」。保存后重新启动才会换成另一个后端。文案：壳连接页在壳 renderer 自己的资源里；弹出表单在 `dashboard/src/locales/zh.json` 与 `en.json`，键两边一致。

登录页只在第 5 节的 captcha / MFA 分支出现。云端自动登录成功时用户看不到它。

## 9. 服务端

云端就是普通 Octop 进程，不设置 `OCTOP_DESKTOP_SHELL`。

| 改动 | 原因 |
|---|---|
| `GET /api/health` 增加可选 `version` | 桌面在连接状态里展示两端版本。旧客户端忽略未知字段 |
| 其余登录、captcha、MFA、CORS、设备凭据 | 不改 |

壳的 `fetch` 不是浏览器页面，云端不必把 `octop://app` 加进 `cors_origins`。设备凭据接口继续拒绝非回环。

## 10. 改动位置

| 位置 | 改动 |
|---|---|
| `desktop/src/main/connection/profile.ts` | origin 规范化与拒绝规则 |
| `desktop/src/main/connection/secret.ts` | 密码的 safeStorage 读写；无钥匙串则只留内存 |
| `desktop/src/main/connection/remote-login.ts` | 探活与登录，含一次 JWT 续期 |
| `desktop/src/main/connection/web-credential.ts` | 云端页面地址，以及写入 `localStorage` 的脚本 |
| `desktop/src/main/index.ts` | 云端改为打开该 origin；本机仍走壳内页面 |
| `desktop/src/main/protocol/stream-proxy.ts` | 代理目标改为当前后端，重写 Host，不跟随重定向 |
| `desktop/src/main/protocol/ws-relay.ts` | 云端走 TLS，SNI 与证书校验 |
| `desktop/src/main/session/device-session.ts` | 云端模式下续期返回空 |
| `desktop/src/shared/ipc-contract.ts`、`preload/index.ts` | 第 7 节的通道 |
| `desktop/src/renderer/` | 连接页 |
| `dashboard/src/pages/Settings/` | 桌面连接表单 |
| `dashboard/src/pages/Login/index.tsx` | 只接 captcha / MFA 补全 |
| `dashboard/src/locales/zh.json`、`en.json` | 设置与登录补全文案 |
| `src/octop/api/routers/health.py` | 响应增加 `version` |
| `desktop/README.md`、`DESKTOP_ARCHITECTURE.zh.md` §3.1 | 现状 |

不新增数据表，不改迁移版本。不改 `config.json` 的 `bind_host` / `port`。

## 11. 验证

- `profile` 单测：三种 host 写法得到同一 origin；`http://` 保持该协议和端口；用户信息、路径、查询、其他协议、非 URL 都拒绝。
- `remote-login` 单测：探活形状不对不登录；登录成功不调用设备注册；401 不重试第二次；MFA 与 captcha 把控制权交给页面且密码不出现在 IPC 返回值里。
- 代理单测：云端目标的 `Host` 是该主机；重定向不跟随；渲染进程没有改目标的通道。
- WebSocket 单测：云端拨号使用 TLS 选项且 `rejectUnauthorized` 为真；本机目标仍是 `127.0.0.1`。
- 设备续期单测：云端模式返回空。
- 健康接口单测：响应含 `version`，缺省字段的旧断言改为允许该字段。
- 设置页：浏览器构建不渲染连接表单。桌面构建保存后要重新连接。
- 文案键跑 `uv run pytest tests/unit/i18n -q`。界面改动后跑 `cd dashboard && npx tsc -b` 与 `cd desktop/src && pnpm typecheck && pnpm test`。

手动：空配置启动仍只监听回环随机端口，且不写 `config.json`。填好云端后进程列表里没有本次 Python。拔掉网络时停在连接页，本机数据目录不被改写。

## 12. 不做的事

- 不在同一次启动里同时连本机 sidecar 和云端。
- 不把壳内打包的 Dashboard 当作云端页面。云端打开的是那台服务器自己的网页。
- 不把云端 Dashboard 的版本当成壳的升级源。壳的升级仍只走 `download.octop.cloud`。
- 不支持多条已存配置，也不做账户切换器。
- 不在壳的连接页里做单点登录或 LDAP 按钮。云端若只有这两种登录，用户改用浏览器。
- 不忽略证书错误，也不跟随跨主机重定向。
- 不把本机 `OCTOP_HOME` 与云端数据库同步或合并。
- 不附着到本机已经在跑的 `octop run`。本机模式仍是随壳启动自己的进程。
- 不把密码放进 `desktop-settings.json`、`desktop-connection.json`、日志或 `connection.get`。
- 不修改设备凭据的回环限制。
