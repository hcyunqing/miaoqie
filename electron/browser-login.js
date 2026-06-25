// electron/browser-login.js
// 弹窗登录 Trae CN 官网，页面跳转时自动检查 Cookie 并导入账号
//
// 流程：
// 1. 打开登录弹窗（使用默认 session）
// 2. 用户手动完成登录
// 3. 页面跳转时自动检查 Cookie
// 4. 检测到登录成功 Cookie 后自动关闭弹窗并处理登录
//

const { BrowserWindow } = require('electron');
const https = require('https');
const util = require('util');

// 安全日志函数
function safeLog(...args) {
  const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const msg = util.format(...args);
  const cleaned = msg.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  console.log(`[${timestamp}] [browser-login] ${cleaned}`);
  // 同时写入日志文件
  const fs = require('fs');
  const path = require('path');
  const logPath = path.join(process.env.APPDATA || '.', 'miaoqie-login.log');
  try { fs.appendFileSync(logPath, `[${timestamp}] ${cleaned}\n`); } catch (e) {}
}

const LOGIN_URL = 'https://www.trae.cn/login';
const API_HOST = 'api.trae.com.cn';
const LOGIN_COOKIE_NAMES = ['sessionid', 'X-Cloudide-Session', 'sid_tt', 'passport_auth_status'];

let loginWin = null;
let loginDone = false;
let cookieCheckInterval = null;

function startBrowserLogin(options) {
  const { parentWindow, onSuccess, onFailed, onCancelled, onStatusChange } = options;
  closeBrowserLogin();
  loginDone = false;

  // 创建窗口 — 不指定 partition，使用默认 session
  loginWin = new BrowserWindow({
    width: 480,
    height: 720,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: parentWindow || null,
    modal: !!parentWindow,
    show: true,
    center: true,
    title: '登录 Trae CN',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // ⚠️ 无 partition，使用默认 session，这样 Cookie 和主窗口共享
    },
  });

  loginWin.setMenuBarVisibility(false);

  // 获取窗口的 session（默认 session）
  const ses = loginWin.webContents.session;

  // 清除旧的 trae.cn Cookie
  clearTraeCookies(ses).then(() => {
    safeLog('已清除旧 Cookie，加载登录页...');
    if (onStatusChange) onStatusChange('正在加载登录页...');
    loginWin.loadURL(LOGIN_URL);
  });

  // 页面跳转监听
  loginWin.webContents.on('did-navigate', (event, url) => {
    safeLog('页面跳转: %s', url);
    if (loginDone) return;

    try {
      const urlObj = new URL(url);
      if (!urlObj.pathname.includes('/login')) {
        safeLog('跳转到非登录页，开始检查登录状态...');
        if (onStatusChange) onStatusChange('登录成功，正在验证...');
        startCookieCheck(ses, onSuccess, onFailed, onStatusChange);
      } else {
        if (onStatusChange) onStatusChange('请在页面中完成登录');
      }
    } catch (e) {
      safeLog('解析 URL 失败: %s', e.message);
    }
  });

  // 页面加载完成监听（额外触发一次检查）
  loginWin.webContents.on('did-finish-load', () => {
    const url = loginWin.webContents.getURL();
    safeLog('页面加载完成: %s', url);
    if (loginDone) return;
    try {
      const urlObj = new URL(url);
      if (!urlObj.pathname.includes('/login')) {
        safeLog('页面加载完成（非登录页），检查登录状态...');
        startCookieCheck(ses, onSuccess, onFailed, onStatusChange);
      }
    } catch (e) {}
  });

  // 用户关闭窗口（兜底）
  loginWin.on('closed', () => {
    loginWin = null;
    if (!loginDone) {
      loginDone = true;
      safeLog('窗口关闭，读取 Cookie（兜底）...');
      if (onStatusChange) onStatusChange('正在读取登录信息...');
      stopCookieCheck();
      handleLoginSuccess(ses, onSuccess, onFailed, onStatusChange);
    }
  });

  loginWin.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    safeLog('加载失败: %s (%s)', errorDescription, validatedURL);
    if (onStatusChange) onStatusChange('加载失败: ' + errorDescription);
  });
}

