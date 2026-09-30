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
- **env vars** (CI): `VUE_APP_DEF_HIBIAPI_MAIN`, `VUE_APP_PXIMG_PROXYS`, `VUE_APP_DEF_PXIMG_MAIN`, `VUE_APP_HIBIAPI_ALTS`, `VUE_APP_DEF_APP_API_PROXY`, `VUE_APP_COMMON_PROXY` and more.
- **Umami analytics** tracked via `window.umami?.track(...)`. Can be disabled by user setting.
- **Fancybox** for image lightbox — loaded on-demand from static files. Not in npm dependencies.
- **gif.js**, **ts-whammy**, **modern-mp4** for ugoira animation processing.
- **Swiper 5.x** (not 6+) via `vue-awesome-swiper`.
- **vue-demi** is the only pnpm `onlyBuiltDependency`.
- **Android app** builds with `./gradlew assembleDebug` in the `android/` directory.
- **iOS app** builds unsigned via xcodebuild with `CODE_SIGNING_ALLOWED=NO`.
- **Tauri v2** uses `src-tauri/` with `<identifier>` plugin pattern and schema v2 config.

## Playwright QA Test Notes

> **总原则**：**默认不进行 Playwright 浏览器模拟测试**。浏览器 UI 的最终验收由用户**手动**进行——agent 跑浏览器模拟既耗时（每场景 ~3 分钟 + dev server 90s+ 启动）又低效（用户反正会自己实测）。agent 允许的验证方式：
> - **脚本级测试**（优先）：bash/curl、node 脚本、node:test 单元测试——验证逻辑正确性足够
> - **不跑浏览器模拟**，除非用户**显式**要求"帮我用浏览器测一下 X"（如跨域/CORS、真实点击流等必须真实浏览器行为的场景）
> - 需要验证用户可见效果时，产出**清晰的改动说明 + 预期行为清单**，由用户手动确认，而非 agent 截图代劳
> - 以下环境事实与技巧保留备用（万一用户显式要求浏览器测试时仍需要）

> Historical lesson: real manual QA sessions have exceeded the 30-min sync `task()` poll limit. Lessons learned below.

### Environment facts (no login needed for most features)
- **No login required** to browse/test most features. Login state can be simulated via localStorage (`PXV_*` prefix).
- **Bypassing login**: `Nav.vue` computes `isLogin: localApi.APP_CONFIG.useLocalAppApi || existsSessionId()`（src/components/Nav.vue）. `existsSessionId()` = presence of `localStorage.PXV_NOW_COOKIE`（src/api/user.js:73，**任意真值即可，本项目无 token 格式校验**；该值同时作为 PixivNow web-session API 的 `x-auth` 请求头）。
- **AI 翻译 Key**：真实翻译测试需先有可用 Key——设置页注入或 `localStorage.PXV_TRANSLATE_CONFIG`（store 持久化）；本地 dev 不假设有内置 Key。
- **dev server reuse**: before QA, `curl localhost:8080` — if listening, reuse it（`npm run dev:web` 编译 45-90s+，重启浪费 ~10 分钟）。需新起时：`nohup npm run dev:web > /tmp/opencode/dev-web.log 2>&1 &` 并记下 pid。
- **hibiapi.cocomi.eu.org rejects automation**: it returns "Not Accepted" (surfacing as HTTP 400) for requests with `HeadlessChrome` in the User-Agent or without a proper referer. In QA scripts, headless mode is fine but you MUST set a normal UA (no `HeadlessChrome` substring) and a `localhost` referer:
  ```js
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: { Referer: 'http://localhost:8080/' },
  })
  ```
  Browser (real user) requests are unaffected — the app cannot and does not set UA/Referer for hibiapi (forbidden headers).
- **大面积 4xx 先怀疑自动化指纹，再归因"环境限制/API 故障"**（2026-09 实测教训：曾把此 400 误定性为环境限制并写进交付结论，后被翻案）。30 秒定性手段：`curl` 直接打同一 API 看 response body（"Not Accepted" 字样 = 客户端被拒，非服务端故障）。

### Execution rules
- **QA/UI automation tasks MUST run in background** (`run_in_background=true` / background task dispatch) — sync `task()` has a hard 30-min poll limit; serial UI scenarios will hit it.
- Bash checks (files/grep/license) take seconds; **each UI scenario takes ~3 min** — keep scenario count low, split as needed.
- Page loads: use `waitUntil: 'domcontentloaded'`, NOT `'networkidle'` (lazy-loaded image pages never reach networkidle); after `goto`, `waitForTimeout(8000-10000)` for Vue mount + API round-trip.

### QA script techniques
- **Read Vue computed values via `__vue__`** (walk `$parent` to the component by `$options.name`) instead of expanding DOM — rendering 1000s of region nodes OOMs the page.
- **van-dialog DOM lingers during close transition** — assert absence via `display:none`, not `querySelector === null`, else false positives.
- Reuse browser context across runs (models cached); single attempt is enough.
- **断言信号选数据不选文案**：`page.on('response')` 按 URL 正则记录分页请求与状态（如 `rank:1=200, rank:2=200…`）+ 列表卡片计数（`.image-card`）作为增长信号；"没有更多"类文案只做**负向断言**（错误态 ≠ 没有更多）。文案会随 locale 变，数据不会。
- **console 噪音过滤**：滤掉应用固有的 `Refused to set unsafe header` 与 4xx resource 报错（`/unsafe header|Failed to load resource/`），剩下的才是回归信号（基线应为 0 JS 异常）。
- **内置浏览器面板超时（45s 无响应）就直接降级 Playwright 脚本**，别耗在面板上——无头脚本本来就是浏览器测试的默认形态。

### 本机工具链事实（2026-09 实测，Linux/WSL）
- **`NODE_PATH` 对 ESM 无效**：`import { chromium } from 'playwright'` 在脚本目录解析不到 nvm 全局安装（ESM import 不走 NODE_PATH，仅 CJS `require` 认）。修法：脚本写 `.cjs`（`require` + async IIFE），用 `NODE_PATH=$(npm root -g) node x.cjs` 运行。
- **管道退出码陷阱**：`node x.cjs | tail` 的退出码来自 `tail`（恒 0），`|| 回退命令` 会被静默吞掉。带兜底回退的命令不要接管道（或先 `set -o pipefail`）。
- **Playwright 可用性分三层验证**：`npx playwright --version` 出版本号 ≠ 模块可 import ≠ 浏览器已装。三层分别看：CLI（npx）/ 模块解析（`npm root -g` + CJS 方式）/ 浏览器二进制（`ls ~/.cache/ms-playwright/`）。本机：playwright 1.62.1 装于 nvm 全局（`/home/yumine/.nvm/versions/node/v22.23.1/lib/node_modules`），chromium 缓存齐全。
- **别用 sed/文本变换拼接或转换脚本代码**——产出损坏文件极难排查，直接用 write 工具写目标文件。
