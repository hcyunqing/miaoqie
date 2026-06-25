const path = require('path');
const os = require('os');

/**
 * Trae CN data directory.
 * On Windows the config lives at %USERPROFILE%\.trae-cn
 * (not under %APPDATA%\Trae like the international edition).
 */
function getTraeCNDataDir() {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), '.trae-cn');
  }
  // macOS / Linux — not officially supported by Trae CN,
  // but keep the same convention for consistency.
  return path.join(os.homedir(), '.trae-cn');
}

function getTraeCNTokenPath() {
  return path.join(getTraeCNDataDir(), 'trae-jwt-token');
}

/** 
 * Trae CN AppData (Roaming) directory.
 * Contains User/globalStorage/storage.json with encrypted iCubeAuthInfo.
 */
function getTraeCNAppDataDir() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Trae CN');
  }
  const home = os.homedir();
  return path.join(home, 'Library', 'Application Support', 'Trae CN');
}

/**
 * The globalStorage/storage.json file that holds encrypted session data.
 * Key `iCubeAuthInfo://icube.cloudide` must be cleared for account switching.
 */
function getTraeCNStorageJsonPath() {
  return path.join(getTraeCNAppDataDir(), 'User', 'globalStorage', 'storage.json');
}

/**
 * AHA TinyStorage — secondary encrypted session cache.
 */
function getTraeCNAhaTinyStoragePath() {
  return path.join(getTraeCNAppDataDir(), 'aha', 'TinyStorage');
}

/**
 * Trae CN's Chromium Cookies SQLite database.
 * This is where cookies are persisted for the embedded webview.
 * Injecting cookies here allows Trae CN to auto-authenticate on startup.
 *
 * Priority order (Chromium 100+ uses Network/Cookies):
 *   1. %APPDATA%/Trae CN/Network/Cookies  (primary, Chromium 100+)
 *   2. %APPDATA%/Trae CN/Cookies           (legacy fallback)
 */
function getTraeCNCookiesDbPath() {
  const appDataDir = getTraeCNAppDataDir();
  const network = path.join(appDataDir, 'Network', 'Cookies');
  const legacy = path.join(appDataDir, 'Cookies');
  return { primary: network, legacy };
}

/** Cache directories Trae CN creates at runtime under its data dir. */
const CN_DATA_SUBDIRS = [
  'blob_storage',
  'Cache',
  'CachedData',
  'CachedExtensionVSIXs',
  'CachedConfigurations',
  'CachedProfilesData',
  'Code Cache',
  'Cookies',
  'Cookies-journal',
  'Crashpad',
  'DawnWebGPUCache',
  'DawnGraphiteCache',
  'GPUCache',
  'Local Storage',
  'logs',
  'Network',
  'Session Storage',
  'SharedStorage',
  'SharedStorage-wal',
  'Service Worker',
  'Trust Tokens',
  'Trust Tokens-journal',
  'WebStorage',
];

function getWinConfig() {
  const dataDir = getTraeCNDataDir();
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

  return {
    platform: 'win32',
    label: 'Windows',
    dataDir,
    tokenPath: path.join(dataDir, 'trae-jwt-token'),
    /** Default install location for Trae CN (user-scoped). */
    defaultTraeApp: path.join(localAppData, 'Programs', 'Trae CN', 'Trae CN.exe'),
    /** Subdirs to scan / clean under dataDir. */
    dataSubdirs: CN_DATA_SUBDIRS,
    /** Extra cache locations outside the data dir. */
    cachePaths: [
      path.join(localAppData, 'Trae CN'),
      path.join(localAppData, 'trae-cn-updater'),
    ],
    preferenceFiles: [],
    /** Registry keys Trae CN writes. */
    registryKeys: [
      'HKCU\\Software\\com.trae.cn',
    ],
  };
}

function getMacConfig() {
  // Trae CN does not have a macOS build yet; provide sensible defaults.
  const dataDir = getTraeCNDataDir();
  const home = os.homedir();

  return {
    platform: 'darwin',
    label: 'macOS',
    dataDir,
    tokenPath: path.join(dataDir, 'trae-jwt-token'),
    defaultTraeApp: '/Applications/Trae CN.app',
    dataSubdirs: CN_DATA_SUBDIRS,
    cachePaths: [
      path.join(home, 'Library/Caches/com.trae.cn'),
      path.join(home, 'Library/Caches/Trae CN'),
    ],
    preferenceFiles: [
      path.join(home, 'Library/Preferences/com.trae.cn.plist'),
    ],
    registryKeys: [],
  };
}

function getPlatformConfig() {
  if (process.platform === 'darwin') return getMacConfig();
  if (process.platform === 'win32') return getWinConfig();
  return null;
}

function getScanPaths(config) {
  const paths = [config.dataDir, ...config.cachePaths];
  if (config.dataSubdirs.length) {
    for (const dir of config.dataSubdirs) {
      paths.push(path.join(config.dataDir, dir));
    }
  }
  return [...new Set(paths)];
}

module.exports = {
  getPlatformConfig,
  getScanPaths,
  getTraeCNDataDir,
  getTraeCNTokenPath,
  getTraeCNAppDataDir,
  getTraeCNStorageJsonPath,
  getTraeCNAhaTinyStoragePath,
  getTraeCNCookiesDbPath,
};
