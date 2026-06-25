# TraeHop CN 区适配分析 & 改造方案

> 分析时间：2026-06-24
> 基于对实际运行的 Trae CN 环境（23个进程）的完整检测

---

## 一、核心发现：两个版本架构根本不同

通过对比你机器上实际存在的两个版本的数据目录，发现架构差异远比预期大：

| 维度 | Trae 国际版 | Trae CN |
|------|-----------|---------|
| 进程名 | `Trae.exe` | `Trae CN.exe` |
| 安装路径 | `%LOCALAPPDATA%\Programs\Trae\Trae.exe` | `D:\Program Files (x86)\Trae CN\Trae CN.exe` |
| 数据目录 | `%APPDATA%\Trae` | `%USERPROFILE%\.trae-cn` |
| 认证存储 | `User/globalStorage/storage.json`（加密） | `trae-jwt-token`（明文 JWT） |
| machineId | `machineid` 文件存在 | ❌ 不存在 |
| User/ 目录 | ✅ 标准 VSCode 结构 | ❌ 完全不存在 |
| state.vscdb | ✅ 存在 | ❌ 不存在 |
| API 域名 | `api-sg-central.trae.ai` | `api.trae.com.cn` |
| Web 域名 | `www.trae.ai` | `www.trae.com.cn` |
| 注册表键 | `HKCU\Software\com.trae.app` | 未知（reg 被安全策略阻止） |

### 🔴 最关键差异：数据存储机制完全不同

```
国际版：
  %APPDATA%\Trae\
    User/globalStorage/storage.json    ← iCubeAuthInfo (加密)
    User/globalStorage/state.vscdb     ← SQLite 状态
    machineid                           ← 设备标识

CN 版：
  %USERPROFILE%\.trae-cn\
    trae-jwt-token                     ← 裸 JWT token（无加密）
    （没有 User/、machineid、storage.json）
```

**CN 版用的是一个极度简化的数据模型**：整个会话状态就是 `trae-jwt-token` 这一个文件。这意味着：
- ✅ **好处**：切号逻辑会简单很多，直接替换这个文件即可
- ⚠️ **风险**：没有 entitlements、serverData 等持久化，切换后可能需要依赖服务端重新下发
- ⚠️ **风险**：如果 CN 也用 machineId 做设备验证，需要在别处找

---

## 二、API 层分析

### 域名确认
```
api.trae.com.cn         → 返回 404（需要完整 API 路径）
www.trae.com.cn          → 返回 301（重定向到某处）
```

### JWT Token 结构确认

你的 CN token：
```json
{
  "data": {
    "id": "103811320653827",
    "tenant_id": "7o2d894p7dr0o4",
    "type": "user",
    "user_id": "103811320653827"
  },
  "exp": 1782849633,
  "iat": 1782244833,
  "iss": "trae"
}
```

与国际版 JWT 结构一致（`data.id` / `data.tenant_id` / `iss: "trae"`），同一个 issuer。

### API 路径推测

国际版的 API 路径：
- `POST /cloudide/api/v3/common/GetUserToken` → 用 cookie 刷新 token
- `POST /cloudide/api/v3/trae/GetUserInfo` → 获取用户信息
- `POST /trae/api/v1/pay/user_current_entitlement_list` → 获取用量/权益

CN 版大概率使用相同路径，只是 base URL 变为 `https://api.trae.com.cn`。

---

## 三、改造方案

### 方案选择：双模式（推荐）

在设置中增加 `Trae 版本` 选项，用户在 **国际版** 和 **CN 版** 之间切换。每个版本有独立的：
- 进程名
- 数据目录
- API 端点
- 登录 URL
- 切换逻辑

**优点**：一个工具管理两种版本，代码改动集中，不影响现有功能。

### 涉及文件清单（共 8 个文件）

| 优先级 | 文件 | 改动量 | 说明 |
|--------|------|--------|------|
| 🔴 P0 | `platform-config.js` | 大 | 新增 `getTraeCNConfig()`，增加 variant 参数 |
| 🔴 P0 | `trae-switcher.js` | 大 | 进程名/路径/切换逻辑分叉 |
| 🔴 P0 | `trae-api.js` | 中 | 新增 `API_BASE_CN`，APIs 增加 CN 端点 |
| 🔴 P0 | `browser-login.js` | 小 | 登录 URL 改为 CN 域名 |
| 🟡 P1 | `trae-cleaner.js` | 中 | 进程名、数据路径、注册表键分叉 |
| 🟡 P1 | `trae-reader.js` | 中 | CN 读取 `trae-jwt-token` 而非 `storage.json` |
| 🟢 P2 | `account-store.js` | 小 | 新增 variant 设置项 |
| 🟢 P2 | `main.js` | 小 | 透传 variant 参数 |
| 🟢 P2 | `src/` (前端) | 小 | 设置页增加版本选择 UI |

