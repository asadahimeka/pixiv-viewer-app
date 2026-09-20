# AGENTS.md — Pixiv Viewer

## ⚠️ CRITICAL RULES

### Never Modify Code Without Explicit Request
- **INVESTIGATE ≠ IMPLEMENT**. "look into", "check", "find" → report only.
- "explain", "how does X work" → answer only.
- Do not write code, edit files, or create features unless explicitly asked.

### Never Delete Files Without Explicit Request
- "revert" → revert changes with `git restore`, not delete files.
- When in doubt → ask.

### Never Commit to Git Without Explicit Request
- Do not stage, commit, or push changes unless the user directly says "commit" or "push".
- Even if work is complete, wait for instruction.

---

## Pre-Implementation Protocol

Before writing any code or modifying any file, you MUST follow this protocol:

### Step 1 — Restate Understanding
In your own words, explain:
- What problem you're solving and what the deliverable is.
- Any assumptions you're making or things you're uncertain about.
- If you see a better technical approach, propose it — the user decides.

### Step 2 — Ask Key Questions
Ask no more than **3** questions until you have 100% clarity on:
1. **The real goal** — what the user actually wants to achieve (not just what they said).
2. **Unstated constraints** — tech stack limits, performance requirements, code that must not be touched, etc.
3. **Your implementation plan** — core approach, why this solution, what tradeoffs exist.

### Step 3 — Wait for Go-Ahead
**Do not write code or modify files** until the user explicitly says to proceed.

---

## Project Overview

**Stack**: Vue 2.7 + Vuex 3 + Vue Router 3 + Vant 2.x + Capacitor 5 + Tauri 2
**Language**: JavaScript (ES6+), **NO TypeScript**
**CSS**: Stylus (`.styl`), **NOT SCSS**
**Package Manager**: pnpm (workspace in `packages/` — 6 custom Capacitor plugins)
**No test framework**. No formatter config.

---

## Build Commands

```bash
npm run dev:web           # Web dev (port 8080, VUE_APP_PLATFORM=android)
npm run dev:tauri         # Tauri desktop dev
npm run build:web         # Production web build
npm run build:and         # Android APK (Capacitor)
npm run build:ios         # iOS IPA (Capacitor, unsigned)
npm run build:win         # Windows (Tauri, x86_64-msvc)
npm run build:mac         # macOS (Tauri, universal)
npm run lint              # ESLint check + auto-fix（尽量不跑全量 lint，而是只对改动文件做 lint 检查）
```

**CI**: GitHub Actions workflows in `.github/workflows/` — manual dispatch only.
**Key CI env vars**: `VUE_APP_PLATFORM`, `BROWSERSLIST_ENV`, and many `VUE_APP_*` secrets for API endpoints (see CI workflow files).

---

## Platform Abstraction (Critical)

The entire app is built around `VUE_APP_PLATFORM` env var:

| Value   | Runtime     | Init file                   |
|---------|-------------|-----------------------------|
| android | Capacitor   | `src/platform/capacitor/init.js` |
| ios     | Capacitor   | `src/platform/capacitor/init.js` |
| tauri   | Tauri       | `src/platform/tauri/init.js`     |

- `src/main.js` dynamically imports the platform init based on `VUE_APP_PLATFORM`.
- **Platform init IS where Vue is mounted** (`new Vue({...}).$mount('#app')`). If no platform matches, the app never mounts.
- `src/platform/index.js` exposes flags: `isCapacitor`, `isTauri`, `isAndroid`, `isIOS`, `current`.
- Web dev (`dev:web`) always runs as `android` platform.

**Platform init does all of**: imports global styles, registers Vant/Vue plugins/directives, registers global components (`WfCont`, `TopBar`, `Pximg`), sets up SafeArea, StatusBar, deep links, error tracking, and then mounts Vue.

---

## Code Style

### Conventions
- **Quotes**: Single. **Semicolons**: No.
- **Indentation**: 2 spaces.
- **Commas**: Trailing in multiline arrays/objects/imports/exports. **Never** in functions.
- **Named exports only** from `@/utils`. No default exports from utility modules.

