# Trae CN main.js Patch 说明

## 目标
让 TraeSwitch CN 能在不启动 Trae CN GUI 的情况下，把认证数据加密写入 `storage.json`。

## 方案
Patch `D:\Program Files (x86)\Trae CN\resources\app\out\main.js`，增加以下功能：

### 1. 读取外部认证文件
在 `main.js` 早期（在 `app.whenReady()` 之前或之后立即）加一段代码：
- 检查是否存在 `~/.traeswitch-cn/pending-auth.json`
- 如果存在，读取其中的明文认证数据
- 用 `safeStorage.encryptString()` 加密
- 写入 `storage.json` 的 `iCubeAuthInfo://*` 键
- 删除 `pending-auth.json`
- 退出应用（如果不带 `--no-exit` 参数）

### 2. 命令行参数
增加 `--import-auth=<path>` 参数，指定认证文件路径。

### 3. 实现步骤

#### Step 1: 找到 `app.whenReady()` 的位置
在 `main.js` 里搜索 `app.whenReady()`，在它的 `.then()` 里加代码。

#### Step 2: 加认证导入逻辑
```javascript
// 在 app.whenReady() 的回调里，早期执行
const pendingAuthPath = path.join(os.homedir(), '.traeswitch-cn', 'pending-auth.json');
if (fs.existsSync(pendingAuthPath)) {
  try {
    const authData = JSON.parse(fs.readFileSync(pendingAuthPath, 'utf-8'));
    // authData 格式: { iCubeAuthInfo: { key: plaintextJson } }
    // 读取现有 storage.json
    const storagePath = path.join(app.getPath('userData'), 'User', 'globalStorage', 'storage.json');
    let storage = {};
    if (fs.existsSync(storagePath)) {
      storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
    }
    // 加密并写入
    for (const [key, plaintext] of Object.entries(authData.iCubeAuthInfo || {})) {
      const encrypted = app.encryptString(plaintext); // 注意：实际 API 是 safeStorage.encryptString
      storage[key] = encrypted;
    }
    fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2));
    fs.unlinkSync(pendingAuthPath);
    console.log('[patch] 认证数据已导入');
  } catch (e) {
    console.error('[patch] 导入认证数据失败:', e);
  }
}
```

#### Step 3: 但问题是 `safeStorage` 还没初始化
`app.whenReady()` 之前不能调用 `safeStorage`。需要在 `app.whenReady()` 之后。

#### Step 4: 更好的方案 — 用 `safeStorage` 的同步 API
实际上，`safeStorage` 在 `app.whenReady()` 之后才可用。所以我们需要在 `app.whenReady()` 的回调里加代码。

### 4. 实际 Patch 位置
在 `main.js` 里搜索 `app.whenReady()`，然后在它的 `.then(() => { ... })` 里加代码。

但 `main.js` 是打包后的单行文件，需要找到正确的位置。

### 5. 简化方案（推荐）
不在 `main.js` 里 Patch，而是写一个独立的 Node.js 脚本，用 `child_process` 启动 Trae CN 并传递参数，让它在启动早期完成认证导入。

但这需要 Trae CN 配合（即需要 Patch）。

### 6. 最终方案
我决定写一个 Python/Node 脚本，直接调用 Windows 的 DPAPI API 来加密数据（模拟 `safeStorage.encryptString()` 的行为）。

但 DPAPI 加密后的数据格式需要跟 `safeStorage.encryptString()` 的输出一致。

### 7. 研究 `safeStorage.encryptString()` 的输出格式
从我们之前的 `authBlob` 分析来看，`safeStorage.encryptString()` 的输出是：
- 前缀 `dGMFE`（即 `74 63 05 10`）
- 后面是加密后的数据

这个格式是 Electron 自定义的。要模拟它，需要知道 Electron 的加密逻辑。

Electron 源码里，`safeStorage` 在 Windows 上的实现：
- 用 `CryptProtectData` 加密
- 输出格式：`[4 bytes: magic "tc\x05\x10"][4 bytes: length][...encrypted data]`

所以，我们可以用 Node.js 的 `node-ffi` 或 PowerShell 调用 `CryptProtectData` API 来加密。

但 `node-ffi` 安装麻烦。用 PowerShell 更简单。

### 8. PowerShell DPAPI 加密脚本
```powershell
# encrypt-dpapi.ps1
param($Plaintext)

Add-Type -AssemblyName System.Security

$data = [System.Text.Encoding]::UTF8.GetBytes($Plaintext)
$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
$entropy = $null
$encrypted = [System.Security.Cryptography.ProtectedData]::Protect($data, $entropy, $scope)

# 加 Electron 的 magic header
$magic = [byte[]]@(0x74, 0x63, 0x05, 0x10)
$length = [BitConverter]::GetBytes([uint32]$encrypted.Length)
$result = New-Object byte[] ($magic.Length + $length.Length + $encrypted.Length)
$magic.CopyTo($result, 0)
$length.CopyTo($result, 4)
$encrypted.CopyTo($result, 8)

[Convert]::ToBase64String($result)
```

但这个脚本输出的 Base64 应该跟 `safeStorage.encryptString()` 的输出一样。

### 9. 测试方案
1. 用 Trae CN 登录，拿到一个 `iCubeAuthInfo` 的 blob（Base64）
2. 解码 Base64，去掉前 8 字节（magic + length），得到加密数据
3. 用 PowerShell 解密（调用 `ProtectedData.Unprotect`）,应该得到明文
4. 如果成功，说明 DPAPI 是可用的
5. 然后测试加密：用 PowerShell 加密明文，加 magic header，Base64 编码，写入 `storage.json`
6. 启动 Trae CN，看能否识别

### 10. 但还有问题
`CryptProtectData` 的熵（entropy）参数。`safeStorage.encryptString()` 可能用了固定的 entropy（跟 exe 路径相关）。

如果 entropy 不同，加密后的数据也无法被对方解密。

### 11. 结论
最可靠的方法还是 Patch `main.js`。

## 实施计划
1. 先完成 `browser-login.js` 和 `main.js` 的对接，让"弹窗登录 → 获取 Cookie"流程跑通
2. 存储 Cookie 到账号
3. 写一个 Patch 脚本，自动 Patch `main.js`（用字符串替换）
4. 切换账号时，先把认证数据写入 `pending-auth.json`，然后启动 Trae CN（它会在早期读取并加密写入 `storage.json`，然后退出）
5. 再正常启动 Trae CN

## 现在先做第 1 步
修改 `account-store.js`，增加 `addAccountByCookie` 方法。
