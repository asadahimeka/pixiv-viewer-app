# 部署说明

简体中文 | [English](./Deployment.md)

> 返回 [README](./README.zh-CN.md)

本项目有两种部署方式：

1. **Web 部署** —— 构建静态站点并自行托管（[pixiv.pictures](https://pixiv.pictures) 即此方式）
2. **客户端打包** —— 本地或通过 GitHub Actions 构建 APK / IPA / 桌面端安装包

## 0. 前置条件：API 与图片反代

应用需要 Pixiv 兼容的 API 后端与图片反代来加载 `i.pximg.net` 上的作品图片：

| 依赖 | 说明 |
| --- | --- |
| [PxveAPI](https://github.com/asadahimeka/pxve-api) | Pixiv API 服务（接口与 HibiAPI 兼容，推荐） |
| [HibiAPI](https://github.com/mixmoe/HibiAPI) | 另一个 Pixiv API 服务 |
| pximg 图片反代 | `i.pximg.net` 的反向代理，参考 [pixiv.cat/reverseproxy.html](https://pixiv.cat/reverseproxy.html) |

## 1. 配置环境变量

将 `.env.example` 复制为项目根目录下的 `.env` 并填入自己的配置：

```bash
cp .env.example .env
# 编辑 .env —— ⚠ 注意不要将 .env 文件提交到 Git 仓库
```

所有 `VUE_APP_*` 变量在**构建时**注入 —— 修改变量后需要重新构建。

### 核心变量

| 变量 | 说明 |
| --- | --- |
| `VUE_APP_DEF_HIBIAPI_MAIN` | 默认 API 实例（PxveAPI / HibiAPI），如 `https://api.pxve.cc` |
| `VUE_APP_DEF_PXIMG_MAIN` | 默认 pximg 图片反代，如 `i.pixiv.re`（也可填 PxveAPI 实例，如 `api.pxve.cc/pximg`） |
| `VUE_APP_PXIMG_PROXYS` | 预设图床选项，格式：`名称1,host1;名称2,host2`（可不填） |
| `VUE_APP_DEF_APP_API_PROXY` | 默认 AppAPI 代理（直连 Pixiv App API），如 `proxy.example.com`（可不填） |
| `VUE_APP_APP_API_PROXYS` | 预设 AppAPI 代理选项，逗号分隔（可不填） |
| `VUE_APP_COMMON_PROXY` | 通用代理，格式：`https://proxy.example.com/https://url.to.be.proxied.com` |
| `VUE_APP_COMMON_IMAGE_PROXY` | 通用图片代理，不填则默认取 `VUE_APP_COMMON_PROXY` |

> AppAPI 代理的 URL 映射规则：`https://oauth.secure.pixiv.net/auth/token` → `https://proxy.example.com/pixiv-oauth/auth/token`，`https://app-api.pixiv.net/v1/illust/ranking` → `https://proxy.example.com/pixiv-app-api/v1/illust/ranking`

### 统计分析（可选）

| 变量 | 说明 |
| --- | --- |
| `VUE_APP_GA_ID` | 谷歌统计分析 ID |
| `VUE_APP_CLARITY_ID_MAIN` | 微软 Clarity 统计分析 ID |
| `VUE_APP_UMAMI_ID` / `VUE_APP_UMAMI_SRC` | Umami 统计 ID / 脚本地址 |

### 漫画翻译模型（可选）

模型清单位于 `public/models/models.json`（已纳入 git）；ONNX 模型文件在部署时下载到 `public/models/`（已 gitignore），**生产构建会自动排除**这些文件 —— 运行时从 CDN 加载。

| 变量 | 说明 |
| --- | --- |
| `VUE_APP_MODEL_RELEASE_TAG` | 将清单 URL 重写为 ShinobuTranslator 的 GitHub Release 资源，如 `models-v0.7.0` |
| `VUE_APP_MODEL_URL_TEMPLATE` | 自定义模型 CDN URL 模板（`{filename}` 占位符），优先级高于上一项 |
| `VUE_APP_ORT_WASM_PATH` | ONNX Runtime WASM 路径（默认 jsdelivr CDN） |

开发模式下需手动将模型文件放入 `public/models/`。

### 服务端漫画翻译（可选）

| 变量 | 说明 |
| --- | --- |
| `VUE_APP_SERVER_TRANSLATE_URL` | 服务端翻译引擎地址（作为本地 ONNX 推理的备选） |
| `VUE_APP_SERVER_TRANSLATE_TOKEN` | 服务端翻译鉴权 Bearer Token |

## 2. Web 部署

```bash
pnpm install
npm run build:web
```

构建产物在 `dist/` 目录，可部署到任意静态托管（Cloudflare Pages、Netlify、nginx 等）。

> 应用使用 **history 模式路由** —— 需要配置服务器将所有路由回退到 `index.html`（SPA fallback），否则深链接与刷新页面会 404。

## 3. 客户端打包

### Android（Capacitor）

```bash
npm run build:and          # Web 构建 + npx cap sync android
cd android
./gradlew assembleDebug    # 正式包用 assembleRelease
```

### iOS（Capacitor，未签名）

```bash
npm run build:ios          # Web 构建 + npx cap sync ios
# 用 Xcode 打开 ios/App/App.xcodeproj，或：
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release CODE_SIGNING_ALLOWED=NO
```

### 桌面端（Tauri，需 Rust 工具链）

```bash
npm run build:win          # Windows x64（NSIS 安装包 + MSI）
npm run build:mac          # macOS universal（dmg + app.tar.gz）
# 其他 Linux 目标：
npx tauri build --target x86_64-unknown-linux-gnu   # deb / rpm / AppImage
```

> Tauri 打包配置位于 `src-tauri/tauri.conf.json`（`targets: "all"`）。

## 4. CI 构建（GitHub Actions）

所有工作流均为**手动触发**（workflow_dispatch），位于 `.github/workflows/`：

| 工作流 | 产物 |
| --- | --- |
| `build-tauri.yml` | Windows EXE/MSI、macOS DMG/APP、Linux deb/rpm/AppImage |
| `build-tauri-arch-pkg.yml` | Arch Linux 包 |
| `build-tauri-fedora.yml` | Fedora RPM |
| `build-capacitor-android.yml` | Android APK |
| `build-capacitor-ios.yml` | 未签名 iOS IPA |

工作流从仓库 **Secrets** 读取同名 `VUE_APP_*` 变量（如 `VUE_APP_DEF_HIBIAPI_MAIN`、`VUE_APP_DEF_PXIMG_MAIN`、`VUE_APP_PXIMG_PROXYS`、`VUE_APP_COMMON_PROXY`、`VUE_APP_SERVER_TRANSLATE_URL` 等）。若要构建自己的版本，Fork 仓库后填入同名 Secrets 即可。CI 构建前会执行 `node scripts/check-version.mjs` 校验版本一致性。

## 5. 参考

- 自建部署讨论：[#10](https://github.com/asadahimeka/pixiv-viewer/discussions/10)、[#13](https://github.com/asadahimeka/pixiv-viewer/discussions/13)
- [PxveAPI](https://github.com/asadahimeka/pxve-api) / [HibiAPI](https://github.com/mixmoe/HibiAPI) / [pximg 反代搭建指南](https://pixiv.cat/reverseproxy.html)
