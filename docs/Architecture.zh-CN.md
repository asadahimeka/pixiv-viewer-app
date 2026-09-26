# 架构与技术细节

简体中文 | [English](./Architecture.md)

> 返回 [README](./README.zh-CN.md)

## 🧱 技术栈

| 层级 | 选型 |
| --- | --- |
| 框架 | Vue 2.7（JavaScript，不使用 TypeScript） |
| 状态管理 | Vuex 3（单一 store，无模块拆分） |
| 路由 | Vue Router 3（history 模式，大量 Pixiv URL 别名） |
| 国际化 | Vue I18n 8（14 种语言） |
| UI | Vant 2.x + Stylus |
| 构建 | Vue CLI 5（webpack）、PostCSS pxtorem |
| 移动端容器 | Capacitor 5（Android / iOS） |
| 桌面端容器 | Tauri 2（Windows / macOS / Linux） |
| 包管理 | pnpm 9（workspace，内含 8 个自研 Capacitor 插件） |

## 🚀 启动流程

1. `src/main.js` 根据 `VUE_APP_PLATFORM`（`android` / `ios` → `src/platform/capacitor/init.js`；`tauri` → `src/platform/tauri/init.js`）动态导入平台初始化模块
2. 初始化模块负责导入全局样式、注册 Vant/Vue 插件与指令、注册全局组件（`WfCont`、`TopBar`、`Pximg`）、配置 SafeArea / StatusBar / 深度链接 / 错误上报
3. 最后挂载 Vue：`new Vue({...}).$mount('#app')` —— **应用只在平台初始化模块中挂载**

`src/platform/index.js` 暴露运行时标志（`isCapacitor`、`isTauri`、`isAndroid`、`isIOS`、`current`），用于守卫平台相关行为。

## 🧭 布局与路由

- **BaseLayout** —— 最外层包装，提供全局外壳
- **MainLayout** —— 内层包装，带 `safeArea` / `showNav` 属性；处理底部导航栏、状态栏与滚动行为。使用两次：带底部导航用于一级页面（首页 / 搜索 / 排行 / 动态 / 设置，meta `__depth: 1`），不带导航用于详情页（作品 / 小说 / 用户，depth ≥ 2）
- 所有路由嵌套于 `/` → BaseLayout → MainLayout；路由别名对齐 Pixiv 网页 URL（`/artworks/:id`、`/novel/:id`、`/users/:id`、`/member.php` 等）
- 页面过渡动画使用 **View Transitions API**（见 `src/router/index.js`）

## 🗃️ 状态与持久化

- 单一 Vuex store：`src/store/index.js`
- 应用设置保存在 `state.appSetting`，持久化到 LocalStorage 的 `PXV_APP_SETTING`
- 派生 getter：`isLoggedIn`、`isR18On`、`blockTagsSet`、`blockUidsSet`、`isCensored`、`wfProps`（瀑布流布局参数）
- 内容设置：`contentSetting`（R18 / AI 过滤）、`blockTags`、`blockUids`、`routeHistory`
- 存储工具在 `src/utils/storage/`：LocalStorage/SessionStorage 封装，以及 `siteCache.js`（localforage / IndexedDB）用于激进缓存 API 响应

## 🌐 API 层

- Axios 实例位于 `src/api/http.js`，带 nprogress 加载条与请求重试逻辑
- Base URL 取自 LocalStorage 的 `PXVEAPI_BASE`（默认 `VUE_APP_DEF_HIBIAPI_MAIN`），运行时可在预设 API 实例间切换
- 响应约定：成功 `{ status: 0, data: ... }`，失败 `{ status: -1, msg }`
- `src/api/client/` 实现直连模式：OAuth 登录（参考 pxder）与通过用户自建代理请求 Pixiv App API（`DEF_API_PROXY`），逻辑参考 PixEz / Pixiv-Shaft
- `src/api/index.js` 导出所有接口函数与 `imgProxy()`

## 🖼️ 图片反代

所有 `i.pximg.net` 的 URL 都由 `imgProxy()`（位于 `src/api/index.js`）重写到配置的反代主机（`PXIMG_PROXY_BASE`，默认 `VUE_APP_DEF_PXIMG_MAIN`，可通过 LocalStorage 的 `PXIMG_PROXY` 覆盖）。通用代理（`VUE_APP_COMMON_PROXY`）覆盖 Web 构建中的非图片请求。

## 🎨 主题与 CSS

- Stylus 预处理器；PostCSS `pxtorem`，`rootValue: 75`（75px = 1rem；含 `van` / `fancybox` / `ispx` 的选择器在黑名单中不做转换）
- 深色模式：`localStorage.PXV_DARK` 控制 `<body>` 上的 `.dark` 类
- 主题色：CSS 变量 `--accent-color` 来自 `localStorage.PXV_ACT_COLOR`；`@material/material-color-utilities` 派生色板（见 `src/utils/theme-md.js`）
- 自定义字体通过 `src/utils/font.js`（ZeoSeven Fonts）

## 🧩 图片信息流布局

多种布局引擎位于 `src/components/`：瀑布流（`MasonryGrid.vue`、`TrueMasonry.js`、`FlexWaterfall.vue`）、网格、两端对齐（`JustifiedLayout.vue`、`VirtualJustified.vue`）、虚拟列表（`VirtualWaterfall.vue`）与虚拟轮播（`VirtualSwiper.vue`）；`ImageLayout.vue` 按用户设置切换。

## 🎞️ 动图（Ugoira）处理

`src/utils/ugoira.js` 通过原始 ZIP（jszip）重组动图帧，并在浏览器内编码：GIF（gif.js）、WebM（ts-whammy）、MP4（modern-mp4）、APNG，另可通过外部转换服务导出 AVIF。

## 🈶 漫画翻译引擎

`src/utils/translate/` 实现了完全客户端侧的翻译流水线：

1. **文本检测 + OCR + 图像修复**：通过 ONNX Runtime Web（WebGPU/WASM），经 Comlink 在 Web Worker 中运行，不阻塞 UI 线程（ShinobuTranslator 模型）
2. **LLM 翻译**：`llmClient.js` —— SiliconCloud 或任意 OpenAI 兼容接口
3. **服务端兜底**（`VUE_APP_SERVER_TRANSLATE_URL`）：本地推理不可用时使用
4. **Canvas 排版**：横排/竖排文字、气泡匹配与阅读顺序感知（`manga.js`）

## 📖 小说工具

`src/utils/novel.js` 解析小说富文本标记用于渲染，并将小说导出为 TXT / HTML / Markdown / DOC / PDF / EPUB。

## ☁️ 云端同步

`src/utils/sync.js` 实现设置/历史备份：PBKDF2 密钥派生 + AES 加密，冲突检测（HTTP 409）与智能合并。

## ⚙️ 构建系统说明

- `BROWSERSLIST_ENV` 按构建类型选择浏览器目标：`capacitor`（App 构建）、`tauri`（桌面端）、`development`
- 生产环境 webpack 配置：`drop_console`、splitChunks 为 onnxruntime-web 单独拆分 `ort` chunk、copy 插件排除 ONNX 模型文件（运行时从 CDN 加载）、移除 preload/prefetch 插件
- `src/icons/svg/` 下的 SVG 图标由自定义 `xml-loader` 规则处理
- Swiper 固定在 5.x（带 pnpm patch）以兼容 `vue-awesome-swiper`
