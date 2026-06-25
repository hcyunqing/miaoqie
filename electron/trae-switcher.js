const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { getPlatformConfig, getTraeCNTokenPath, getTraeCNDataDir, getTraeCNAppDataDir, getTraeCNStorageJsonPath, getTraeCNAhaTinyStoragePath, getTraeCNCookiesDbPath } = require('./platform-config');
const { getTraePath } = require('./account-store');
const { findTraeCN } = require('./find-trae');
const { getUserToken, parseJwtPayload, cleanCookies } = require('./trae-api');
const { encryptToBase64 } = require('./trae-crypto');

/* ── Safe console output (avoids GBK garbling on Windows) ── */

function safeLog(...args) {
  const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  process.stdout.write(Buffer.from(line, 'utf-8'));
}

function safeWarn(...args) {
  const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  process.stderr.write(Buffer.from(line, 'utf-8'));
}

/* ── Cross-platform synchronous sleep ── */

function sleepSync(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(seconds * 1000));
}

/* ── Process management ── */

function isTraeRunning() {
  if (process.platform === 'darwin') {
    try {
      execSync('pgrep -f "Trae CN.app/Contents/MacOS"', { stdio: 'ignore' });
      return true;
    } catch { return false; }
  }
  if (process.platform === 'win32') {
    try {
      const out = execSync('tasklist /FI "IMAGENAME eq Trae CN.exe" /NH', { encoding: 'utf8' });
      return out.includes('Trae CN.exe');
    } catch { return false; }
  }
  return false;
}

function killTrae() {
  if (!isTraeRunning()) return;

  if (process.platform === 'darwin') {
    try {
      execSync('osascript -e \'tell application "Trae CN" to quit\'', { stdio: 'ignore' });
    } catch { /* ignore */ }
    sleepSync(1.5);
    if (isTraeRunning()) {
      try {
        execSync('pkill -9 -f "Trae CN.app/Contents/MacOS"', { stdio: 'ignore' });
      } catch { /* ignore */ }
    }
  } else if (process.platform === 'win32') {
    try {
      execSync('taskkill /IM "Trae CN.exe"', { stdio: 'ignore' });
    } catch { /* ignore */ }
    try {
      execSync('timeout /t 1 /nobreak', { stdio: 'ignore' });
    } catch { /* ignore */ }
    if (isTraeRunning()) {
      execSync('taskkill /F /IM "Trae CN.exe"', { stdio: 'ignore' });
    }
  }

  if (isTraeRunning()) {
    throw new Error('无法关闭 Trae CN，请手动关闭后重试');
  }
}

/* ── App path resolution ── */