### eslintrc.js Highlights
```js
quotes: ['warn', 'single']
semi: ['warn', 'never']
camelcase: 'off'
eqeqeq: 'off'
'no-console': 'off'
'vue/multi-word-component-names': 'off'
'vue/component-tags-order': ['warn', { order: [['script', 'template'], 'style'] }]
'comma-dangle': ['warn', { functions: 'never', ...everythingElse: 'always-multiline' }]
'space-before-function-paren': ['warn', { anonymous: 'always', named: 'never', asyncArrow: 'always' }]
```

### File Naming
- Vue components: `PascalCase.vue` (e.g., `HomeAll.vue`, `ImageCard.vue`)
- JS modules: `camelCase.js` (e.g., `storage.js`, `filter.js`)
- Component dirs: `PascalCase/` (e.g., `Home/components/`)
- Index files: `index.js`

### Vue Component Tag Order (ESLint-enforced)
```html
<template>...</template>
<script>...</script>
<style lang="stylus" scoped>...</style>
```

### Import Paths
- `@/` = `src/` (webpack alias)
- `import { copyText } from '@/utils'` — named exports
- `import _ from '@/lib/lodash'` — lodash wrapper
- Relative imports for siblings: `import Sibling from './Sibling.vue'`

---

## Architecture

### Directory Layout
```
src/
├── api/           # API calls + HTTP client (axios)
│   ├── index.js   # Main API module — all endpoint functions
│   ├── http.js    # Axios instance + interceptors
│   ├── client/    # Direct-connect local API (OAuth + Pixiv API)
│   └── user.js
├── assets/        # Global styles (Stylus)
├── components/    # Shared components (25 files incl. layouts-like)
├── consts/        # Env vars, API URLs, constants
├── icons/         # SVG icon loader + components
├── i18n.js        # vue-i18n setup
├── layouts/       # BaseLayout.vue, MainLayout.vue
├── lib/           # Third-party wrappers: lodash, vant, polyfill, vant-style
├── locales/       # 14 locale JSON files (zh-CN is default)
├── platform/      # Capacitor + Tauri platform modules
├── router/        # Vue Router config (history mode)
├── store/         # Vuex store (single store)
├── utils/         # Utilities: storage, filter, font, novel, translate, ugoira
└── views/         # Page components (12 view dirs + NotFound.vue)
```

### Vuex Store
- Single store in `src/store/index.js` (no modules).
- App settings in `state.appSetting` — persisted to LocalStorage under `PXV_APP_SETTING`.
- Getters: `isLoggedIn`, `isR18On`, `blockTagsSet`, `blockUidsSet`, `isCensored`, `wfProps`.
- State includes `contentSetting` (R18/AI filters), `blockTags`, `blockUids`, `routeHistory`.

### API Layer
- **Axios** instance in `src/api/http.js` with nprogress loading bar.
- Base URL from `HIBIAPI_BASE` in LocalStorage (default: `VUE_APP_DEF_HIBIAPI_MAIN`).
- Response pattern: `{ status: 0, data: ... }` on success, `{ status: -1, msg: ... }` on error.
- Aggressive caching via `getCache()`/`setCache()` from `@/utils/storage/siteCache` (localforage-backed).
- Some endpoints use `SessionStorage` for search results.
- `src/api/client/` contains OAuth login + direct Pixiv API mode (optional, not always used).

### Two Layouts
1. **BaseLayout** — outermost wrapper, provides global chrome.
2. **MainLayout** — inner wrapper with `safeArea` and `showNav` props. Handles nav bar, status bar, scroll handling.

### Route Structure
- All routes nested under `/` → BaseLayout → MainLayout.
- MainLayout used twice: once with nav (depth 1 pages: Home, Search, Rank, Following, Setting), once without nav (detail pages: Artwork, Novel, Users, etc.).
- Meta `__depth` controls UI behavior (1 = primary nav, 2+ = sub-pages).
- Extensive route aliases matching Pixiv web URLs (`/artworks/:id`, `/novel/:id`, `/users/:id`, `/member.php`, etc.).
- History mode, base URL from `BASE_URL` const.

### Image Handling
- All pximg URLs proxied through `imgProxy()` in `src/api/index.js` — replaces `i.pximg.net` with `PXIMG_PROXY_BASE`.

### CSS
- PostCSS `postcss-pxtorem` with `rootValue: 75` — 75px = 1rem. Selector blacklist: `van`, `fancybox`, `ispx`.
- Dark mode: `localStorage.PXV_DARK` flag adds `.dark` class to body
- Theme color: CSS variable `--accent-color` from `localStorage.PXV_ACT_COLOR`

