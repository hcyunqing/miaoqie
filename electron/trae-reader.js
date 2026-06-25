const fs = require('fs');
const path = require('path');
const { getPlatformConfig, getTraeCNTokenPath } = require('./platform-config');

/**
 * Parse a JWT payload without verifying the signature.
 * Returns { userId, tenantId, exp, email, name, avatarUrl } or throws.
 */
function parseJwtPayload(token) {
  const parts = token.trim().split('.');
  if (parts.length !== 3) throw new Error('无效的 JWT Token');

  let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (payload.length % 4)) % 4;
  payload += '='.repeat(pad);

  const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  const data = json.data || json;
  return {
    userId: data.id || json.sub || '',
    tenantId: data.tenant_id || '',
    exp: json.exp || null,
    email: data.email || '',
    name: data.username || data.screen_name || '',
    avatarUrl: data.avatar_url || '',
  };
}

/**
 * Read the current token from ~/.trae-cn/trae-jwt-token (plaintext).
 */
function readFromTokenFile() {
  const tokenPath = getTraeCNTokenPath();
  if (!fs.existsSync(tokenPath)) {
    throw new Error('未找到 Trae CN 配置文件（' + tokenPath + '），请先在 Trae CN 中登录');
  }

  const raw = fs.readFileSync(tokenPath, 'utf8').trim();
  if (!raw || raw.length < 20) {
    throw new Error('Trae CN token 文件为空，请先登录');
  }

  const jwt = parseJwtPayload(raw);

  return {
    token: raw,
    source: 'trae-jwt-token',
    userId: jwt.userId,
    email: jwt.email || '',
    name: jwt.name || jwt.email || '',
    username: jwt.name || '',
    avatarUrl: jwt.avatarUrl || '',
    tokenExpiredAt: jwt.exp ? new Date(jwt.exp * 1000).toISOString() : null,
  };
}

/**
 * Fallback: scan Trae CN log files for JWT tokens.
 */
function readTokenFromLogs() {
  const config = getPlatformConfig();
  if (!config) return null;

  const logsDir = path.join(config.dataDir, 'logs');
  if (!fs.existsSync(logsDir)) return null;

  const logFiles = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(logsDir, d.name, 'main.log'))
    .filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const jwtPattern = /"UserJwt":"(eyJ[^"]+)"/g;

  for (const logFile of logFiles) {
    const content = fs.readFileSync(logFile, 'utf8');
    let match;
    let last = null;
    while ((match = jwtPattern.exec(content)) !== null) {
      last = match[1];
    }
    if (last) {
      try {
        const jwt = parseJwtPayload(last);
        return {
          token: last,
          source: path.basename(path.dirname(logFile)) + '/main.log',
          userId: jwt.userId,
          email: jwt.email || '',
          name: jwt.name || '',
          tokenExpiredAt: jwt.exp ? new Date(jwt.exp * 1000).toISOString() : null,
        };
      } catch { /* continue */ }
    }
  }

  return null;
}

/**
 * Main entry: read the currently active Trae CN session.
 */
async function readCurrentTraeToken() {
  try {
    return await readFromTokenFile();
  } catch (err) {
    const fromLog = readTokenFromLogs();
    if (fromLog) return fromLog;
    throw err;
  }
}

/**
 * Get the path to the token file (used by storage watcher).
 */
function getStoragePath() {
  return getTraeCNTokenPath();
}

module.exports = { readCurrentTraeToken, getStoragePath };