function resolveTraeAppPath() {
  const saved = getTraePath();
  if (saved && fs.existsSync(saved)) return saved;

  // 快速扫描（注册表 + 候选路径，不包含磁盘扫描以保持速度）
  try {
    const { findByRegistry, findByStartMenu, findByCandidates } = require('./find-trae');
    const found = findByRegistry() || findByStartMenu() || findByCandidates();
    if (found) return found;
  } catch { /* ignore, continue to fallback */ }

  const config = getPlatformConfig();
  if (!config) throw new Error('未设置 Trae CN 路径');

  if (process.platform === 'darwin') {
    const candidates = [
      config.defaultTraeApp,
      path.join(require('os').homedir(), 'Applications/Trae CN.app'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  if (saved) throw new Error('Trae CN 路径无效，请在设置中重新配置');
  throw new Error('未找到 Trae CN，请在设置中配置路径');
}

function openTrae() {
  const appPath = resolveTraeAppPath();
  if (process.platform === 'darwin') {
    spawn('open', ['-a', appPath], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    spawn(appPath, [], { detached: true, stdio: 'ignore' }).unref();
  }
}

/* ── Cookie injection into Trae CN's Chromium SQLite database ── */

/**
 * The Chromium epoch (Jan 1, 1601) in microseconds.
 * To convert Unix milliseconds to Chromium time:
 *   chromiumTime = (unixMs + 11644473600000) * 1000
 */
const CHROMIUM_EPOCH_DELTA_MS = 11644473600000;

function unixMsToChromiumTime(unixMs) {
  return Math.floor((unixMs + CHROMIUM_EPOCH_DELTA_MS) * 1000);
}

/**
 * Parse a Netscape-format cookie string into an array of cookie objects
 * suitable for Chromium SQLite injection.
 *
 * Cookie string format: "name1=value1; name2=value2; ..."
 * Handles URL-encoded values (e.g., %2F → /).
 */
function parseCookieString(cookieStr) {
  const cleaned = cleanCookies(cookieStr);
  if (!cleaned) return [];

  const cookies = [];
  const now = Date.now();
  const expiry = now + 365 * 86400 * 1000; // 1 year from now

  const pairs = cleaned.split(';');
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.substring(0, eq).trim();
    let value = pair.substring(eq + 1).trim();
    if (!name || !value) continue;

    // URL-decode the value
    try {
      value = decodeURIComponent(value);
    } catch { /* keep as-is */ }

    cookies.push({
      name,
      value,
      hostKey: '.trae.cn',
      path: '/',
      creationUtc: unixMsToChromiumTime(now),
      lastAccessUtc: unixMsToChromiumTime(now),
      expiresUtc: unixMsToChromiumTime(expiry),
      isSecure: 1,
      isHttpOnly: 0,
      hasExpires: 1,
      isPersistent: 1,
      priority: 1,
      samesite: -1, // LAX_MODE_UNSPECIFIED
      sourceScheme: 2, // CookieSourceScheme::kSecure
      sourcePort: 443,
      isSameParty: 0,
    });
  }

  safeLog('[秒切] Parsed', cookies.length, 'cookies for injection');
  return cookies;
}

/**
 * The Chromium cookies table DDL.
 * We use IF NOT EXISTS so it's safe to call on an existing DB.
 */
const COOKIES_TABLE_DDL = `CREATE TABLE IF NOT EXISTS cookies(
  creation_utc INTEGER NOT NULL,
  host_key TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  path TEXT NOT NULL,
  expires_utc INTEGER NOT NULL,
  is_secure INTEGER NOT NULL,
  is_httponly INTEGER NOT NULL,
  last_access_utc INTEGER NOT NULL,
  has_expires INTEGER NOT NULL DEFAULT 1,
  is_persistent INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 1,
  encrypted_value BLOB DEFAULT '',
  samesite INTEGER NOT NULL DEFAULT -1,
  source_scheme INTEGER NOT NULL DEFAULT 2,
  source_port INTEGER NOT NULL DEFAULT -1,
  is_same_party INTEGER NOT NULL DEFAULT 0,
  UNIQUE(host_key, name, path)
)`;

const META_TABLE_DDL = `CREATE TABLE IF NOT EXISTS meta(key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY, value LONGVARCHAR)`;

const INSERT_COOKIE_SQL = `INSERT OR REPLACE INTO cookies
  (creation_utc, host_key, name, value, path, expires_utc,
   is_secure, is_httponly, last_access_utc, has_expires,
   is_persistent, priority, encrypted_value, samesite,
   source_scheme, source_port, is_same_party)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`;

/**
 * Inject cookies into Trae CN's Chromium SQLite cookie database.
 *
 * Strategy:
 *   1. Delete ALL existing cookies for .trae.cn domain (clean slate).
 *   2. Insert the target account's cookies so Trae CN's webview
 *      auto-authenticates on next startup.
 *
 * Cookie values are written to the `value` column (plaintext).
 * `encrypted_value` is left empty. Chromium reads from `value`
 * as a fallback when `encrypted_value` is empty.
 *
 * Trae CN only needs these cookies once — after successful startup
 * auth, it writes `iCubeAuthInfo` to storage.json, which becomes
 * the primary auth source.
 */
async function injectCookiesToSqlite(cookieStr) {
  const cookies = parseCookieString(cookieStr);
  if (!cookies.length) {
    safeWarn('[秒切] No cookies to inject');
    return false;
  }

  // Try to load sql.js (WASM-based, no native dependencies)
  let initSqlJs;
  try {
    initSqlJs = require('sql.js');
  } catch {
    safeWarn('[秒切] sql.js not available, skipping cookie injection');
    return false;
  }

  const { primary, legacy } = getTraeCNCookiesDbPath();

  // Determine which database to use
  let dbPath = null;
  if (fs.existsSync(primary)) {
    dbPath = primary;
  } else if (fs.existsSync(legacy)) {
    dbPath = legacy;
  }

  if (!dbPath) {
    // Neither exists — create the primary one
    const dir = path.dirname(primary);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    dbPath = primary;
    safeLog('[秒切] Creating new Cookies DB at', primary);
  }

  // sql.js needs its WASM file. Resolve path relative to the module.
  const wasmDir = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');

  try {
    // Initialize sql.js with explicit WASM path
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(wasmDir, file),
    });

    // Read existing DB (or start with empty buffer for new DB)
    let buffer;
    if (fs.existsSync(dbPath)) {
      buffer = fs.readFileSync(dbPath);
    }

    const db = new SQL.Database(buffer || undefined);

    // Ensure tables exist
    db.run(COOKIES_TABLE_DDL);
    db.run(META_TABLE_DDL);

    // Delete ALL existing cookies for .trae.cn domain
    db.run("DELETE FROM cookies WHERE host_key = '.trae.cn' OR host_key = 'www.trae.cn' OR host_key = 'trae.cn'");
    safeLog('[秒切] Cleared old trae.cn cookies from DB');

    // Insert new cookies
    let inserted = 0;
    const stmt = db.prepare(INSERT_COOKIE_SQL);
    for (const c of cookies) {
      try {
        stmt.run([
          c.creationUtc,
          c.hostKey,
          c.name,
          c.value,
          c.path,
          c.expiresUtc,
          c.isSecure,
          c.isHttpOnly,
          c.lastAccessUtc,
          c.hasExpires,
          c.isPersistent,
          c.priority,
          c.samesite,
          c.sourceScheme,
          c.sourcePort,
          c.isSameParty,
        ]);
        inserted++;
      } catch (err) {
        safeWarn('[秒切] Cookie insert failed for', c.name + ':', err.message);
      }
    }
    stmt.free();

    // Write back to disk
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    db.close();

    safeLog('[秒切] Injected', inserted, 'cookies to', dbPath);

    // Also copy to the other path to ensure coverage
    const otherPath = dbPath === primary ? legacy : primary;
    try {
      const otherDir = path.dirname(otherPath);
      if (!fs.existsSync(otherDir)) {
        fs.mkdirSync(otherDir, { recursive: true });
      }
      fs.writeFileSync(otherPath, Buffer.from(data));
      safeLog('[秒切] Synced cookies to', otherPath);
    } catch { /* best effort */ }

    return true;
  } catch (err) {
    safeWarn('[秒切] Cookie injection failed:', err.message);
    return false;
  }
}

/* ── Token switching (CN edition) ── */

/**
 * Full account switching flow for Trae CN.
 *
 * Strategy:
 *   1. Kill Trae CN.
 *   2. Use account cookies to get a FRESH JWT from Trae's API.
 *   3. Clean old auth data (iCubeAuthInfo, cookies, sessions, local storage).
 *   4. Inject target account's cookies into Chromium's SQLite cookie store.
 *      → Trae CN's webview reads these cookies on startup and auto-authenticates.
 *   5. Write the fresh JWT to ~/.trae-cn/trae-jwt-token (for AI subprocesses).
 *   6. Open Trae CN.
 *
 * Cookie-injection is the key to making this work:
 *   - We cannot forge Trae CN's encrypted iCubeAuthInfo format.
 *   - But we CAN pre-seed the Chromium cookie store with valid auth cookies.
 *   - Trae CN's embedded webview reads these cookies → auto-login → writes new iCubeAuthInfo.
 */
async function switchTraeAccount(account) {
  killTrae();

  const dataDir = getTraeCNDataDir();
  const tokenPath = getTraeCNTokenPath();

  // Ensure data dir exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // ── Step 1: Get a fresh JWT from cookies ──
  let token = account.token;
  let tokenRefreshed = false;
  let refreshedToken = null;
  let refreshedExpiredAt = null;
  let refreshedTokenExp = null;

  // Build a working copy of account with refreshed data
  const workingAccount = { ...account };

  if (account.cookies && account.cookies.trim()) {
    try {
      safeLog('[秒切] Refreshing token from cookies...');
      const result = await getUserToken(account.cookies);
      token = result.token;
      tokenRefreshed = true;
      refreshedToken = result.token;
      refreshedExpiredAt = result.expiredAt || null;
      refreshedTokenExp = result.tokenExp || null;
      // Update working account with fresh token
      workingAccount.token = result.token;
      safeLog('[秒切] Got fresh token (expires:', result.expiredAt || 'unknown' + ')');
    } catch (err) {
      safeWarn('[秒切] Cookie -> token refresh failed:', err.message);
      safeLog('[秒切] Falling back to stored token');
    }
  }

  if (!token) {
    throw new Error('账号缺少 Token 且 Cookie 刷新失败，无法切换');
  }

  // ── Step 2: Clean old auth data ──
  cleanOldAuthData();

  // ── Step 3: Inject cookies into Trae CN's Chromium store ──
  let cookieInjected = false;
  if (account.cookies && account.cookies.trim()) {
    cookieInjected = await injectCookiesToSqlite(account.cookies);
    if (!cookieInjected) {
      safeWarn('[秒切] Cookie injection failed -- Trae CN may require manual re-login');
    }
  }

  // ── Step 4: Write the JWT token ──
  fs.writeFileSync(tokenPath, token, 'utf8');
  safeLog('[秒切] Wrote token to', tokenPath);

  // ── Step 5: Write auth data to storage.json ──
  // Uses captured encrypted blob if available; otherwise constructs from token.
  // Pass workingAccount which has the freshly refreshed token.
  await writeAuthToStorageJson(workingAccount);

  // ── Step 6: Brief delay for OS to release file locks ──
  sleepSync(0.5);

  // ── Step 7: Open Trae CN ──
  try {
    openTrae();
  } catch (err) {
    const msg = err.message;
    safeWarn('[秒切] Auto-open failed:', msg);
    return { switched: true, autoOpenFailed: msg, tokenRefreshed, cookieInjected, refreshedToken, refreshedExpiredAt, refreshedTokenExp };
  }

  safeLog('[秒切] Switch complete -- token refreshed:', tokenRefreshed, 'cookies injected:', cookieInjected);
  return { switched: true, tokenRefreshed, cookieInjected, refreshedToken, refreshedExpiredAt, refreshedTokenExp };
}

/* ── Helper: Clean all old session/auth data ── */

function cleanOldAuthData() {
  const dataDir = getTraeCNDataDir();

  // 1. Clear session caches under ~/.trae-cn
  const homeCaches = [
    'Cookies', 'Cookies-journal',
    'Network/Cookies', 'Network/Cookies-journal',
    'SharedStorage', 'SharedStorage-wal',
    'Local Storage', 'Session Storage',
  ];
  for (const rel of homeCaches) {
    const p = path.join(dataDir, rel);
    try {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    } catch { /* best effort */ }
  }

  // 2. Clear iCubeAuthInfo from storage.json
  try {
    const storagePath = getTraeCNStorageJsonPath();
    if (fs.existsSync(storagePath)) {
      const raw = fs.readFileSync(storagePath, 'utf8');
      const data = JSON.parse(raw);
      const oldKeys = Object.keys(data).filter(k => k.startsWith('iCubeAuthInfo://'));
      for (const key of oldKeys) {
        delete data[key];
      }
      fs.writeFileSync(storagePath, JSON.stringify(data, null, '    '), 'utf8');
      safeLog('[秒切] Removed', oldKeys.length, 'iCubeAuthInfo entries from storage.json');
    }
  } catch (err) {
    safeWarn('[秒切] storage.json cleanup failed:', err.message);
  }

  // 3. Clear AHA TinyStorage
  try {
    const ahaPath = getTraeCNAhaTinyStoragePath();
    if (fs.existsSync(ahaPath)) {
      const raw = fs.readFileSync(ahaPath, 'utf8');
      const data = JSON.parse(raw);
      let changed = false;
      if (data.tiny_storage_data) {
        const ts = data.tiny_storage_data;
        for (const key of Object.keys(ts)) {
          if (key.startsWith('aha.device.') || key.startsWith('aha.')) {
            delete ts[key];
            changed = true;
          }
        }
      }
      if (data.aha_access_policy !== undefined) {
        delete data.aha_access_policy;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(ahaPath, JSON.stringify(data), 'utf8');
        safeLog('[秒切] Cleared TinyStorage auth keys');
      }
    }
  } catch (err) {
    safeWarn('[秒切] TinyStorage cleanup failed:', err.message);
  }

  // 4. Clear AppData-level session caches
  try {
    const appDataDir = getTraeCNAppDataDir();
    const appDataCaches = [
      'Cookies', 'Cookies-journal',
      'Network/Cookies', 'Network/Cookies-journal',
      'SharedStorage', 'SharedStorage-wal',
      'Local Storage', 'Session Storage',
    ];
    for (const rel of appDataCaches) {
      const p = path.join(appDataDir, rel);
      try {
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
        }
      } catch { /* best effort */ }
    }
  } catch { /* best effort */ }
}

