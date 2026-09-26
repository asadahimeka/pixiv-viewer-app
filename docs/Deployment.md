# Deployment Guide

English | [简体中文](./Deployment.zh-CN.md)

> Back to [README](../README.md)

This project can be deployed in two ways:

1. **Web deployment** — build the static site and host it yourself (this is how [pixiv.pictures](https://pixiv.pictures) works)
2. **Native app packaging** — build APK / IPA / desktop packages locally or via GitHub Actions

## 0. Prerequisites: API & Image Proxy

The app needs a Pixiv-compatible API backend and an image proxy to load artworks from `i.pximg.net`:

| Dependency | Description |
| --- | --- |
| [PxveAPI](https://github.com/asadahimeka/pxve-api) | Pixiv API service (HibiAPI-compatible, recommended) |
| [HibiAPI](https://github.com/mixmoe/HibiAPI) | Alternative Pixiv API service |
| pximg image proxy | Reverse proxy for `i.pximg.net`, see [pixiv.cat/reverseproxy.html](https://pixiv.cat/reverseproxy.html) |

## 1. Configure Environment Variables

Copy `.env.example` to `.env` in the project root and fill in your own values:

```bash
cp .env.example .env
# Edit .env — ⚠ do NOT commit .env to the repository
```

All `VUE_APP_*` variables are injected at **build time** — rebuild after changing them.

### Core Variables

| Variable | Description |
| --- | --- |
| `VUE_APP_DEF_HIBIAPI_MAIN` | Default API instance (PxveAPI / HibiAPI), e.g. `https://api.pxve.cc` |
| `VUE_APP_DEF_PXIMG_MAIN` | Default pximg image proxy, e.g. `i.pixiv.re` (an PxveAPI instance like `api.pxve.cc/pximg` also works) |
| `VUE_APP_PXIMG_PROXYS` | Preset image proxy options, format: `Name1,host1;Name2,host2` (optional) |
| `VUE_APP_DEF_APP_API_PROXY` | Default AppAPI proxy for direct Pixiv App API access, e.g. `proxy.example.com` (optional) |
| `VUE_APP_APP_API_PROXYS` | Preset AppAPI proxy options, comma-separated (optional) |
| `VUE_APP_COMMON_PROXY` | Generic proxy, format: `https://proxy.example.com/https://url.to.be.proxied.com` |
| `VUE_APP_COMMON_IMAGE_PROXY` | Generic image proxy, defaults to `VUE_APP_COMMON_PROXY` if unset |

> The AppAPI proxy URL mapping: `https://oauth.secure.pixiv.net/auth/token` → `https://proxy.example.com/pixiv-oauth/auth/token`, `https://app-api.pixiv.net/v1/illust/ranking` → `https://proxy.example.com/pixiv-app-api/v1/illust/ranking`

### Analytics (optional)

| Variable | Description |
| --- | --- |
| `VUE_APP_GA_ID` | Google Analytics ID |
| `VUE_APP_CLARITY_ID_MAIN` | Microsoft Clarity ID |
| `VUE_APP_UMAMI_ID` / `VUE_APP_UMAMI_SRC` | Umami analytics ID / script URL |

### Manga Translation Models (optional)

The model manifest is at `public/models/models.json` (tracked in git); ONNX binaries are fetched at deploy time into `public/models/` (gitignored) and are **excluded from production builds** — they are loaded from CDN at runtime.

| Variable | Description |
| --- | --- |
| `VUE_APP_MODEL_RELEASE_TAG` | Rewrite manifest URLs to ShinobuTranslator GitHub Release assets, e.g. `models-v0.7.0` |
| `VUE_APP_MODEL_URL_TEMPLATE` | Custom model CDN URL template with `{filename}` placeholder (takes priority over the tag above) |
| `VUE_APP_ORT_WASM_PATH` | ONNX Runtime WASM path (default: jsdelivr CDN) |

For development, place model files into `public/models/` manually.

### Server-side Manga Translation (optional)

| Variable | Description |
| --- | --- |
| `VUE_APP_SERVER_TRANSLATE_URL` | Server translation engine URL (fallback to local ONNX inference) |
| `VUE_APP_SERVER_TRANSLATE_TOKEN` | Bearer token for the server translation engine |

## 2. Web Deployment

```bash
pnpm install
npm run build:web
```

The build output is in `dist/`. Deploy it to any static hosting (Cloudflare Pages, Netlify, nginx, etc.).

> The app uses **history-mode routing** — configure your server to rewrite all routes to `index.html` (SPA fallback), otherwise deep links and page refreshes will 404.

## 3. Native App Packaging

### Android (Capacitor)

```bash
npm run build:and          # web build + npx cap sync android
cd android
./gradlew assembleDebug    # or assembleRelease for a release APK
```

### iOS (Capacitor, unsigned)

```bash
npm run build:ios          # web build + npx cap sync ios
# open ios/App/App.xcodeproj with Xcode, or:
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release CODE_SIGNING_ALLOWED=NO
```

### Desktop (Tauri, requires Rust toolchain)

```bash
npm run build:win          # Windows x64 (NSIS setup + MSI)
npm run build:mac          # macOS universal (dmg + app.tar.gz)
# other Linux targets:
npx tauri build --target x86_64-unknown-linux-gnu   # deb / rpm / AppImage
```

> Tauri bundles are configured in `src-tauri/tauri.conf.json` (`targets: "all"`).

## 4. CI Builds (GitHub Actions)

All workflows are **manual dispatch only** and live in `.github/workflows/`:

| Workflow | Output |
| --- | --- |
| `build-tauri.yml` | Windows EXE/MSI, macOS DMG/APP, Linux deb/rpm/AppImage |
| `build-tauri-arch-pkg.yml` | Arch Linux package |
| `build-tauri-fedora.yml` | Fedora RPM |
| `build-capacitor-android.yml` | Android APK |
| `build-capacitor-ios.yml` | Unsigned iOS IPA |

The workflows read the same `VUE_APP_*` variables from repository **secrets** (e.g. `VUE_APP_DEF_HIBIAPI_MAIN`, `VUE_APP_DEF_PXIMG_MAIN`, `VUE_APP_PXIMG_PROXYS`, `VUE_APP_COMMON_PROXY`, `VUE_APP_SERVER_TRANSLATE_URL`, ...). To build your own branded versions, fork the repo and fill in the secrets of the same names. CI also runs `node scripts/check-version.mjs` before building to verify version consistency.

## 5. References

- Self-hosting discussions: [#10](https://github.com/asadahimeka/pixiv-viewer/discussions/10), [#13](https://github.com/asadahimeka/pixiv-viewer/discussions/13)
- [PxveAPI](https://github.com/asadahimeka/pxve-api) / [HibiAPI](https://github.com/mixmoe/HibiAPI) / [pximg reverse proxy guide](https://pixiv.cat/reverseproxy.html)
