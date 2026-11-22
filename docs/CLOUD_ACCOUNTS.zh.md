# 云端管控账号（本地运行）

Octop 的后端仍然跑在用户自己的电脑或服务器上；账号则由云端身份服务统一管控。
两套账号并存：本地账号（密码存在本地 `users` 表）和云端账号（本地只保存投影与
会话），登录页可以选择用哪一种。

## 形态

| | 本地账号 | 云端账号 |
| --- | --- | --- |
| 密码 | 本地 bcrypt | 云端，本地不保存 |
| 角色 / 权限 | 本地管理员编辑 | 云端下发，本地只读 |
| 登录 | `POST /api/auth/login` | `POST /api/auth/cloud/login` |
| 会话 | 本地 JWT | 本地 JWT + `cloud_sessions` 行（含云端 refresh token） |
| 离线 | 不受影响 | 受「离线宽限」限制 |

云端账号在 `users` 表里的 `source` 为 `cloud`，并带 `cloud_issuer` /
`cloud_subject` 作为上游身份。`(issuer, subject)` 唯一，所以云端改名不会产生新账号。
若本地已有同名账号，云端账号会得到 `name@host` 形式的本地用户名，两者互不影响。

## 云端服务协议

所有请求由本地后端发出（HTTPS，`http://127.0.0.1` 仅用于本地联调）。
客户端凭据是 `client_id` + `client_secret`，服务端保存时用本机 Fernet 密钥加密。

### `POST /api/v1/auth/token`

密码模式：

```json
{
  "grant_type": "password",
  "username": "alice",
  "password": "…",
  "otp": "123456",
  "mfa_token": "…",
  "client_id": "octop-desktop",
  "client_secret": "…",
  "scope": "openid profile email"
}
```

刷新模式：

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "…",
  "client_id": "octop-desktop",
  "client_secret": "…"
}
```

成功（200）：

```json
{
  "access_token": "…",
  "refresh_token": "…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "sub": "u_123",
    "username": "alice",
    "name": "Alice",
    "email": "alice@corp.example",
    "role": "admin",
    "permissions": ["experts", "tasks"],
    "locale": "zh",
    "tenant": "t_1"
  }
}
```

需要二次验证时返回 200（或 401）并带 `mfa_required: true`、`mfa_token`、
`methods: ["totp", "recovery"]`；本地把这些原样交给浏览器，第二次请求带上
`otp` 与 `mfa_token` 再次调用同一端点。

错误统一为 `{"error": "invalid_credentials|mfa_invalid|account_disabled|invalid_client|rate_limited", "error_description": "…"}`。
`Retry-After` 头用于 429。

### `GET /api/v1/auth/userinfo`

`Authorization: Bearer <access_token>`，返回与上面相同的 `user` 对象。token 响应
未带 `user`，或需要重新同步资料时使用。

### `POST /api/v1/auth/revoke`

`{"token": "…", "client_id": "…", "client_secret": "…"}`，登出时尽力调用。

### `GET /api/v1/health`

任意 JSON；用于后台「测试连接」。

## 本地流程

1. **登录**：云端校验 → 本地按 `(issuer, subject)` 建号或更新投影 → 写
   `cloud_sessions`（加密保存 refresh token）→ 签发本地 JWT，`cs` 声明为会话 id。
2. **请求**：`resolve_user_from_token` 对带 `cs` 的令牌校验会话未撤销、未过宽限期。
3. **续期**：本地 JWT 过期后，前端用旧 token 调 `/api/auth/cloud/refresh`；后端验签
   但忽略 `exp`，用会话里的 refresh token 向云端换新，再签发新的本地 JWT。
4. **登出**：撤销云端 token（尽力）+ 标记本地会话已撤销 + 清 cookie。
5. **设备管理**：`GET /api/auth/cloud/sessions` 列出本人仍有效的设备，
   `DELETE /api/auth/cloud/sessions/{id}` 断开单个设备，
   `DELETE /api/auth/cloud/sessions` 断开除当前设备外的全部（返回 `revoked` 数量）。
   都只作用于 `current_user` 自己的会话，未知 id 返回 404。
6. **强制下线**：管理员在用户页撤销该账号全部本地云端会话，下一次请求即 401。
7. **离线宽限**：`offline_grace_seconds` 决定会话最长可用时间；`0` 表示本地 token
   不得超过云端 token 的有效期，即必须保持在线。

## 管理端

「用户 → 云端账号」配置：服务地址、客户端 ID/密钥、显示名称、注册地址、
离线宽限、是否允许云端授予管理员、是否同步权限。保存后可测试连接、立即同步
（用各会话的 refresh token 重新拉取资料）。

云端账号在用户列表中标记为「云端」，本地不能改密码、角色、权限、禁用或删除；
这些操作由 `UserManager` 统一拒绝（`CLOUD_MANAGED_ACCOUNT`）。绑定本地
SSO 身份同样被拒绝：那会绕开云端认证。

## 用户端

- 登录页可在「本地账号 / 云端账号」之间切换；云端模式下验证码、LDAP 提示、
  找回密码入口隐藏，注册按钮指向 `signup_url`。
- 「账户安全」抽屉对云端账号只显示**登录设备**（含本机标记、上次活动、登录时间、
  断开/断开其他设备），不再显示改密码、验证器、通行密钥、恢复码——这些由云端负责。
- 「设置 → 显示名称」对云端账号只读，并提示以云端资料为准；SSO 绑定区替换为说明。

## 安全边界

- 云端 access token 从不作为本地凭证；本地总是先通过 TLS 取 `user` 文档，再签发
  自己的 JWT。
- `client_secret` 与 refresh token 都用安装级 Fernet 密钥加密存放，接口不返回。
- 云端密码只在登录请求中透传一次，不落盘、不进日志。
- 本地未配置云端服务时，`/api/auth/cloud/status` 返回 `enabled: false`，登录页
  不显示云端入口，本地账号完全不受影响。
