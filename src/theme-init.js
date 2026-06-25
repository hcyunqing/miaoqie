try {
  // 迁移旧主题设置 (traeswitch-cn-theme -> miaoqie-theme)
  const oldTheme = localStorage.getItem('traeswitch-cn-theme');
  if (oldTheme) {
    localStorage.setItem('miaoqie-theme', oldTheme);
    localStorage.removeItem('traeswitch-cn-theme');
  }
  
  const t = localStorage.getItem('miaoqie-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  /* ignore */
}