---

## 四、逐文件详细改动

### 4.1 `platform-config.js` — 🔴 核心枢纽

当前结构：
```js
getPlatformConfig() → 根据 process.platform 返回 mac/win 配置
```

改造后：
```js
getPlatformConfig(variant = 'intl') → 先选 variant，再选 platform
```

需要新增的 CN 配置：

```js
function getWinCNConfig() {
  const home = os.homedir();
  const appSupport = path.join(home, '.trae-cn');   // ← 核心差异
  const localAppData = process.env.LOCALAPPDATA || ...;

  return {
    platform: 'win32',
    label: 'Windows (CN)',
    variant: 'cn',
    appSupportBase: appSupport,           // → C:\Users\云卿\.trae-cn
    tokenFilePath: path.join(appSupport, 'trae-jwt-token'),  // ← 新增：token 文件路径
    machineIdPath: path.join(appSupport, 'machineid'),       // 路径不同但同名
    defaultTraeApp: path.join('D:\\Program Files (x86)\\Trae CN\\Trae CN.exe'),  // ← 硬路径
    processName: 'Trae CN.exe',           // ← 新增：进程名
    dataSubdirs: CN_DATA_SUBDIRS,         // ← CN 专属子目录
    cachePaths: [
      path.join(localAppData, 'Trae CN'),           // 推测的缓存路径
      path.join(localAppData, 'trae-cn-updater'),
    ],
    winAppCacheDirs: CN_WIN_APP_CACHE_DIRS,
    preferenceFiles: [],
    apiBase: 'https://api.trae.com.cn',    // ← 新增：API 端点
    webOrigin: 'https://www.trae.com.cn',  // ← 新增：登录/Referer
    registryKey: 'HKCU\\Software\\com.trae.cn.app',  // 推测
  };
}
```

**关键问题**：CN 的数据子目录列表可能与国际版完全不同。需要在实际切换后观察哪些文件/目录被创建了。

### 4.2 `trae-switcher.js` — 🔴 切换核心

这是改动最大的文件，需要根据 variant 分叉几乎所有函数：

```js
// 需要改动的地方：

1. isTraeRunning() 
   → CN: processName = config.processName  // "Trae CN.exe"
   → tasklist /FI "IMAGENAME eq Trae CN.exe"

2. killTrae()
   → CN: taskkill /IM "Trae CN.exe"

3. getTraeDataPath()
   → 已经通过 getPlatformConfig() 获取，天然支持

4. switchTraeAccount(account)  ← 核心改动
   → 国际版：写 storage.json + machineid
   → CN 版：写 trae-jwt-token（没有 storage.json！）

5. writeTraeLoginInfo()  ← 国际版专有
   → CN 不需要（没有 storage.json 结构）

6. writeCNToken(token)
   → 新增函数：直接写 fs.writeFileSync(trae-jwt-token, token)

7. resolveTraeAppPath()
   → CN: 搜索 D:\Program Files (x86)\Trae CN\ 等候选路径

8. openTrae()
   → 不变（spawn 路径即可）

9. clearLoginCache()
   → CN: 可能需要清理不同的缓存文件
```

**CN 版 switchTraeAccount 简化版**：
```js
async function switchTraeAccountCN(account) {
  killTrae();                          // kill "Trae CN.exe"
  
  const config = getPlatformConfig('cn');
  const tokenPath = config.tokenFilePath;
  
  // 直接替换 token 文件
  fs.writeFileSync(tokenPath, account.token, 'utf8');
  
  // 如果有 machineId，也写入
  if (account.machineId) {
    fs.writeFileSync(config.machineIdPath, account.machineId, 'utf8');
  }
  
  execSync('sleep 0.5');
  openTrae();
  
  return { machineId: account.machineId };
}
```

### 4.3 `trae-api.js` — 🟡 API 端点

```js
// 新增
const API_BASE_CN = 'https://api.trae.com.cn';
const WEB_ORIGIN_CN = 'https://www.trae.com.cn';

// buildHeaders 接受 variant 参数
function buildHeaders(token, variant = 'intl') {
  return {
    ...,
    Origin: variant === 'cn' ? WEB_ORIGIN_CN : 'https://www.trae.ai',
    Referer: variant === 'cn' ? WEB_ORIGIN_CN + '/' : 'https://www.trae.ai/',
  };
}

// getUserToken、getUserInfoWithToken、getUsageSummary、validateToken
// 都需要在 endpoint 数组前加入 API_BASE_CN
```

### 4.4 `browser-login.js` — 🟡 登录入口