/* ── Capture & Restore iCubeAuthInfo (encrypted blob) ── */

/**
 * Capture the real encrypted iCubeAuthInfo entries from Trae CN's storage.json.
 *
 * Called after the user has manually logged in to Trae CN.
 * Returns an object: { key: value } for all iCubeAuthInfo:// entries.
 * These are Trae CN's own encrypted blobs — we store them as-is and
 * restore them verbatim during account switching.
 */
function captureICloudAuthInfo() {
  const storagePath = getTraeCNStorageJsonPath();
  if (!fs.existsSync(storagePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(storagePath, 'utf8');
    const data = JSON.parse(raw);
    const captured = {};
    let count = 0;

    for (const key of Object.keys(data)) {
      if (key.startsWith('iCubeAuthInfo://')) {
        captured[key] = data[key];
        count++;
      }
    }

    if (count > 0) {
      safeLog('[秒切] Captured', count, 'iCubeAuthInfo entries from storage.json');
    } else {
      safeWarn('[秒切] No iCubeAuthInfo found in storage.json — Trae CN may not be logged in');
    }

    return Object.keys(captured).length > 0 ? captured : null;
  } catch (err) {
    safeWarn('[秒切] Failed to capture iCubeAuthInfo:', err.message);
    return null;
  }
}

/**
 * Restore captured iCubeAuthInfo entries to Trae CN's storage.json.
 *
 * This is the core of the switching mechanism:
 *   - We do NOT forge the encryption; we restore the exact blob that Trae CN
 *     wrote during manual login.
 *   - Trae CN reads this on startup and recognises the session as valid.
 *
 * @param {Object} capturedAuthInfo - { key: encryptedValue } pairs from captureICloudAuthInfo()
 */
function restoreICloudAuthInfo(capturedAuthInfo) {
  if (!capturedAuthInfo || typeof capturedAuthInfo !== 'object') {
    safeWarn('[秒切] No captured auth info to restore');
    return false;
  }

  const storagePath = getTraeCNStorageJsonPath();

  try {
    let data = {};
    if (fs.existsSync(storagePath)) {
      data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } else {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    }

    // Remove all existing iCubeAuthInfo entries
    const oldKeys = Object.keys(data).filter(k => k.startsWith('iCubeAuthInfo://'));
    for (const key of oldKeys) {
      delete data[key];
    }

    // Restore captured entries verbatim
    let restored = 0;
    for (const [key, value] of Object.entries(capturedAuthInfo)) {
      data[key] = value;
      restored++;
    }

    fs.writeFileSync(storagePath, JSON.stringify(data, null, '    '), 'utf8');
    safeLog('[秒切] Restored', restored, 'iCubeAuthInfo entries to storage.json');
    return true;
  } catch (err) {
    safeWarn('[秒切] Failed to restore iCubeAuthInfo:', err.message);
    return false;
  }
}

/**
 * Write auth data to storage.json.
 *
 * Priority 1: Restore captured encrypted blob (from "Import from Trae CN")
 * Priority 2: Construct plaintext iCubeAuthInfo from API data (from "Browser Login")
 *
 * The plaintext format (for iCubeAuthInfo://icube-dc:<tenantId>) is:
 *   Base64(JSON.stringify({ token, refreshToken: "", expiredAt, userId }))
 *
 * This is a Base64-encoded plaintext JSON — NOT encrypted.
 * Trae CN accepts this format and will populate the other encrypted keys on startup.
 */
async function writeAuthToStorageJson(account) {
  // Priority 1: Restore captured encrypted blob
  if (account.authBlob && typeof account.authBlob === 'object') {
    const ok = restoreICloudAuthInfo(account.authBlob);
    if (ok) return;
  }

  // Priority 2: Construct auth from API data (plaintext dc key + encrypted cloudide key)
  if (account.token && account.userId && account.tenantId) {
    const ok = await writePlaintextAuthToStorage(account);
    if (ok) return;
  }

  // Priority 3: No data available — clear old entries
  safeWarn('[秒切] No authBlob or API data for this account.');

  try {
    const storagePath = getTraeCNStorageJsonPath();
    if (fs.existsSync(storagePath)) {
      const data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
      const oldKeys = Object.keys(data).filter(k => k.startsWith('iCubeAuthInfo://'));
      for (const key of oldKeys) {
        delete data[key];
      }
      fs.writeFileSync(storagePath, JSON.stringify(data, null, '    '), 'utf8');
    }
  } catch { /* best effort */ }
}

/**
 * Write auth data to storage.json from API data.
 *
 * Writes TWO keys:
 * 1. iCubeAuthInfo://icube-dc:<tenantId> = Base64(明文JSON) — auth token
 * 2. iCubeAuthInfo://icube.cloudide = Trae加密(明文JSON) — user info (encrypted with Trae's custom AES-128-CBC)
 *
 * The icube.cloudide key contains user account info needed by Trae CN on startup.
 * We encrypt it using the same algorithm Trae CN uses (reverse-engineered from main.js).
 */
async function writePlaintextAuthToStorage(account) {
  try {
    // Parse JWT to get exp
    let jwtExp = null;
    let jwtIat = null;
    try {
      const payload = JSON.parse(Buffer.from(account.token.split('.')[1], 'base64').toString('utf8'));
      jwtExp = payload.exp || null;
      jwtIat = payload.iat || null;
    } catch (e) {
      safeWarn('[秒切] Failed to parse JWT:', e.message);
    }

    if (!jwtExp) {
      safeWarn('[秒切] Cannot determine token expiry — aborting plaintext auth write');
      return false;
    }

    // ── Key 1: iCubeAuthInfo://icube-dc:<tenantId> — plaintext Base64 JSON ──
    const dcAuthData = {
      token: account.token,
      refreshToken: '',
      expiredAt: jwtExp,
      userId: account.userId,
    };
    const dcValue = Buffer.from(JSON.stringify(dcAuthData)).toString('base64');
    const dcKey = `iCubeAuthInfo://icube-dc:${account.tenantId}`;

    // ── Key 2: iCubeAuthInfo://icube.cloudide — encrypted JSON ──
    const cloudideData = {
      token: account.token,
      refreshToken: '',
      expiredAt: new Date(jwtExp * 1000).toISOString(),
      refreshExpiredAt: new Date((jwtExp + 30 * 24 * 3600) * 1000).toISOString(),
      tokenReleaseAt: new Date((jwtIat || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      userId: account.userId,
      host: 'https://api.trae.cn',
      userRegion: {
        region: 'CN',
        _aiRegion: 'CN',
      },
      account: {
        username: account.name || '',
        iss: '',
        iat: 0,
        organization: '',
        work_country: '',
        email: account.email || '',
        avatar_url: account.avatarUrl || '',
        description: '',
        scope: 'marscode',
        loginScope: 'trae',
        nonPlainTextMobile: '',
        storeCountryCode: '',
        storeCountrySrc: '',
        storeRegion: 'CN',
        userTag: 'cn',
        migrateToSG: false,
      },
    };
    const cloudideValue = await encryptToBase64(JSON.stringify(cloudideData));
    const cloudideKey = 'iCubeAuthInfo://icube.cloudide';

    safeLog('[秒切] Constructing auth data:');
    safeLog('  Key 1 (plaintext):', dcKey);
    safeLog('  Key 2 (encrypted):', cloudideKey);
    safeLog('  Token expires at:', new Date(jwtExp * 1000).toISOString());

    // Write to storage.json
    const storagePath = getTraeCNStorageJsonPath();
    let data = {};
    if (fs.existsSync(storagePath)) {
      data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } else {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    }

    // Remove all existing iCubeAuthInfo entries (clean slate)
    const oldKeys = Object.keys(data).filter(k => k.startsWith('iCubeAuthInfo://'));
    for (const key of oldKeys) {
      delete data[key];
    }

    // Write both keys
    data[dcKey] = dcValue;
    data[cloudideKey] = cloudideValue;

    fs.writeFileSync(storagePath, JSON.stringify(data, null, '    '), 'utf8');
    safeLog('[秒切] Wrote auth data (plaintext + encrypted) to storage.json');
    return true;
  } catch (err) {
    safeWarn('[秒切] Failed to write auth data:', err.message);
    return false;
  }
}

/* ── Scan for Trae CN executable ── */

function scanTraePath() {
  const found = findTraeCN();
  if (found) return found;
  throw new Error('未找到 Trae CN，请手动选择安装位置');
}

module.exports = {
  switchTraeAccount,
  scanTraePath,
  isTraeRunning,
  killTrae,
  openTrae,
  captureICloudAuthInfo,
  writeAuthToStorageJson,
};