function startCookieCheck(ses, onSuccess, onFailed, onStatusChange) {
  stopCookieCheck();
  let checkCount = 0;
  const maxChecks = 30; // 最多检查 30 次（15 秒）
  safeLog('开始轮询检查 Cookie...');

  cookieCheckInterval = setInterval(async () => {
    if (loginDone) { stopCookieCheck(); return; }
    checkCount++;
    try {
      const cookies = await ses.cookies.get({});
      safeLog('检查(%d/%d) Cookie数量: %d', checkCount, maxChecks, cookies.length);
      
      // 列出所有 Cookie
      cookies.forEach(c => {
        safeLog('  Cookie: %s = %s (domain=%s)', c.name, c.value.substring(0, 30), c.domain);
      });

      const hasLogin = cookies.some(c =>
        LOGIN_COOKIE_NAMES.some(name => c.name === name || c.name.toLowerCase().includes(name.toLowerCase()))
      );

      if (hasLogin) {
        safeLog('检测到登录成功 Cookie!');
        stopCookieCheck();
        handleLoginSuccess(ses, onSuccess, onFailed, onStatusChange);
        return;
      }
      if (checkCount >= maxChecks) {
        safeLog('检查超时，停止轮询');
        stopCookieCheck();
      }
    } catch (e) {
      safeLog('检查 Cookie 失败: %s', e.message);
    }
  }, 500);
}

function stopCookieCheck() {
  if (cookieCheckInterval) {
    clearInterval(cookieCheckInterval);
    cookieCheckInterval = null;
  }
}

async function handleLoginSuccess(ses, onSuccess, onFailed, onStatusChange) {
  if (loginDone) return;
  loginDone = true;

  try {
    if (onStatusChange) onStatusChange('正在读取登录信息...');
    const cookies = await ses.cookies.get({});
    safeLog('读取到 %d 个 Cookie', cookies.length);

    if (cookies.length === 0) {
      safeLog('未检测到 Cookie');
      if (onStatusChange) onStatusChange('未检测到登录信息');
      if (onFailed) onFailed(new Error('未检测到登录 Cookie'));
      closeBrowserLogin();
      return;
    }

    // 检查登录 Cookie
    const hasLogin = cookies.some(c =>
      LOGIN_COOKIE_NAMES.some(name => c.name === name || c.name.toLowerCase().includes(name.toLowerCase()))
    );
    if (!hasLogin) {
      safeLog('未检测到登录成功 Cookie');
      if (onStatusChange) onStatusChange('未登录或登录已过期');
      if (onFailed) onFailed(new Error('未登录或登录已过期'));
      closeBrowserLogin();
      return;
    }

    // 构造 Cookie 字符串
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    safeLog('Cookie 字符串(前500): %s', cookieString.substring(0, 500));

    closeBrowserLogin();

    // 调 GetUserInfo API
    safeLog('正在调用 GetUserInfo API...');
    const apiRes = await callApi('/cloudide/api/v3/trae/GetUserInfo', cookieString);
    safeLog('GetUserInfo 响应: %s', JSON.stringify(apiRes));

    if (apiRes && apiRes.ResponseMetadata && apiRes.ResponseMetadata.Error && apiRes.ResponseMetadata.Error.Code !== '0') {
      const errMsg = apiRes.ResponseMetadata.Error.Message;
      safeLog('GetUserInfo 返回错误: %s', errMsg);
      if (onStatusChange) onStatusChange('验证失败: ' + errMsg);
      if (onFailed) onFailed(new Error('API 调用失败: ' + errMsg));
      return;
    }

    const userInfo = extractUserInfo(apiRes);

    // 调 GetUserToken API 获取 token
    let tokenInfo = {};
    try {
      safeLog('正在调用 GetUserToken API...');
      const tokenRes = await callApi('/cloudide/api/v3/trae/GetUserToken', cookieString);
      safeLog('GetUserToken 响应: %s', JSON.stringify(tokenRes));
      
      if (tokenRes && tokenRes.Result && tokenRes.Result.Token) {
        tokenInfo = {
          token: tokenRes.Result.Token,
          expiredAt: tokenRes.Result.ExpiredAt || '',
          tokenUserId: tokenRes.Result.UserID || '',
          tokenTenantId: tokenRes.Result.TenantID || '',
        };
      }
    } catch (e) {
      safeLog('GetUserToken 调用失败（非致命）: %s', e.message);
    }

    // 优先用 token 中的 userId/tenantId
    const finalUserId = tokenInfo.tokenUserId || userInfo.userId || '';
    const finalTenantId = tokenInfo.tokenTenantId || userInfo.tenantId || '';

    if (!userInfo || (!userInfo.email && !userInfo.name && !finalUserId)) {
      safeLog('未获取到用户信息');
      if (onStatusChange) onStatusChange('未登录或登录已过期');
      if (onFailed) onFailed(new Error('未登录或登录已过期'));
      return;
    }

    safeLog('登录成功! 用户: %s (userId=%s, tenantId=%s)', userInfo.name || userInfo.email || finalUserId, finalUserId, finalTenantId);
    if (onStatusChange) onStatusChange('登录成功: ' + (userInfo.name || userInfo.email || finalUserId));
    if (onSuccess) onSuccess(cookieString, userInfo, tokenInfo);
  } catch (e) {
    safeLog('处理登录时出错: %s', e.message);
    safeLog('堆栈: %s', e.stack);
    if (onStatusChange) onStatusChange('错误: ' + e.message);
    if (onFailed) onFailed(e);
  }
}

