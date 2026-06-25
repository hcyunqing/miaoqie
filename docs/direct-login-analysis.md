# 在应用中直接登录账号 — 技术可行性分析

## 目标

实现：用户在 TraeSwitch CN 中输入账号密码（或通过 OAuth）→ 直接完成登录 → 写入 Trae CN 的认证数据 → 无需手动打开 Trae CN 登录

---

## 关键问题拆解

### 问题 1：iCubeAuthInfo 里到底存了什么？

**我们需要找到原始内容格式。**

从代码分析，`iCubeAuthInfo` 是 `safeStorage.encryptString(原始字符串)` 的结果，而 `原始字符串` 应该是一个 JSON 对象，包含：
- 用户认证 token
- 用户信息（email、name、avatar）
- tenantId / org 信息
- token 过期时间

**获取原始内容的方法**：  
修改 Trae CN 的 `main.js`，在启动时自动解密并输出到日志文件。

---

### 问题 2：我们能否用 Trae CN 的加密方式加密数据？

#### 加密方式分析

Trae CN 使用 `electron.safeStorage`：

```javascript
// Trae CN 的加密服务 (EncryptionMainService)
async encrypt(e) {
  const i = JSON.stringify(safeStorage.encryptString(e));
  return i;
}
async decrypt(e) {
  const i = JSON.parse(e);
  const r = Buffer.from(i.data);
  const n = safeStorage.decryptString(r);
  return n;
}
```

**Windows 上 `safeStorage` 的原理**：
- 使用 **DPAPI** (`CryptProtectData`)
- 加密密钥由 **Windows 用户 SID + 应用路径（exe 路径）** 决定
- **结论**：`TraeSwitch CN.exe` 无法解密 `Trae CN.exe` 加密的数据，反之亦然

#### 可能的绕过方案

| 方案 | 可行性 | 说明 |
|------|--------|------|
| **A. 让 Trae CN 启动参数 `--password-store=basic`** | ✅ 高 | 让 Trae CN 使用明文存储，但会影响已有数据 |
| **B. 注入代码到 Trae CN 进程进行加密** | ✅ 中 | 通过 `--js-flags` 或 patch main.js |
| **C. 复制 Trae CN 的 exe 名** | ❌ 低 | DPAPI 绑定 exe 路径，复制 exe 名仍不行 |
| **D. 找到 Trae CN 的加密密钥** | ❌ 低 | 密钥在 Windows 密钥库中，无法提取 |

---

### 问题 3：利用 API 直接登录

根据 `API.md`，我们有两个 API：

```
POST /cloudide/api/v3/trae/GetUserInfo   ← 需要 Cookie（已登录的 Session）
POST /cloudide/api/v3/common/GetUserToken ← 需要 Cookie
```

**问题**：这两个 API 都是「读取」接口，需要已经有 Cookie/Token 才能调用。  
**我们缺少的是「登录」接口** —— 用账号密码换取 Cookie 的接口。

#### 需要找到的 API

| 接口 | 用途 |
|------|------|
| `POST /.../Login` 或 `Authorization` | 账号密码 → Session Cookie |
| `POST /.../OAuthCallback` | OAuth 回调处理 |
| `POST /.../RefreshToken` | 用 refresh_token 刷新 access_token |

---

## 推荐实现方案

### 方案：Patch Trae CN 的 main.js（最可行）

**思路**：不自己加密，而是让 Trae CN 自己加密。

#### 步骤

**1. 修改 Trae CN 的 `main.js`**，添加一段代码：

```javascript
// 在 main.js 开头添加（解密并输出 iCubeAuthInfo 的内容）
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const storagePath = path.join(
  process.env.APPDATA,
  'Trae CN',
  'User',
  'globalStorage',
  'storage.json'
);

if (fs.existsSync(storagePath)) {
  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  const output = {};
  for (const [key, value] of Object.entries(storage)) {
    if (key.startsWith('iCubeAuthInfo://')) {
      try {
        const parsed = JSON.parse(value);
        const buf = Buffer.from(parsed.data);
        const decrypted = safeStorage.decryptString(buf);
        output[key] = { encrypted: value, decrypted: decrypted };
      } catch (e) {
        output[key] = { encrypted: value, error: e.message };
      }
    }
  }
  const logPath = path.join(process.env.APPDATA, 'Trae CN', 'decoded-auth.json');
  fs.writeFileSync(logPath, JSON.stringify(output, null, 2));
  console.log('Decoded auth written to', logPath);
}
```

**2. 启动 Trae CN** → 生成 `decoded-auth.json` → 看到 `iCubeAuthInfo` 的原始内容

**3. 分析原始内容格式** → 构造相同格式的数据

**4. 实现反向流程**（写入时调用 `safeStorage.encryptString()`）

---

## 更简单的方案（推荐）

### 不解码，直接利用浏览器登录

**思路**：TraeSwitch CN 内置一个小的浏览器窗口（用 `electron <webview>` 或 `BrowserWindow`），加载 Trae CN 的登录页面，用户完成登录后，从浏览器 Cookie 中读取 Session，然后调用 API 获取用户信息。

```
用户点击「添加账号」
    ↓
打开浏览器窗口 → 加载 Trae CN 登录页面（OAuth）
    ↓
用户完成登录
    ↓
从浏览器 Cookie 中读取 Session/Token
    ↓
调用 API 获取用户信息
    ↓
将认证数据写入 Trae CN 的 storage.json（通过 patch main.js 实现加密）
    ↓
完成
```

**关键技术点**：
1. 找到 Trae CN 登录页面的 URL（OAuth 入口）
2. 从浏览器 Cookie 中读取登录后的 Session
3. 用 Session 调用 API 获取用户信息和 Token
4. **将 Token 加密写入 `iCubeAuthInfo`**（需要 patch Trae CN 的 main.js）

---

## 需要你提供的信息

1. **Trae CN 的登录页面 URL 是什么？**（OAuth 入口）
2. **除了 `GetUserInfo` 和 `GetUserToken`，还有哪些 API 接口？**（特别是登录接口）
3. **`iCubeAuthInfo` 解密后的内容是什么？**（需要按上面的方案 patch main.js 后查看）

---

## 结论

| 目标 | 可行性 | 方案 |
|------|--------|------|
| 在应用中直接登录 | ✅ | 内置浏览器 → OAuth 登录 → 读取 Cookie → 调用 API |
| 将登录数据写入 Trae CN | ⚠️ 中 | 需要 patch Trae CN 的 main.js，让 Trae CN 自己加密数据 |
| 完全不依赖 Trae CN | ❌ | 无法复制 `safeStorage` 的加密 |

**下一步**：
1. 我帮你 patch `main.js`，输出 `iCubeAuthInfo` 的解密内容
2. 你提供 Trae CN 登录页面的 URL
3. 我们一起实现「内置浏览器登录」功能