```js
// loginWindow.loadURL 需要根据 variant 变
function startBrowserLogin({ variant, ... }) {
  // ...
  const loginUrl = variant === 'cn' 
    ? 'https://www.trae.com.cn' 
    : 'https://www.trae.ai';
  loginWindow.loadURL(loginUrl);
}

// Cookie domain 过滤也要扩展
function collectSessionCookies(loginWindow) {
  // ...
  .filter(c => c.domain.includes('trae.ai') || c.domain.includes('trae.com.cn'))
}
```

### 4.5 `trae-cleaner.js` — 🟡 清理逻辑

```js
// killProcessesWin 增加 CN 进程
const images = ['Trae.exe', 'Trae CN.exe', ...];

// resetPreferencesWin 增加 CN 注册表
// cleanAppData: 使用 config.appSupportBase（自动适配）
// cleanCaches: 使用 config.cachePaths（自动适配）
```

### 4.6 `trae-reader.js` — 🟡 读取当前登录

```js
// CN 版读取 token 的方式完全不同：
async function readCNToken() {
  const config = getPlatformConfig('cn');
  const tokenPath = config.tokenFilePath;
  
  if (!fs.existsSync(tokenPath)) {
    throw new Error('未找到 Trae CN 登录信息');
  }
  
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  const jwt = parseJwtPayload(token);
  
  return {
    token,
    userId: jwt.userId,
    source: 'trae-jwt-token',
    // CN 没有 storage.json，所以没有 encrypted 字段
  };
}

// readCurrentTraeToken 需要路由
async function readCurrentTraeToken(variant = 'intl') {
  if (variant === 'cn') return readCNToken();
  return readFromStorage(); // 原有逻辑
}
```

### 4.7 `account-store.js` — 🟢 设置项

```js
// 新增 variant 设置
const DEFAULT_SETTINGS = {
  ...,
  traeVariant: 'intl',  // 'intl' | 'cn'
};

// getPlatformConfig() 调用处透传 variant
const config = getPlatformConfig(settings.traeVariant);
```

### 4.8 前端 `src/` — 🟢 设置 UI

在设置页面新增一个下拉选择：
```
Trae 版本:  [ 国际版 ▼ ]  或  [ CN 版 ▼ ]
```

---

## 五、风险 & 不确定项

| # | 风险 | 严重度 | 缓解措施 |
|---|------|--------|---------|
| 1 | CN 的 `machineid` 机制未知 | 🔴 高 | 需要测试：删除 token 后重新登录，观察 CN 是否创建 machineid 文件 |
| 2 | CN 是否需要写 storage.json | 🔴 高 | 当前未发现，但可能是 CN 还没有创建。需要测试切换后 CN 的行为 |
| 3 | CN 的注册表键名不确定 | 🟡 中 | reg 命令被安全策略阻止，无法验证。可能需要手动查看 |
| 4 | `preload.js` 注入脚本需要适配 CN | 🟡 中 | login-preload.js 的 fetch hook 可能需要对 `trae.com.cn` 做额外处理 |
| 5 | CN 的 `GetUserToken` API 路径可能不同 | 🟡 中 | 大概率相同但未验证，首次测试时需要抓包确认 |
| 6 | CN 的登录 flow 可能有验证码/手机验证 | 🟢 低 | browser-login 模式只是代理登录，验证码由用户在窗口中完成 |
| 7 | 国际版和 CN 版账号数据混存 | 🟢 低 | 设计上同存无所谓，但 UI 上应标注版本来源 |

---

## 六、推荐实施步骤

### Phase 1：最小可行验证（先不写代码）
1. 手动测试：关掉 CN → 替换 `trae-jwt-token` → 启动 CN，看切换是否生效
2. 手动测试：观察 CN 启动后创建了哪些文件
3. 抓包确认 CN 的 API 路径

### Phase 2：核心改造
1. 改造 `platform-config.js`（新增 CN 配置）
2. 改造 `trae-switcher.js`（CN 切换分支）
3. 改造 `trae-reader.js`（CN token 读取）
4. 改造 `trae-api.js`（CN 端点）
5. 改造 `browser-login.js`（CN 登录）
6. 改造 `trae-cleaner.js`（CN 清理）

### Phase 3：前端 & 设置
1. `account-store.js` 新增 variant 设置
2. `main.js` 透传 variant
3. 前端设置页增加版本选择 UI

### Phase 4：测试
1. 切号功能完整测试
2. 清理功能测试
3. 登录功能测试
4. 国际版兼容性回归测试

---

## 七、总结

好消息是 CN 版的数据模型**比国际版简单得多**（只有 `trae-jwt-token` 一个文件），切换逻辑会更轻量。坏消息是这个简化意味着现有基于 `storage.json` 的加密读写机制对 CN 完全不适用，需要写一条全新的切换路径。

**预估总改动量**：约 300-400 行代码（新增+修改），涉及 8 个文件。
