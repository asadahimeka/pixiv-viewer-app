# Architecture & Technical Details

English | [简体中文](./Architecture.zh-CN.md)

> Back to [README](../README.md)

## 🧱 Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Vue 2.7 (JavaScript, no TypeScript) |
| State | Vuex 3 (single store, no modules) |
| Router | Vue Router 3 (history mode, extensive Pixiv URL aliases) |
| i18n | Vue I18n 8 (14 locales) |
| UI | Vant 2.x + Stylus |
| Build | Vue CLI 5 (webpack), PostCSS pxtorem |
| Mobile container | Capacitor 5 (Android / iOS) |
| Desktop container | Tauri 2 (Windows / macOS / Linux) |
| Package manager | pnpm 9 (workspace with 8 in-tree Capacitor plugins) |

## 🚀 Boot Flow

1. `src/main.js` dynamically imports the platform init module based on `VUE_APP_PLATFORM` (`android` / `ios` → `src/platform/capacitor/init.js`; `tauri` → `src/platform/tauri/init.js`)
2. The init module imports global styles, registers Vant/Vue plugins and directives, registers global components (`WfCont`, `TopBar`, `Pximg`), sets up SafeArea / StatusBar / deep links / error tracking
3. Finally it mounts Vue: `new Vue({...}).$mount('#app')` — **the app only mounts inside a platform init**

`src/platform/index.js` exposes runtime flags (`isCapacitor`, `isTauri`, `isAndroid`, `isIOS`, `current`) used to guard platform-specific behavior.

## 🧭 Layouts & Routing

- **BaseLayout** — outermost wrapper providing global chrome
- **MainLayout** — inner wrapper with `safeArea` / `showNav` props; handles nav bar, status bar and scroll behavior. Used twice: with bottom nav for primary pages (Home / Search / Rank / Following / Setting, meta `__depth: 1`), and without nav for detail pages (Artwork / Novel / Users, depth ≥ 2)
- All routes nest under `/` → BaseLayout → MainLayout; route aliases mirror Pixiv web URLs (`/artworks/:id`, `/novel/:id`, `/users/:id`, `/member.php`, ...)
- Page transitions use the **View Transitions API** (see `src/router/index.js`)

## 🗃️ State & Persistence

- Single Vuex store in `src/store/index.js`
- App settings live in `state.appSetting`, persisted to LocalStorage under `PXV_APP_SETTING`
- Derived getters: `isLoggedIn`, `isR18On`, `blockTagsSet`, `blockUidsSet`, `isCensored`, `wfProps` (waterfall layout props)
- Content settings: `contentSetting` (R18 / AI filters), `blockTags`, `blockUids`, `routeHistory`
- Storage helpers in `src/utils/storage/`: LocalStorage/SessionStorage wrappers plus `siteCache.js` (localforage / IndexedDB) for aggressive API response caching

## 🌐 API Layer

- Axios instance in `src/api/http.js` with nprogress loading bar and retry logic
- Base URL from `PXVEAPI_BASE` in LocalStorage (default: `VUE_APP_DEF_HIBIAPI_MAIN`), switchable between preset API instances at runtime
- Response convention: `{ status: 0, data: ... }` on success, `{ status: -1, msg }` on error
- `src/api/client/` implements the direct-connect mode: OAuth login (pxder-style) and Pixiv App API requests via a user-configured proxy (`DEF_API_PROXY`), referenced from PixEz / Pixiv-Shaft
- `src/api/index.js` exports all endpoint functions and `imgProxy()`

## 🖼️ Image Proxying

All `i.pximg.net` URLs are rewritten by `imgProxy()` (in `src/api/index.js`) to the configured proxy host (`PXIMG_PROXY_BASE`, default `VUE_APP_DEF_PXIMG_MAIN`, overridable via the `PXIMG_PROXY` LocalStorage key). A generic proxy (`VUE_APP_COMMON_PROXY`) covers non-image requests in the web build.

## 🎨 Theming & CSS

- Stylus preprocessor; PostCSS `pxtorem` with `rootValue: 75` (75px = 1rem; selectors containing `van` / `fancybox` / `ispx` are blacklisted)
- Dark mode: `localStorage.PXV_DARK` toggles a `.dark` class on `<body>`
- Accent color: CSS variable `--accent-color` from `localStorage.PXV_ACT_COLOR`; `@material/material-color-utilities` derives tonal palettes (see `src/utils/theme-md.js`)
- Custom fonts via `src/utils/font.js` (ZeoSeven Fonts)

## 🧩 Image Feed Layouts

Multiple layout engines live in `src/components/`: masonry (`MasonryGrid.vue`, `TrueMasonry.js`, `FlexWaterfall.vue`), grid, justified (`JustifiedLayout.vue`, `VirtualJustified.vue`), virtual list (`VirtualWaterfall.vue`) and virtual slide (`VirtualSwiper.vue`); `ImageLayout.vue` switches between them per user setting.

## 🎞️ Ugoira Pipeline

`src/utils/ugoira.js` reassembles ugoira frames from the original ZIP (jszip) and encodes animations in-browser: GIF (gif.js), WebM (ts-whammy), MP4 (modern-mp4), APNG, plus AVIF via an external converter service.

## 🈶 Manga Translation Engine

`src/utils/translate/` implements a fully client-side translation pipeline:

1. **Text detection + OCR + inpainting** via ONNX Runtime Web (WebGPU/WASM), running inside a Web Worker through Comlink so the UI thread is never blocked (ShinobuTranslator models)
2. **LLM translation** via `llmClient.js` — SiliconCloud or any OpenAI-compatible endpoint
3. **Server-side fallback** (`VUE_APP_SERVER_TRANSLATE_URL`) when local inference is unavailable
4. **Canvas typesetting** with horizontal/vertical text, bubble matching and reading-order awareness (`manga.js`)

## 📖 Novel Utilities

`src/utils/novel.js` parses novel rich-text markup for rendering and exports novels as TXT / HTML / Markdown / DOC / PDF / EPUB.

## ☁️ Cloud Sync

`src/utils/sync.js` implements settings/history backup with PBKDF2 key derivation + AES encryption, conflict detection (HTTP 409) and smart merge.

## ⚙️ Build System Notes

- `BROWSERSLIST_ENV` selects the browser targets per build: `capacitor` (app builds), `tauri` (desktop), `development`
- Production webpack config: `drop_console`, splitChunks with a dedicated `ort` chunk for onnxruntime-web, ONNX models excluded from the copy plugin (loaded from CDN), preload/prefetch plugins removed
- SVG icons under `src/icons/svg/` are handled by a custom `xml-loader` rule
- Swiper is pinned to 5.x (with a pnpm patch) for `vue-awesome-swiper` compatibility
