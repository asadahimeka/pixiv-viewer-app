# 开发指南

简体中文 | [English](./Development.md)

> 返回 [README](./README.zh-CN.md)

## 📦 环境要求

- **Node.js >= 18**（`package.json` 的 `engines` 字段）
- **pnpm >= 9** — 通过 `preinstall` 钩子强制（`only-allow pnpm`），仓库通过 `packageManager` 固定 `pnpm@9.15.9`
- Rust 工具链（仅 Tauri 桌面端构建 / `dev:tauri` 需要）
- Android SDK（仅本地打包 APK 需要）

## 🚀 快速开始

```bash
# 安装依赖（pnpm workspace：根目录 + packages/*）
pnpm install

# Web 开发模式（http://localhost:8080，支持热重载）
npm run dev:web
```

> 注意：`dev:web` 会设置 `VUE_APP_PLATFORM=android`，即浏览器里以与 Android 客户端相同的平台标志运行。

## 🛠️ NPM 脚本

| 脚本 | 说明 |
| --- | --- |
| `dev:web` | Web 开发服务器（端口 8080，`VUE_APP_PLATFORM=android`） |
| `dev:tauri` | Tauri 桌面端开发（需 Rust） |
| `dev:web:tauri` | 以 `VUE_APP_PLATFORM=tauri` 启动 Web 开发服务器 |
| `build:web` | 生产环境 Web 构建 → `dist/` |
| `build:web:tauri` | 使用 Tauri 的 browserslist / 平台环境进行 Web 构建 |
| `build:and` | Android：Web 构建（`BROWSERSLIST_ENV=capacitor`）+ `npx cap sync android` |
| `build:and:dev` | 同上，但使用 `BROWSERSLIST_ENV=development`（更快，优化更少） |
| `build:ios` | iOS：Web 构建 + `npx cap sync ios`（未签名） |
| `build:ios:dev` | 同上，但使用 `BROWSERSLIST_ENV=development` |
| `build:win` | Windows 桌面端构建（Tauri，x86_64-pc-windows-msvc） |
| `build:mac` | macOS 桌面端构建（Tauri，universal-apple-darwin） |
| `lint` | 对 `src/**/*.{js,vue}` 进行 ESLint 检查并自动修复 |
| `bump` | 同步更新所有平台配置中的版本号（见下文） |
| `check-version` | 校验各配置文件版本一致性（CI 构建前会执行） |

## 🏗️ 平台抽象

整个应用围绕 `VUE_APP_PLATFORM` 环境变量构建：

| 值 | 运行时 | 初始化文件 |
| --- | --- | --- |
| `android` | Capacitor | `src/platform/capacitor/init.js` |
| `ios` | Capacitor | `src/platform/capacitor/init.js` |
| `tauri` | Tauri | `src/platform/tauri/init.js` |

- `src/main.js` 根据 `VUE_APP_PLATFORM` 动态导入对应平台初始化模块。
- **平台初始化模块就是挂载 Vue 的地方**（`new Vue({...}).$mount('#app')`）。若没有任何平台匹配，应用不会挂载。
- `src/platform/index.js` 暴露平台标志：`isCapacitor`、`isTauri`、`isAndroid`、`isIOS`、`current`。
- 平台初始化负责：导入全局样式、注册 Vant/Vue 插件与指令、注册全局组件（`WfCont`、`TopBar`、`Pximg`）、配置 SafeArea / StatusBar / 深度链接 / 错误上报，最后挂载 Vue。

新增平台相关代码时，在 `src/platform/capacitor/` 或 `src/platform/tauri/` 下创建模块，保持导出函数签名一致，在业务代码中动态导入，并用 `platform.isCapacitor` / `platform.isTauri` 守卫调用点。

## 📁 项目结构

```
src/
├── api/           # API 调用 + HTTP 客户端（axios）
│   ├── index.js   # 主 API 模块 —— 所有接口函数
│   ├── http.js    # Axios 实例 + 拦截器
│   ├── client/    # 直连本地 API（OAuth + Pixiv App API）
│   └── user.js
├── assets/        # 全局样式（Stylus）
├── components/    # 共享组件（图片布局、卡片等）
├── consts/        # 环境变量、API 地址、常量
├── icons/         # SVG 图标加载器与组件
├── i18n.js        # vue-i18n 配置
├── layouts/       # BaseLayout.vue、MainLayout.vue
├── lib/           # 第三方封装：lodash、vant、vant-apis、polyfill
├── locales/       # 14 个语言 JSON 文件（默认 zh-CN）
├── platform/      # Capacitor + Tauri 平台模块
├── router/        # Vue Router 配置（history 模式）
├── store/         # Vuex store（单一 store）
├── utils/         # storage、filter、font、novel、translate、ugoira、sync...
└── views/         # 页面组件（Home、Search、Rank、Artwork、Users...）
```

