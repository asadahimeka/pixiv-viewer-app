# Development Guide

English | [简体中文](./Development.zh-CN.md)

> Back to [README](../README.md)

## 📦 Requirements

- **Node.js >= 18** (`engines` in `package.json`)
- **pnpm >= 9** — enforced via `preinstall` (`only-allow pnpm`); the repo pins `pnpm@9.15.9` via `packageManager`
- Rust toolchain (only for Tauri desktop builds / `dev:tauri`)
- Android SDK (only for building the APK locally)

## 🚀 Quick Start

```bash
# Install dependencies (pnpm workspace: root + packages/*)
pnpm install

# Web development (http://localhost:8080, hot reload)
npm run dev:web
```

> Note: `dev:web` sets `VUE_APP_PLATFORM=android`, so the browser build runs with the same platform flags as the Android client.

## 🛠️ NPM Scripts

| Script | Description |
| --- | --- |
| `dev:web` | Web dev server (port 8080, `VUE_APP_PLATFORM=android`) |
| `dev:tauri` | Tauri desktop dev (requires Rust) |
| `dev:web:tauri` | Web dev server with `VUE_APP_PLATFORM=tauri` |
| `build:web` | Production web build → `dist/` |
| `build:web:tauri` | Web build with Tauri browserslist/platform env |
| `build:and` | Android: web build (`BROWSERSLIST_ENV=capacitor`) + `npx cap sync android` |
| `build:and:dev` | Same as above with `BROWSERSLIST_ENV=development` (faster, less optimized) |
| `build:ios` | iOS: web build + `npx cap sync ios` (unsigned) |
| `build:ios:dev` | Same as above with `BROWSERSLIST_ENV=development` |
| `build:win` | Windows desktop build (Tauri, x86_64-pc-windows-msvc) |
| `build:mac` | macOS desktop build (Tauri, universal-apple-darwin) |
| `lint` | ESLint check + auto-fix for `src/**/*.{js,vue}` |
| `bump` | Bump version across all platform configs (see below) |
| `check-version` | Verify version consistency across all configs (used by CI) |

## 🏗️ Platform Abstraction

The whole app is built around the `VUE_APP_PLATFORM` env var:

| Value | Runtime | Init file |
| --- | --- | --- |
| `android` | Capacitor | `src/platform/capacitor/init.js` |
| `ios` | Capacitor | `src/platform/capacitor/init.js` |
| `tauri` | Tauri | `src/platform/tauri/init.js` |

- `src/main.js` dynamically imports the platform init based on `VUE_APP_PLATFORM`.
- **The platform init is where Vue is mounted** (`new Vue({...}).$mount('#app')`). If no platform matches, the app never mounts.
- `src/platform/index.js` exposes flags: `isCapacitor`, `isTauri`, `isAndroid`, `isIOS`, `current`.
- Platform init does all of: import global styles, register Vant/Vue plugins/directives, register global components (`WfCont`, `TopBar`, `Pximg`), set up SafeArea / StatusBar / deep links / error tracking, then mount Vue.

When adding platform-specific code, create a module under `src/platform/capacitor/` or `src/platform/tauri/`, keep the exported function signatures identical, import it dynamically, and guard call sites with `platform.isCapacitor` / `platform.isTauri`.

## 📁 Project Structure

```
src/
├── api/           # API calls + HTTP client (axios)
│   ├── index.js   # Main API module — all endpoint functions
│   ├── http.js    # Axios instance + interceptors
│   ├── client/    # Direct-connect local API (OAuth + Pixiv App API)
│   └── user.js
├── assets/        # Global styles (Stylus)
├── components/    # Shared components (image layouts, cards, etc.)
├── consts/        # Env vars, API URLs, constants
├── icons/         # SVG icon loader + components
├── i18n.js        # vue-i18n setup
├── layouts/       # BaseLayout.vue, MainLayout.vue
├── lib/           # Third-party wrappers: lodash, vant, vant-apis, polyfill
├── locales/       # 14 locale JSON files (zh-CN is default)
├── platform/      # Capacitor + Tauri platform modules
├── router/        # Vue Router config (history mode)
├── store/         # Vuex store (single store)
├── utils/         # storage, filter, font, novel, translate, ugoira, sync...
└── views/         # Page components (Home, Search, Rank, Artwork, Users...)
```

The repo is a **pnpm workspace**; `packages/` contains 8 custom Capacitor plugins maintained in-tree:

`capacitor-filesystem`, `capacitor-mediastore`, `capacitor-navigation-bar`, `capacitor-plugin-file-opener`, `capacitor-plugin-filedownload`, `capacitor-plugin-pixiv-cronet`, `capacitor-plugin-pixiv-login`, `capacitor-plugin-saf`

## 🔢 Version Management

Versions must stay in sync across `package.json`, `capacitor.config.json` (User-Agent strings), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` + `Cargo.lock`, `android/app/build.gradle` (`versionName`/`versionCode`) and the iOS `project.pbxproj` (`MARKETING_VERSION`).

```bash
# Bump: node scripts/bump.mjs <patch|minor|major|x.y.z>
pnpm bump patch

# Verify consistency (CI runs this before building)
pnpm check-version
```

## 🎨 Code Style

- **ESLint is the only formatter** — there is no Prettier; `lintOnSave: false` in `vue.config.js`. Prefer linting only the files you changed: `npx eslint src/path/to/file.vue --fix`
- Single quotes, **no semicolons**, 2-space indentation
- Trailing commas in multiline arrays/objects/imports/exports, **never** in function parameters
- Named exports only from `@/utils`; no default exports from utility modules
- Vue SFC tag order (ESLint-enforced): `<template>` → `<script>` → `<style lang="stylus" scoped>`
- File naming: components `PascalCase.vue`, JS modules `camelCase.js`, component dirs `PascalCase/`
- Import aliases: `@/` = `src/`; relative imports for sibling components
- **No TypeScript.** No test framework — verification is manual and lint-based
- `no-console` is off; production builds drop console calls via Terser

### Vant UI (v2) — Important

- **Do NOT** `import { X } from 'vant'` — this triggers `babel-plugin-import` and pulls in the `vant/es/*` ESM build, duplicating the `vant/lib/*` CJS build that is already registered globally. All Vant code must use ONE build (`vant/lib/*`).
- Template components are globally registered via `Vue.use()` in `src/lib/vant.js` (Button/Toast/Search/Tabs/List/Popup/Dialog/Icon/Loading/Progress etc.) — use `<van-xxx>` directly in templates, no import needed.
- Imperative APIs (`Dialog.confirm`, `Toast.success`, `ImagePreview`, `Notify`, `Locale`) must be imported from the central facade:

  ```js
  import { Dialog, Toast, ImagePreview, Notify, Locale } from '@/lib/vant-apis'
  ```

- New components: if not in the `src/lib/vant.js` global registration list, either register it there or import it directly via `vant/lib/xxx`, and add its style to `src/lib/vant-style.js`.

## 🌍 i18n

- Locales live in `src/locales/` (14 languages; `zh-CN` is the default and source of truth)
- Use semantic keys (e.g. `$t('appSetting.download')`), not hashes
- Add new keys to `zh-CN.json` first, then other locale files as needed
- Most non-Chinese translations are machine-generated — improvements are very welcome
- `$t('key')` in templates, `i18n.t('key')` in JS

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

For bugs and feature requests, use [GitHub Issues](https://github.com/asadahimeka/pixiv-viewer/issues).

## 🔗 See Also

- [Architecture & Technical Details](./Architecture.md)
- [Deployment](./Deployment.md)
