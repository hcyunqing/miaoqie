# iCubeAuthInfo 加密分析 — 最终结论

## 重大发现

### `iCubeAuthInfo://icube-dc:<tenantId>` 是明文 Base64 JSON！

通过分析 `storage.json` 中的实际数据，发现 `iCubeAuthInfo://icube-dc:<tenantId>` 键的值是 **Base64 编码的明文 JSON**，不是加密数据！

```json
// Base64 解码后的明文内容
{
  "token": "eyJhbGciOiJSUzI1NiIs...",  // JWT token (来自 GetUserToken API)
  "refreshToken": "",                     // 空字符串
  "expiredAt": 1782331203,               // Unix 时间戳（秒），来自 JWT 的 exp 字段
  "userId": "508444614343113"            // 用户 ID (来自 GetUserInfo/GetUserToken API)
}
```

### 所有 iCubeAuthInfo 键的分类

| 键名 | 格式 | 内容 | 能否构造 |
|------|------|------|----------|
| `iCubeAuthInfo://icube-dc:<tenantId>` | **Base64(明文JSON)** | token, userId, expiredAt | **✅ 可以！** |
| `iCubeAuthInfo://icube-dc:<numericId>` | 加密 (`tc\x05\x10`前缀) | 未知 | ❌ 无法构造 |
| `iCubeAuthInfo://icube.cloudide` | 加密 (`tc\x05\x10`前缀) | 未知 | ❌ 无法构造 |
| `iCubeAuthInfo://usertag` | 加密 (`tc\x05\x10`前缀) | 未知 | ❌ 无法构造 |
| `iCubeServerData://icube.cloudide` | 明文 JSON | 权益信息 | ✅ 可选 |

### 加密值的解密尝试（全部失败）

对 `tc\x05\x10` 前缀的加密值尝试了以下方法：
1. ❌ AES-256-GCM（使用 Local State 中的 AES key，4字节前缀 + 12字节nonce + 密文 + 16字节tag）
2. ❌ AES-256-GCM（tag 在前）
3. ❌ AES-256-GCM（3字节前缀）
4. ❌ AES-256-GCM（无前缀）
5. ❌ AES-256-CBC
6. ❌ DPAPI 直接解密
7. ❌ 替换前缀为 v10

**结论**：加密值使用了未知的加密方式，可能是 Trae CN 自定义的加密算法，不是标准的 Electron `safeStorage`。

---

## 实现方案

### 核心思路：只写明文 key，让 Trae CN 自己补充加密 key

从 API 获取的数据可以构造 `iCubeAuthInfo://icube-dc:<tenantId>` 键：

```
API 数据 → 构造 JSON → Base64 编码 → 写入 storage.json
```

### 数据映射

| iCubeAuthInfo 字段 | API 来源 |
|---------------------|----------|
| `token` | `GetUserToken` API 的 `Result.Token` |
| `refreshToken` | 空字符串 `""` |
| `expiredAt` | JWT 的 `exp` 字段（Unix 秒），或 `GetUserToken` API 计算得出 |
| `userId` | `GetUserInfo` 或 `GetUserToken` API 的 `UserID` |
| **key 中的 tenantId** | `GetUserInfo` 或 `GetUserToken` API 的 `TenantID` |

### 切换流程

1. 从账号数据中获取 token、userId、tenantId
2. 从 JWT 中解析 `exp` 作为 `expiredAt`
3. 构造 JSON: `{token, refreshToken: "", expiredAt, userId}`
4. `Base64.encode(JSON.stringify(json))` 得到值
5. 删除 storage.json 中所有旧的 `iCubeAuthInfo://*` 键
6. 写入 `iCubeAuthInfo://icube-dc:<tenantId>` = Base64 值
7. 启动 Trae CN

### 风险评估

- **如果 Trae CN 只需要 `icube-dc:<tenantId>` key 就能启动**：✅ 完美工作
- **如果 Trae CN 还需要加密 key**：Trae CN 会用 token 重新调 API 获取数据并写入加密 key
- **最坏情况**：Trae CN 需要所有 key 才能启动 → 回退到 capture-restore 方案

### 与现有方案的关系

| 方案 | 适用场景 |
|------|----------|
| **明文构造（新）** | 浏览器登录的新账号，没有历史加密数据 |
| **capture-restore（现有）** | 从 Trae CN 导入的账号，已有加密数据 |
| **混合方案** | 如果有 authBlob 就用 capture-restore，没有就用明文构造 |

---

## 代码实现

在 `trae-switcher.js` 中新增 `writePlaintextAuthToStorage()` 函数：

```javascript
function writePlaintextAuthToStorage(account) {
  // 构造明文 JSON
  const authData = {
    token: account.token,
    refreshToken: '',
    expiredAt: parseJwtExp(account.token),  // 从 JWT 中提取 exp
    userId: account.userId,
  };
  
  // Base64 编码
  const value = Buffer.from(JSON.stringify(authData)).toString('base64');
  
  // 写入 storage.json
  const key = `iCubeAuthInfo://icube-dc:${account.tenantId}`;
  // 删除旧 iCubeAuthInfo://* 键，写入新键
}
```
