# TraeSwitch CN — 登录态保存文件清单

> 生成时间：2026-06-24  
> 用途：对比各账号登录态的实际文件内容，确认切换逻辑是否完整

---

## 一、我们的应用保存的数据

### 1. 账号数据库文件（核心）
**路径：**
```
C:\Users\云卿\AppData\Roaming\traeswitch-cn\traeswitch-cn-data.json
```
**说明：** 这是 `electron-store` 存储所有账号信息的主文件。每个账号的 `authBlob` 字段保存了从 Trae CN 捕获的加密凭证。

**关键字段（每个账号）：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `accounts[].authBlob` | Object | **最重要** — 捕获的 `iCubeAuthInfo://*` 加密 Blob 键值对 |
| `accounts[].token` | string | JWT token（用于 API 调用，非 Trae CN 启动凭证）|
| `accounts[].cookies` | string | 浏览器 Cookie 字符串（用于刷新 Token）|
| `accounts[].tenantId` | string | 租户 ID |
| `accounts[].userId` | string | 用户 ID |

**查看命令：**
```bash
cat "%APPDATA%\traeswitch-cn\traeswitch-cn-data.json" | jq '.accounts[] | {email, hasAuthBlob: (.authBlob != null), authBlobKeys: (.authBlob | keys)}'
```

---

## 二、Trae CN 本地的登录态文件

切换账号时我们需要操作这些文件：

### 2. Trae CN storage.json（最关键）
**路径：**
```
C:\Users\云卿\AppData\Roaming\Trae CN\User\globalStorage\storage.json
```
**说明：** Trae CN 启动时的主认证文件。我们切换时把目标账号的 `authBlob` 原样写回这里。

**关键键（登录后存在）：**
| 键名 | 值类型 | 说明 |
|-------|--------|------|
| `iCubeAuthInfo://icube.cloudide` | **加密 Blob** (`dGMFE` 开头) | ✅ **Trae CN 启动时任读的活跃会话键** |
| `iCubeAuthInfo://usertag` | **加密 Blob** (`dGMFE` 开头) | ✅ 用户信息标签 |
| `iCubeAuthInfo://icube-dc:<tenantId>` | 加密 Blob | 按租户持久存储的凭证 |
| `iCubeServerData://icube.cloudide` | JSON | 服务器数据 |

**查看命令：**
```bash
cat "C:\Users\云卿\AppData\Roaming\Trae CN\User\globalStorage\storage.json" | jq 'to_entries[] | select(.key | startswith("iCube")) | {key: .key, valueLength: (.value | length), valuePrefix: (.value | .[0:20])}'
```

---

### 3. Trae CN TinyStorage
**路径：**
```
C:\Users\云卿\AppData\Roaming\Trae CN\aha\TinyStorage
```
**说明：** 包含设备 ID 和访问策略，切换时清理可避免冲突。

**关键键：**
| 键名 | 说明 |
|-------|------|
| `tiny_storage_data.aha.device.device_id` | 设备唯一 ID（加密值）|
| `tiny_storage_data.aha.access_policy` | 访问策略（加密值）|

---

### 4. Trae CN Cookies 数据库
**路径（二选一）：**
```
C:\Users\云卿\AppData\Roaming\Trae CN\Network\Cookies   （Chromium 新版本）
C:\Users\云卿\AppData\Roaming\Trae CN\Cookies           （旧版本）
```
**说明：** SQLite 数据库，存储 `.trae.cn` 域名的 Cookie。**目前分析认为 Trae CN IDE 不读此文件做认证**，但清理可避免状态混乱。

**查看命令（需要 sql.js 或 DB Browser for SQLite）：**
```bash
# 用 Node.js + sql.js 查看
node -e "
const sql = require('sql.js');
const fs = require('fs');
const db = new sql.Database(fs.readFileSync('C:\\Users\\云卿\\AppData\\Roaming\\Trae CN\\Network\\Cookies'));
console.log(JSON.stringify(db.exec('SELECT host_key, name, value FROM cookies WHERE host_key LIKE \"%.trae.cn%\"')));
"
```

---

### 5. ~/.trae-cn/trae-jwt-token
**路径：**
```
C:\Users\云卿\.trae-cn\trae-jwt-token
```
**说明：** Trae CN 启动后**派生输出**的文件，给 AI Agent 子进程用。**Trae CN 启动时完全不读这个文件**，所以切换时写入它无效。

---

### 6. Trae CN Local Storage
**路径：**
```
C:\Users\云卿\AppData\Roaming\Trae CN\Local Storage\leveldb\
```
**说明：** Chromium LocalStorage，可能存储部分会话标记。

---

### 7. Trae CN Session Storage
**路径：**
```
C:\Users\云卿\AppData\Roaming\Trae CN\Session Storage\
```
**说明：** 当前会话的临时存储，关闭后失效，切换时建议清理。

---

## 三、当前切换流程操作了哪些文件

| 步骤 | 文件 | 操作 |
|------|------|------|
| 1 | `storage.json` | 删除所有 `iCubeAuthInfo://*` 键，写入目标账号的 `authBlob` |
| 2 | `aha/TinyStorage` | 清除 `device_id` 和 `access_policy` 键 |
| 3 | `Network/Cookies` | 删除 `.trae.cn` 相关 Cookie（可选）|
| 4 | `~/.trae-cn/trae-jwt-token` | 写入 JWT（**无效操作，可移除**）|
| 5 | `Local Storage` | 清理（可选）|
| 6 | `Session Storage` | 清理（可选）|

---

## 四、对比建议

### 方案 A：最小对比（推荐）
只对比 **`storage.json`** 中 `iCubeAuthInfo://*` 键的内容：
```bash
# 账号 A 登录时，保存 storage.json 快照
copy "C:\Users\云卿\AppData\Roaming\Trae CN\User\globalStorage\storage.json" storage-accountA.json

# 切换到账号 B 登录后，再保存
copy "C:\Users\云卿\AppData\Roaming\Trae CN\User\globalStorage\storage.json" storage-accountB.json

# 对比差异
fc storage-accountA.json storage-accountB.json
```

### 方案 B：完整对比
用我们应用里的"保存登录态"功能，分别捕获账号 A 和账号 B 的 `authBlob`，然后在应用的开发者工具里对比 `authBlob` 对象的键和每个键的值长度是否一致。

---

## 五、文件快速访问（在应用中点击"保存登录态"后）

我们的应用把捕获的内容存在：
```
C:\Users\云卿\AppData\Roaming\traeswitch-cn\traeswitch-cn-data.json
```

你可以用任何 JSON 编辑器（VS Code、Notepad++）打开它，找到对应账号的 `authBlob` 字段，直接查看捕获到的加密 Blob 内容。
