# MiaoQie (秒切)

[简体中文](./README.md)

**Local multi-account session manager for Trae CN — open source, local-only, manual switch**

MiaoQie lets you manage multiple Trae CN (Chinese edition) accounts and switch IDE sessions with one click on Windows — no more repeated logins.

> ⚠️ **Trae CN only.** This tool does not support Trae International (Global) edition.

---

## What is MiaoQie

MiaoQie is an **Electron desktop app** with one job: **manually** switch IDE sessions among multiple Trae CN accounts that you **legitimately own**.

| Feature | MiaoQie | Common alternatives |
|---------|---------|---------------------|
| 🔒 Data | ✅ 100% local, no remote server | ⚠️ Some use cloud or unauditable code |
| 🔄 Switch | ✅ Manual only — you decide | ⚠️ Some auto-rotate on quota exhaustion |
| 📖 Code | ✅ MIT open source, auditable | ❌ Mostly closed source |
| 🔍 Detection | ✅ Auto-scan registry, Start Menu, all drives | ❌ Manual path entry |
| 🌐 Login | ✅ Browser login (2FA), token, IDE import | ⚠️ Usually token-only |

> 🚫 **Not a quota-arbitrage tool.** No auto-switch, no API proxy, no credential upload.

---

## Features

| Module | Description |
|--------|-------------|
| 👤 Accounts | Browser login / paste token / IDE import; search, sort & notes |
| 🔄 Switch | Write session & restart Trae CN; system tray quick switch |
| 🔑 Renewal | Browser re-login, cookie-based token refresh |
| 💾 Backup | JSON export with AES-256-GCM encryption; scheduled auto-backup |
| 🔍 Auto-scan | Startup scan: registry → Start Menu → common paths → all drives |
| 🎨 UI | Dark / light theme, Chinese / English; frameless window with rounded corners |
| ⚙️ Advanced | Environment cleanup & device ID management — only when sessions break |

---

## Disclaimer

- ✅ For **accounts you legitimately own** only
- 🔒 All tokens & cookies stay on your machine — never uploaded
- ⚠️ Use **may violate Trae CN ToS** — account suspension risk is yours
- 🚫 No bulk registration, quota arbitrage, or billing circumvention
- ⚡ "Clean switch" & device ID changes are advanced — may trigger platform risk controls

You must accept the in-app disclaimer on first launch.

---

## Installation

### Run from source

```bash
git clone https://gitee.com/yunqingsir/miaoqie.git
cd miaoqie
npm install
npm start
```

### Build installer

```bash
npm run dist:win    # Build Windows x64 installer → release/
```

Output:
- `release/秒切-{version}-win-x64.exe` — NSIS installer
- `release/秒切-{version}-win-x64.zip` — Portable zip

---

## Quick start

```
Launch → Accept disclaimer → Set Trae CN path → Add account → Switch
```

**Path setup**: On first launch, MiaoQie auto-scans your system for Trae CN (registry → Start Menu → common paths → multi-drive scan). If not found, you can select `Trae CN.exe` manually.

**Add account** — pick one:

| Method | How |
|--------|-----|
| 🌐 Browser login (recommended) | Pop-up login at `www.trae.cn` with 2FA; auto-added on success |
| 📋 Paste token | F12 → Network → filter `GetUserToken` → copy from response |
| 📥 Import from IDE | Log in within Trae CN, then one-click import current session |

**Switch**: Click **Switch** on the account page. Trae CN closes and reopens with the target session. Save unsaved work first.

**Switch modes**:

| Button | Description |
|--------|-------------|
| 🔄 Switch | Daily use: write session & restart Trae CN |
| ⚡ Clean switch | Advanced: clean cache & device ID first — only when sessions break |

**Backup & migration**: Export JSON from Accounts (optional encryption); import to restore or share between machines.

---

## Data locations

| Item | Path |
|------|------|
| MiaoQie app data | `%APPDATA%/miaoqie-data/` |
| Trae CN data directory | `%USERPROFILE%/.trae-cn/` |
| Trae CN AppData | `%APPDATA%/Trae CN/` |

---

## FAQ

| Question | Answer |
|----------|--------|
| Trae CN didn't reopen after switch? | Verify the path in Settings points to a valid `Trae CN.exe` |
| Invalid token? | Check for expiry; prefer browser login to refresh |
| Still shows old account? | Close Trae CN manually, try "clean switch" |
| macOS support? | Trae CN is Windows-only; MiaoQie follows this |

---

## Development

```
miaoqie/
├── electron/     # Main process: switch, API, login, cleanup, tray, path scanner
├── src/          # Renderer UI (HTML / CSS / JS)
├── build/        # Icons & screenshots
└── scripts/      # Icon generation, release scripts
```

Stack: Electron 35 · Vanilla JS · electron-store · i18n (ZH / EN)

```bash
npm start           # Start dev mode
npm run dist:win    # Build Windows installer
```

---

## License

[MIT](LICENSE) — Additional restriction: you may not use this software to circumvent Trae CN billing, quota limits, or terms of service.