本仓库是 **pnpm workspace**，`packages/` 下维护着 8 个自研 Capacitor 插件：

`capacitor-filesystem`、`capacitor-mediastore`、`capacitor-navigation-bar`、`capacitor-plugin-file-opener`、`capacitor-plugin-filedownload`、`capacitor-plugin-pixiv-cronet`、`capacitor-plugin-pixiv-login`、`capacitor-plugin-saf`

## 🔢 版本管理

版本号需要在以下文件间保持同步：`package.json`、`capacitor.config.json`（User-Agent 字符串）、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 与 `Cargo.lock`、`android/app/build.gradle`（`versionName`/`versionCode`）以及 iOS `project.pbxproj`（`MARKETING_VERSION`）。

```bash
# 版本升级：node scripts/bump.mjs <patch|minor|major|x.y.z>
pnpm bump patch

# 校验一致性（CI 构建前执行）
pnpm check-version
```

## 🎨 代码风格

- **ESLint 是唯一的格式化工具** —— 项目不使用 Prettier，`vue.config.js` 中 `lintOnSave: false`。建议只对自己改动的文件执行 lint：`npx eslint src/path/to/file.vue --fix`
- 单引号、**无分号**、2 空格缩进
- 多行数组/对象/导入/导出的末尾带逗号，函数参数**永不**带逗号
- `@/utils` 只使用命名导出，工具模块不用默认导出
- Vue SFC 标签顺序（ESLint 强制）：`<template>` → `<script>` → `<style lang="stylus" scoped>`
- 文件命名：组件 `PascalCase.vue`，JS 模块 `camelCase.js`，组件目录 `PascalCase/`
- 导入别名：`@/` = `src/`；同级组件用相对路径导入
- **不使用 TypeScript**；没有测试框架 —— 验证方式为手动测试与 lint
- 允许 `console`（`no-console: off`）；生产构建通过 Terser 移除 console

### Vant UI（v2）—— 重要约定

- **不要** `import { X } from 'vant'` —— 这会触发 `babel-plugin-import`，引入 `vant/es/*` ESM 构建，与已全局注册的 `vant/lib/*` CJS 构建重复。所有 Vant 代码必须统一使用一种构建（`vant/lib/*`）。
- 模板组件已在 `src/lib/vant.js` 中通过 `Vue.use()` 全局注册（Button/Toast/Search/Tabs/List/Popup/Dialog/Icon/Loading/Progress 等）—— 模板里直接写 `<van-xxx>` 即可，无需导入。
- 命令式 API（`Dialog.confirm`、`Toast.success`、`ImagePreview`、`Notify`、`Locale`）必须从统一入口导入：

  ```js
  import { Dialog, Toast, ImagePreview, Notify, Locale } from '@/lib/vant-apis'
  ```

- 新组件：如果不在 `src/lib/vant.js` 全局注册列表里，要么在那里注册，要么直接 `vant/lib/xxx` 导入，并把对应样式加到 `src/lib/vant-style.js`。

## 🌍 国际化（i18n）

- 语言文件位于 `src/locales/`（14 种语言；`zh-CN` 为默认语言与翻译源）
- 使用语义化的 key（如 `$t('appSetting.download')`），不要用 hash
- 新增 key 先加到 `zh-CN.json`，再按需补充其他语言文件
- 非中文翻译大多来自机器翻译，欢迎纠错与贡献
- 模板中用 `$t('key')`，JS 中用 `i18n.t('key')`

## 🤝 贡献流程

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交更改
4. 推送到分支
5. 开启 Pull Request

Bug 反馈与功能建议请使用 [GitHub Issues](https://github.com/asadahimeka/pixiv-viewer/issues)。

## 🔗 延伸阅读

- [架构与技术细节](./Architecture.zh-CN.md)
- [部署说明](./Deployment.zh-CN.md)
