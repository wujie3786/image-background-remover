# image-background-remover 安全整改清单

> 基于 Codex 代码审查生成 | 日期：2026-04-12

---

## 🔴 P0 - 必须立即修复（认证安全）

### 1. 修复 Google OAuth JWT 验签
**文件**: `worker/src/index.ts`

**问题**: `verifyGoogleToken()` 只解码 payload，未验证签名，可被伪造身份登录。

**修复方案**: 使用 Google 官方 JWK 密钥验签，或调用 `https://oauth2.googleapis.com/tokeninfo` 验证 token 有效性。

```typescript
// 推荐方案：使用 fetch 验证 token
async function verifyGoogleToken(token: string): Promise<GoogleTokenInfo | null> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`)
    const info = await res.json()
    if (info.aud !== GOOGLE_CLIENT_ID) return null
    if (info.iss !== 'https://accounts.google.com') return null
    return info
  } catch {
    return null
  }
}
```

---

### 2. 修复会话令牌伪造问题
**文件**: `worker/src/index.ts`

**问题**: `makeSessionToken()` 使用明文 `btoa("${userId}:${Date.now()}")`，可被直接伪造。

**修复方案**: 使用 `lib/auth.ts` 中已有的 HMAC JWT 实现，或改用数据库 session。

```typescript
// 方案A：启用 lib/auth.ts 的 JWT（推荐）
import { signJWT, verifyJWT } from './lib/auth'

async function makeSessionToken(user: User, env: Env): Promise<string> {
  return await signJWT(
    { sub: user.id, email: user.email, name: user.name },
    env.JWT_SECRET,
    '24h' // 24小时过期
  )
}

async function parseSessionToken(token: string, secret: string) {
  return await verifyJWT(token, secret)
}
```

---

### 3. 修复前端 token 覆盖 bug
**文件**: `components/GoogleLogin.tsx` + `app/page.tsx`

**问题**: `handleLogin()` 把 `ibr_session` 从 token 覆盖成了用户 JSON 字符串，导致后续请求鉴权失败。

**修复**:
```typescript
// GoogleLogin.tsx - 只存 token
onSuccess: async (credentialResponse) => {
  const res = await fetch(`${API_BASE}/api/auth`, { ... })
  const data = await res.json()
  localStorage.setItem('ibr_session', data.token) // 只存 token
}

// app/page.tsx - 单独存 user
const handleLogin = (user) => {
  setLoggedInUser(user)
  localStorage.setItem('ibr_user', JSON.stringify(user)) // 存 user 分开
}

// apiFetch - 只取 token
const token = localStorage.getItem('ibr_session')
```

---

## 🟠 P1 - 高优先级（业务逻辑）

### 4. 配额扣减与处理原子化
**文件**: `app/page.tsx` + `worker/src/index.ts`

**问题**: 先扣配额再调 API，API 失败时配额已扣无法退还。

**修复**: 配额扣减应该发生在 remove.bg API 调用成功之后。

```typescript
// 后端：处理完成并成功后再扣减
async function handleImageProcess(request: Request, env: Env) {
  const user = await getAuthenticatedUser(request, env)
  
  // 1. 检查配额
  const canUse = await checkQuota(user.id, env)
  if (!canUse) return createError(429, 'Quota exceeded')
  
  // 2. 调用 remove.bg
  const result = await removeBg(imageData)
  
  // 3. 成功后扣减（原子操作）
  await decrementQuota(user.id, env)
  
  return json({ success: true, image: result })
}
```

---

### 5. 修复配额竞态条件
**文件**: `worker/src/index.ts`

**问题**: `SELECT count → UPDATE count + 1` 存在并发竞态。

**修复**: 使用条件更新 + affected rows 判断。

```typescript
// 使用 D1 原子更新
const result = await env.DB.prepare(
  'UPDATE usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < ?'
).bind(userId, today, limit).run()

if (result.meta.changes === 0) {
  return createError(429, 'Quota exceeded')
}
```

---

### 6. 配额扣减后端验证
**文件**: `app/page.tsx`

**问题**: 前端配额检查可被绕过（直接调用后端 API）。

**修复**: 前端不再检查配额，所有配额检查都在后端完成。

---

## 🟡 P2 - 中优先级（安全加固）

### 7. 改用 HttpOnly Cookie 存储 Token
**文件**: `worker/src/index.ts` + `components/GoogleLogin.tsx` + `app/page.tsx`

**问题**: localStorage 可被 XSS 窃取。

**修复**:
```typescript
// 后端设置 cookie
Response.json(data, {
  headers: {
    'Set-Cookie': `ibr_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
  }
})

// 前端不再读写 localStorage 的 token
```

---

### 8. 启用 TypeScript + ESLint 构建检查
**文件**: `next.config.js`

**修复**:
```javascript
const nextConfig = {
  output: 'export',
  // 删除这两行：
  // eslint: { ignoreDuringBuilds: true },
  // typescript: { ignoreBuildErrors: true },
}
```

---

### 9. 统一环境变量
**文件**: `worker/src/index.ts`

**问题**: Google Client ID 硬编码在多处。

**修复**: 全部改为 `env.GOOGLE_CLIENT_ID`

---

## 🟢 P3 - 低优先级（工程质量）

### 10. 清理包管理文件
**文件**: 根目录

**修复**: 删除 `package-lock.json` 和 `yarn.lock`，只保留 `pnpm-lock.yaml`

```bash
rm package-lock.json yarn.lock
pnpm install  # 重新生成 lockfile
```

---

### 11. 修复 README 与实际不符
**文件**: `README.md`

**问题**: 文档描述的路径、结构、部署方式与实际代码不符。

**修复**: 对照实际代码更新 README。

---

### 12. 清理架构分叉
**文件**: `worker/src/` vs `functions/` vs `lib/auth.ts`

**问题**: 多套认证实现、Drizzle schema 未被使用。

**修复**: 选择一套架构，删除死代码。

---

## 执行顺序

```
P0: 1 → 2 → 3  (认证核心，三项必须一起完成)
P1: 4 → 5 → 6  (业务逻辑)
P2: 7 → 8 → 9  (安全加固)
P3: 10 → 11 → 12 (工程质量)
```

---

## 风险评估

| 修复项 | 风险 | 影响范围 |
|--------|------|----------|
| 1. OAuth 验签 | 低 | 认证安全 |
| 2. Session 签名 | 低 | 认证安全 |
| 3. Token 覆盖 | 中 | 登录功能 |
| 4. 配额原子化 | 高 | 业务逻辑 |
| 5. 竞态条件 | 中 | 限流失效 |
| 7. HttpOnly Cookie | 低 | XSS 防护 |
| 8. 启用 TS/ESLint | 中 | 构建失败可能 |

---

*本文档由 AI 代码审查生成，建议执行前备份代码。*
