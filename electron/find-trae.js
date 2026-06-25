// electron/find-trae.js
// Trae CN 安装位置扫描器 — 注册表、开始菜单、候选路径、磁盘扫描
// 按速度从快到慢依次尝试，不依赖用户手动选择

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getPlatformConfig } = require('./platform-config');

// ── 安全执行命令行 ──────────────────────────────────────────────

function run(cmd, timeout = 5000) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

// ── 方法 1：Windows 注册表（毫秒级，跨盘） ─────────────────────

/**
 * 查询卸载注册表，匹配 DisplayName 含 "Trae CN" 的条目，
 * 读取 InstallLocation 或 DisplayIcon → 还原为 exe 路径。
 * 这是最快、最可靠的方法，不受安装盘符限制。
 */
function findByRegistry() {
  if (process.platform !== 'win32') return null;

  const roots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];

  for (const root of roots) {
    let list;
    try {
      list = run(`reg query "${root}" /f "." /k`, 5000);
    } catch { continue; }
    if (!list) continue;

    const lines = list.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过根路径自身和空行
      if (!trimmed || trimmed === root || !trimmed.startsWith('HKEY_')) continue;

      let info;
      try {
        info = run(`reg query "${trimmed}"`, 3000);
      } catch { continue; }
      if (!info) continue;

      // 检查 DisplayName 是否匹配 Trae CN
      if (!/Trae\s*CN/i.test(info) && !/秒切/i.test(info)) {
        // 也不是所有键都有 DisplayName，再查一下 DisplayName 字段
        if (!/DisplayName\s+REG_\S+\s+.*Trae\s*CN/i.test(info)) continue;
      }

      console.log('[秒切] Registry hit:', trimmed);

      // 优先取 InstallLocation
      const locMatch = info.match(/InstallLocation\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/i);
      if (locMatch) {
        const dir = locMatch[1].trim();
        const exe = path.join(dir, 'Trae CN.exe');
        if (fs.existsSync(exe)) return exe;
        // 也可能是子目录
        try {
          const topExe = path.join(path.dirname(dir), 'Trae CN.exe');
          if (fs.existsSync(topExe)) return topExe;
        } catch {}
      }

      // 回退：从 DisplayIcon 提取目录
      const iconMatch = info.match(/DisplayIcon\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/i);
      if (iconMatch) {
        const iconPath = iconMatch[1].trim().replace(/"/g, '');
        const dir = path.dirname(iconPath);
        const exe = path.join(dir, 'Trae CN.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }

  return null;
}

// ── 方法 2：开始菜单快捷方式（毫秒级，跨盘） ──────────────────

/**
 * 检查开始菜单 Trae CN 文件夹下的 .lnk 快捷方式，
 * 通过 WScript.Shell COM 解析目标路径。
 */
function findByStartMenu() {
  if (process.platform !== 'win32') return null;

  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

  const dirs = [
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];

  for (const baseDir of dirs) {
    const traeDir = path.join(baseDir, 'Trae CN');
    if (!fs.existsSync(traeDir)) continue;

    let entries;
    try { entries = fs.readdirSync(traeDir); } catch { continue; }

    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.lnk')) continue;

      const lnkPath = path.join(traeDir, entry);
      console.log('[秒切] Start Menu shortcut:', lnkPath);

      // 用 PowerShell 解析 .lnk（execSync 同步执行）
      const script =
        `$ws=New-Object -ComObject WScript.Shell;` +
        `$target=$ws.CreateShortcut('${lnkPath.replace(/'/g, "''")}').TargetPath;` +
        `Write-Output $target`;
      const target = run(`powershell -NoProfile -NonInteractive -Command "${script}"`, 5000);

      if (target && target.toLowerCase().endsWith('trae cn.exe') && fs.existsSync(target)) {
        return target;
      }
    }
  }

  return null;
}

// ── 方法 3：固定候选路径（毫秒级） ─────────────────────────────

/**
 * 检查最常见的安装路径，覆盖默认安装位置。
 */
function findByCandidates() {
  const config = getPlatformConfig();
  if (!config) return null;

  if (process.platform === 'darwin') {
    const candidates = [
      config.defaultTraeApp,
      path.join(os.homedir(), 'Applications', 'Trae CN.app'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  // Windows 候选路径
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const progFiles86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    config.defaultTraeApp,
    path.join(localAppData, 'Programs', 'Trae CN', 'Trae CN.exe'),
    path.join(progFiles, 'Trae CN', 'Trae CN.exe'),
    path.join(progFiles86, 'Trae CN', 'Trae CN.exe'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 模糊匹配：扫描 %LOCALAPPDATA%/Programs 下含 "trae" 的目录
  try {
    const programsRoot = path.join(localAppData, 'Programs');
    if (fs.existsSync(programsRoot)) {
      const dirs = fs.readdirSync(programsRoot);
      for (const d of dirs) {
        if (d.toLowerCase().includes('trae')) {
          const exe = path.join(programsRoot, d, 'Trae CN.exe');
          if (fs.existsSync(exe)) return exe;
        }
      }
    }
  } catch {}

  return null;
}

// ── 方法 4：多磁盘快速扫描（秒级，最后兜底） ──────────────────

/**
 * 枚举所有固定驱动器，检查每个盘的 Program Files / Program Files (x86)
 * 下是否有 Trae CN。不递归扫描，只检查已知的安装目录模式。
 */
function findByDriveScan() {
  if (process.platform !== 'win32') return null;

  // 获取所有固定磁盘
  let drives = [];
  try {
    const out = run('wmic logicaldisk where drivetype=3 get name', 3000);
    drives = out.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /^[A-Z]:$/.test(l));
  } catch {}

  // wmic 不可用时回退到常用盘符
  if (!drives.length) {
    drives = [];
    for (let code = 67; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      try {
        fs.accessSync(`${letter}:\\`, fs.constants.F_OK);
        drives.push(`${letter}:`);
      } catch {}
    }
  }

  const searchPatterns = (drive) => [
    path.join(drive, 'Program Files', 'Trae CN', 'Trae CN.exe'),
    path.join(drive, 'Program Files (x86)', 'Trae CN', 'Trae CN.exe'),
  ];

  for (const drive of drives) {
    for (const p of searchPatterns(drive)) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
  }

  return null;
}

// ── 统一入口 ──────────────────────────────────────────────────

/**
 * 按速度由快到慢依次尝试 4 种扫描方式。
 * @returns {string|null} Trae CN.exe 完整路径，找不到返回 null
 */
function findTraeCN() {
  const methods = [
    { name: 'registry',   fn: findByRegistry },
    { name: 'start-menu', fn: findByStartMenu },
    { name: 'candidates', fn: findByCandidates },
    { name: 'drive-scan', fn: findByDriveScan },
  ];

  for (const { name, fn } of methods) {
    try {
      const result = fn();
      if (result) {
        console.log(`[秒切] 通过 [${name}] 找到 Trae CN: ${result}`);
        return result;
      }
    } catch (err) {
      console.warn(`[秒切] ${name} 扫描异常:`, err.message);
    }
  }

  console.warn('[秒切] 所有方法均未找到 Trae CN');
  return null;
}

module.exports = { findTraeCN, findByRegistry, findByStartMenu, findByCandidates, findByDriveScan };
