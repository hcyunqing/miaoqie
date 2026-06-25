# iCubeAuthInfo Blob 解码分析

## 结论：**无法直接解码，但有间接方案**

---

## 技术分析结果

### 1. 加密方式
在 `D:\Program Files (x86)\Trae CN\resources\app\out\main.js` 中找到 `EncryptionMainService`：

```javascript
// EncryptionMainService 核心代码
import { safeStorage as i0e, app as r0e } from "electron";

async encrypt(e) {
  const i = JSON.stringify(su.encryptString(e));
  return i;
}

async decrypt(e) {
  const i = JSON.parse(e);
  const r = Buffer.from(i.data);
  const n = su.decryptString(r);  // 调用 Electron safeStorage
  return n;
}
```

**关键发现**：
- `iCubeAuthInfo` 的值 = `safeStorage.encryptString(原始字符串)` 的结果，再 `JSON.stringify()`，再 Base64 编码
- 解密必须由 **同一个 Electron 应用** 调用 `safeStorage.decryptString()` 才能完成

### 2. 为什么我们不能直接解码？

`safeStorage` 的加密后端：
| 平台 | 加密方式 |
|------|-----------|
| Windows | **DPAPI** (`CryptProtectData`) — 密钥由 Windows 用户账户 + 应用路径决定 |
| macOS | Keychain |
| Linux | libsecret / kwallet |

**DPAPI 的关键特性**：
- 加密时绑定了当前 Windows 用户 SID
- 即使在同一台机器上，不同应用（不同 `.exe` 文件名）也无法互相解密
- 所以 `TraeSwitch CN` 无法解密 `Trae CN` 写入的 `safeStorage` 数据

### 3. Blob 的实际格式

以 `dGMFEAAAjC2WM0yt8z+dNeMQbabKNBoAsAB/6YDNwnsmr81pCnT8sGVlTIpZqYRoxGqojKIeEP4p0O3bbyYNs0bV1Ua6cx7VOsVRWhU16UJxIKBUyKMFzcn99T2tAZmpPLvXGoxreg97xON0pzLLVos0ZLYEoAlztrW9Fst386m1JkwtWFGs+6Qk2+Xcxv+PlUj9J715` 为例：

```
解码步骤（需要在 Trae CN 进程中执行）：
1. Base64 解码 → 得到 JSON 字符串
2. JSON.parse() → 得到 { data: <number array> }
3. Buffer.from(data) → 得到加密后的 Buffer
4. safeStorage.decryptString(buffer) → 得到原始字符串
```

---

## 间接解码方案

### 方案 A：让 Trae CN 自己输出解密内容（推荐）

修改 `main.js`，在 Trae CN 启动时自动解密并输出 `iCubeAuthInfo`：

1. 关闭 Trae CN
2. 修改 `D:\Program Files (x86)\Trae CN\resources\app\out\main.js`
3. 在文件开头添加代码，读取 `storage.json` 并调用 `EncryptionMainService.decrypt()`
4. 将解密结果写到日志文件

**我要不要帮你生成这个补丁代码？**

### 方案 B：通过 IPC 连接到运行中的 Trae CN

如果 Trae CN 暴露了 IPC server（VSCode 架构通常有），可以：
1. 启动 Trae CN
2. 通过 `--driver` 或类似参数连接到主进程
3. 调用 `EncryptionMainService.decrypt()` 方法

需要研究 Trae CN 是否支持此功能。

### 方案 C：接受现状，不解码

**其实我们不需要解码**。`iCubeAuthInfo` 里存的是什么并不重要，因为：

1. 当前「捕获-恢复」方案已经完美工作
2. 切换账号时原样保存和恢复加密 blob 即可
3. Trae CN 自己会解密它

---

## 你要不要试试方案 A？

如果你想知道 blob 里到底是什么内容，我可以帮你修改 `main.js`，让 Trae CN 下次启动时把解密后的 `iCubeAuthInfo` 输出到日志文件。

**需要我生成补丁代码吗？**