function closeBrowserLogin() {
  stopCookieCheck();
  if (loginWin && !loginWin.isDestroyed()) {
    try { loginWin.close(); } catch (e) { safeLog('关闭窗口失败: %s', e.message); }
  }
  loginWin = null;
}

function clearTraeCookies(ses) {
  return ses.cookies.get({}).then(cookies => {
    const traeCookies = cookies.filter(c =>
      c.domain && (c.domain.includes('trae.cn') || c.domain.includes('bytedance') || c.domain.includes('volcengine') || c.domain.includes('trae.com.cn'))
    );
    safeLog('清除 %d 个旧 Cookie', traeCookies.length);
    const promises = traeCookies.map(c => {
      const url = `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path || '/'}`;
      return ses.cookies.remove(url, c.name).catch(e => {
        safeLog('清除 Cookie 失败: %s - %s', c.name, e.message);
      });
    });
    return Promise.all(promises);
  }).catch(e => {
    safeLog('清除 Cookie 出错: %s', e.message);
  });
}

function callApi(path, cookieString) {
  return new Promise((resolve, reject) => {
    const postData = '{}';
    const options = {
      hostname: API_HOST,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': cookieString,
        'Origin': 'https://www.trae.cn',
        'Referer': 'https://www.trae.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };
    safeLog('调用 API: https://%s%s', API_HOST, path);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('解析响应失败: ' + e.message)); }
      });
    });
    req.on('error', e => reject(new Error('请求失败: ' + e.message)));
    req.write(postData);
    req.end();
  });
}

function extractUserInfo(res) {
  if (!res) return {};
  const candidates = [res, res.data, res.Result, res.result, res.ResponseMetadata && res.ResponseMetadata.Result];
  for (const obj of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    if (obj.email || obj.name || obj.UserName || obj.Email || obj.ScreenName || obj.UserID || obj.userId) {
      return {
        email: obj.email || obj.Email || obj.NonPlainTextEmail || '',
        name: obj.name || obj.UserName || obj.userName || obj.ScreenName || '',
        avatarUrl: obj.avatarUrl || obj.AvatarUrl || obj.picture || '',
        userId: obj.userId || obj.UserId || obj.UserID || '',
        tenantId: obj.TenantID || obj.tenantId || '',
      };
    }
  }
  return {};
}

module.exports = { startBrowserLogin, closeBrowserLogin };
