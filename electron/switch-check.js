const { isTraeRunning } = require('./trae-switcher');
const { isTokenExpired, isAccountTokenExpired } = require('./trae-api');
const accountStore = require('./account-store');

async function checkBeforeSwitch(id) {
  let account = accountStore.getAccount(id);
  const warnings = [];
  const blockers = [];

  // Try to refresh token if expired or missing, as long as we have cookies
  if (account.cookies && (!account.token || isTokenExpired(account.token))) {
    try {
      await accountStore.ensureValidToken(id);
      account = accountStore.getAccount(id);
      warnings.push('Token 已自动刷新');
    } catch (err) {
      // If token refresh fails but we still have cookies, allow switch
      // (switchTraeAccount will try again to refresh from cookies)
      if (!account.token) {
        warnings.push('Token 刷新失败，将在切换时重试');
      } else {
        blockers.push(`Token 刷新失败：${err.message}`);
      }
    }
  }

  // Only block if no token AND no cookies (truly cannot switch)
  if (!account.token && !account.cookies) {
    blockers.push('账号没有有效的 Token 和 Cookie，无法切换');
  } else if (account.token && isAccountTokenExpired(account) && !account.cookies) {
    blockers.push('Token 已过期，请先续登');
  } else if (account.token && accountStore.isTokenExpiringSoon(account)) {
    if (account.cookies) {
      try {
        await accountStore.refreshAccountToken(id);
        account = accountStore.getAccount(id);
        warnings.push('Token 已提前刷新');
      } catch {
        warnings.push('Token 即将过期，自动刷新失败');
      }
    } else {
      warnings.push('Token 即将过期，建议续登');
    }
  }

  if (isTraeRunning()) {
    warnings.push('Trae CN 正在运行，切换时会自动关闭');
  }

  return {
    canSwitch: blockers.length === 0,
    warnings,
    blockers,
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      machineId: account.machineId,
    },
  };
}

module.exports = { checkBeforeSwitch };