### Vant UI (v2) — IMPORTANT import conventions
- **DO NOT** `import { X } from 'vant'` — this triggers babel-plugin-import and pulls in the `vant/es/*` ESM build, duplicating the `vant/lib/*` CJS build already registered globally. All vant code must use ONE build (`vant/lib/*`).
- **Template components**: already globally registered via `Vue.use()` in `src/lib/vant.js` (39 components: Button/Toast/Search/Tabs/List/Popup/Dialog/Icon/Loading/Progress etc. — use `<van-xxx>` directly, NO import needed.
- **Imperative APIs** (Dialog.confirm, Toast.success, ImagePreview, Notify, Locale): import from the central facade `@/lib/vant-apis` (re-exports `vant/lib/*` + needed styles):
  ```js
  import { Dialog, Toast, ImagePreview, Notify, Locale } from '@/lib/vant-apis'
  ```
  NOT `from 'vant'`. `this.$toast`/`$dialog`/`$notify` prototypes exist (from lib registration) but prefer explicit imports for clarity.
- **New components**: if a component is NOT in the `vant.js` global registration list (e.g. Progress), either register it there or import it directly via `vant/lib/xxx` (component) + ensure its style is in `src/lib/vant-style.js`.
- **Styles**: component styles live in `src/lib/vant-style.js` (lib path, one per component) — add new components' styles there, not via babel-plugin-import.

---

## Common Tasks

### Adding a View
1. Create `src/views/FeatureName/index.vue` (or `FeatureName.vue`)
2. Add route in `src/router/routes.js` — follow existing patterns for depth/meta
3. Sub-components go in `src/views/FeatureName/components/`

### Adding i18n Keys
1. Add to `src/locales/zh-CN.json` first (default locale)
2. Add translations to other locale files as needed
3. Use `$t('key')` in templates, `i18n.t('key')` in JS
4. 使用语义化的`key`，不要使用 hash
5. 避免直接写入大量 i18n 文件，考虑使用脚本

### Adding Dependencies
```bash
pnpm add <package>
pnpm add -D <package>
```
If it's a UI library, add tree-shaking config to `babel.config.js`.

### Adding Platform-Specific Code
1. Create module in `src/platform/capacitor/` or `src/platform/tauri/`
2. Export functions with same interface
3. Use dynamic import in main code
4. Guard with `if (platform.isCapacitor)` / `if (platform.isTauri)`

---

## Key Quirks & Gotchas

- **No TypeScript.** Never use `.ts` files or type annotations.
- **No Prettier.** ESLint is the only formatter. `lintOnSave: false` in vue.config.js.
- **`npm run dev:web` sets `VUE_APP_PLATFORM=android`** for Capacitor parity in browser.
- **Consoles are allowed** — ESLint `no-console: 'off'`. The production build only drops them via Terser (`drop_console: true`).
- **No tests** — no Jest/Vitest. Verification is manual or lint-based.
- **Browserslist** varies per build: `capacitor`, `tauri`, `development` envs.
- **env vars** (CI): `VUE_APP_DEF_HIBIAPI_MAIN`, `VUE_APP_PXIMG_PROXYS`, `VUE_APP_DEF_PXIMG_MAIN`, `VUE_APP_HIBIAPI_ALTS`, `VUE_APP_DEF_APP_API_PROXY`, `VUE_APP_COMMON_PROXY`, `VUE_APP_SILICON_CLOUD_API_KEY` and more.
- **Umami analytics** tracked via `window.umami?.track(...)`. Can be disabled by user setting.
- **Fancybox** for image lightbox — loaded on-demand from static files. Not in npm dependencies.
- **gif.js**, **ts-whammy**, **modern-mp4** for ugoira animation processing.
- **Swiper 5.x** (not 6+) via `vue-awesome-swiper`.
- **vue-demi** is the only pnpm `onlyBuiltDependency`.
- **Android app** builds with `./gradlew assembleDebug` in the `android/` directory.
- **iOS app** builds unsigned via xcodebuild with `CODE_SIGNING_ALLOWED=NO`.
- **Tauri v2** uses `src-tauri/` with `<identifier>` plugin pattern and schema v2 config.
