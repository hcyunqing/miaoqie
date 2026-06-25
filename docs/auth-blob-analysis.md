# iCubeAuthInfo Blob 格式分析

## 分析结果

### Base64 解码后结构

`dGMFE` 解码后为 `74 63 05 10`（即 `tc\x05\x10`），不是可读字符串。

```
偏移      内容                   说明
================================================
0x00     74 63 05 10           Magic Header ("tc" + 版本/标志)
0x04     XX XX XX XX           未知（可能是长度或标志）
0x08     ...                  加密数据
```

### 关键发现

1. **数据已加密**：字节频率卡方检验值 ~282，接近随机数据（~293），说明是加密后的二进制数据，不是明文 Base64 编码。

2. **大小 mod 16 = 6**：说明密文不是标准的 AES 块对齐格式，可能包含自定义头部。

3. **不同 key 的 blob 大小不同**：
   - `iCubeAuthInfo://usertag` → 150 bytes
   - `iCubeAuthInfo://icube-dc:1124132644771876` → 582 bytes  
   - `iCubeAuthInfo://icube.cloudide` → 1862 bytes
   
   说明不同 key 存储的内容大小不同（usertag 较小，主认证 token 最大）。

### 可能的加密方式

Trae CN 可能使用了以下几种加密方式之一：

#### A. Electron `safeStorage`（最可能）
- 使用 OS 提供的加密 API：
  - **Windows**: DPAPI (`CryptProtectData`) — 密钥由 Windows 用户账户保护
  - **macOS**: Keychain
  - **Linux**: 密码存储（GNOME Keyring / KWallet）
- **特点**：加密后的数据只能在同一台机器的同一个 Windows 用户下解密
- **结论**：如果用了这个方法，**我们无法自行解密**（除非调用 Trae CN 自己的代码）

#### B. 硬编码密钥 + AES
- 代码中有一个固定的密钥，用来加密/解密 `iCubeAuthInfo`
- **可以破解**：只要找到 Trae CN 的源码中的密钥

#### C. 机器特征派生密钥
- 用 MAC 地址、机器 GUID 等派生密钥
- 即使找到算法，也只能在本机解密

---

## 我们能不能解码？

### 短期答案：**目前不能直接解码**

因为：
1. 我们不知道加密密钥
2. 我们不知道具体加密算法（AES-256-CBC? AES-256-GCM? ChaCha20?）
3. 数据目录中没有明文副本

### 破解方法：找到 Trae CN 的加密代码

需要搜索 Trae CN 安装目录中的 JS 文件，找到：
- `iCubeAuthInfo` 的读写位置
- `encrypt` / `decrypt` 函数
- `safeStorage` 的调用
- 硬编码的密钥字符串

---

## 建议操作

**请提供 Trae CN 的安装目录路径**（即 `Trae CN.exe` 所在目录），通常位于：
- `C:\Users\云卿\AppData\Local\Programs\Trae CN\`
- 或 `C:\Program Files\Trae CN\`

拿到路径后，我们可以：
1. 搜索 `.js` 文件中包含 `iCubeAuthInfo` 的代码
2. 找到加密/解密逻辑
3. 尝试提取密钥或直接利用该逻辑解码

---

## 替代方案（推荐）

如果解码太复杂，**当前已经实现的「捕获-恢复」方案已经足够好用**：

1. 用户手动登录 Trae CN → 生成合法的加密 blob
2. 我们用 `captureICloudAuthInfo()` 保存这个 blob
3. 切换账号时，用 `restoreICloudAuthInfo()` 写回

**这个方案完全绕过了「解码」问题**，因为：
- 我们不需要知道加密内容是什么
- 我们只需要原样保存和还原加密 blob
- Trae CN 自己会解密它

---

## 结论

| 方案 | 可行性 | 工作量 |
|------|--------|--------|
| 解码 `iCubeAuthInfo` blob | 低（需要逆向） | 高 |
| 继续用「捕获-恢复」方案 | **高** | **低**（已完成） |
| 找到 Trae CN 源码中的密钥 | 中 | 中 |

**建议**：除非有特殊需求（比如要修改 blob 内容），否则当前的「捕获-恢复」方案是最简单可靠的。
