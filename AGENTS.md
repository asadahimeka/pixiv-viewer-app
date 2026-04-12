# AGENTS.md - Pixiv Viewer Development Guide

## Project Overview
- **Type**: Cross-platform mobile app (Android/iOS via Capacitor, Desktop via Tauri)
- **Stack**: Vue 2.7 + Vuex + Vue Router + Vant UI + Capacitor + Tauri
- **Package Manager**: pnpm (workspace structure in `packages/`)
- **CSS Preprocessor**: Stylus (not SCSS)

---

## Build & Development Commands

### Development
```bash
npm run dev:web           # Web dev server (port 8080)
npm run dev:tauri         # Tauri desktop dev
npm run dev:web:tauri     # Tauri web preview
```

### Build Commands
```bash
npm run build:web         # Production web build
npm run build:and         # Android APK (Capacitor)
npm run build:ios         # iOS IPA (Capacitor)
npm run build:win         # Windows desktop
npm run build:mac         # macOS desktop
npm run build:and:dev     # Android + sync (dev mode)
npm run build:ios:dev     # iOS + sync (dev mode)
npm run build:web:tauri   # Web build for Tauri
```

### Linting & Quality
```bash
npm run lint              # ESLint check + auto-fix
```

---

## Code Style Guidelines

### General
- **Language**: JavaScript (ES6+), NOT TypeScript
- **Quotes**: Single quotes (`'string'`)
- **Semicolons**: NO semicolons
- **Commas**: Trailing commas in multiline (arrays, objects, imports, exports, functions never)
- **Indentation**: 2 spaces (verify in existing files)

### ESLint Configuration (`.eslintrc.js`)
```js
// Extends: eslint:recommended, plugin:vue/recommended, @vue/standard
// Key rules:
'arrow-parens': ['warn', 'as-needed']
'camelcase': 'off'
'quotes': ['warn', 'single']
'semi': ['warn', 'never']
'space-before-function-paren': ['warn', { anonymous: 'always', named: 'never', asyncArrow: 'always' }]
'vue/multi-word-component-names': 'off'
```

### Vue Component Structure
```vue
<template>
  <!-- HTML with kebab-case attributes -->
</template>

<script>
import _ from '@/lib/lodash'           # Use @/ alias for src/
import store from '@/store'
import api from '@/api'

export default {
  name: 'ComponentName',              # PascalCase, matches filename
  components: { /* ... */ },
  props: {
    propA: { type: String, required: true },
    propB: { type: Number, default: 0 },
  },
  data() {
    return {
      localState: 'value',
    }
  },
  computed: {
    computedProp() { return this.localState },
  },
  activated() { /* lifecycle */ },
  mounted() { /* lifecycle */ },
  methods: {
    handler() { /* methods */ },
  },
}
</script>

<style lang="stylus" scoped>
/* Component-scoped styles - Stylus syntax */
</style>

<style lang="stylus">
/* Global styles - if needed */
</style>
```

### Vue Component Tag Order
```vue
<template>...</template>
<script>...</script>
<style>...</style>
```

### Stylus CSS Conventions
- **Indent-based** (no braces, no semicolons)
- **Use spaces for indentation** (match existing files)
- **Nested selectors** for scoping
- **Global styles** use `:root` or class selectors, NOT `<style>` without `scoped`

```stylus
.example-class
  color red
  .nested
    font-size 14px

  &[active]
    color blue
```

### File Naming Conventions
- Vue components: `PascalCase.vue` (e.g., `HomeAll.vue`, `SpotlightCard.vue`)
- JS modules: `camelCase.js` (e.g., `storage.js`, `filter.js`)
- Index files: `index.js`
- Component directories: `PascalCase/` (e.g., `Home/components/`, `Search/components/`)

### Import Conventions
```js
// Alias @/ = src/
import store from '@/store'
import api from '@/api'
import { utils } from '@/utils'
import Component from '@/components/Component.vue'

// Relative when in same directory
import Sibling from './Sibling.vue'

// No default import from utils - use named exports
import { copyText, downloadFile } from '@/utils'
```

### API Response Handling Pattern
```js
async function fetchData() {
  const res = await api.getSomething()
  if (res.illusts || res.data) {
    const list = res.illusts || res.data
    // process list
    return { status: 0, data: list }
  } else if (res.error) {
    return { status: -1, msg: handleErrMsg(res) }
  } else {
    return { status: -1, msg: i18n.t('tip.unknown_err') }
  }
}
```

### Platform Abstraction
Use `@/platform` for platform-specific code:
```js
import platform from '@/platform'
if (platform.isCapacitor) { /* Capacitor only */ }
if (platform.isTauri) { /* Tauri only */ }
if (platform.isAndroid) { /* Android only */ }
if (platform.isIOS) { /* iOS only */ }
```

### Vuex Store Patterns
```js
// state - use TypeScript-style JSDoc for arrays
state: {
  /** @type {number[]} */
  galleryList: [],
  /** @type {object|null} */
  user: null,
}

// getters - use arrow functions
getters: {
  isLoggedIn: state => Boolean(state.user),
}

// mutations - simple setters
mutations: {
  setUser(state, user) { state.user = user },
}

// actions - async with commit
actions: {
  async fetchUser({ commit }) {
    const user = await api.me()
    commit('setUser', user)
  },
}
```

### i18n Usage
```js
import { i18n } from '@/i18n'

// In templates: this.$t('key') or v-t directive
// In JS: i18n.t('key')
// In computed: this.$store.state.appSetting...
```

### Utility Functions Pattern
```js
export function utilityFunction(param) {
  // Return early for edge cases
  if (!param) return null
  
  // Use async/await for promises
  // Use optional chaining: obj?.prop
  // Use nullish coalescing: value ?? default
  
  return result
}
```

---

## Architecture Patterns

### Directory Structure
```
src/
├── api/           # API calls
├── assets/        # Static assets
├── components/    # Shared components
├── consts/        # Constants
├── i18n.js        # i18n setup
├── icons/         # SVG icons
├── layouts/       # Layout wrappers
├── lib/           # Third-party wrappers (lodash)
├── locales/       # i18n JSON files
├── platform/      # Platform abstraction
├── router/        # Vue Router config
├── store/         # Vuex store
├── utils/         # Utility functions
└── views/         # Page components
```

### API Response Status Convention
- `status: 0` = success
- `status: -1` = error, with `msg` field
- Data in `data` field on success

### Cache Strategy
- Use `getCache()`/`setCache()` from `@/utils/storage/siteCache` for persistent cache
- Use `SessionStorage` for session data
- Use `LocalStorage` for user preferences

---

## Common Tasks

### Adding a New View
1. Create `src/views/FeatureName/index.vue`
2. Add route in `src/router/routes.js`
3. Add component import if needed in `src/views/FeatureName/components/`

### Adding Platform-Specific Code
1. Create module in `src/platform/capacitor/` or `src/platform/tauri/`
2. Export functions with same interface
3. Use dynamic import in main code

### Adding i18n Keys
1. Add to `src/locales/zh-CN.json`
2. Add to other locale files as needed
3. Use `i18n.t('key')` in JS or `$t('key')` in templates

### Adding Dependencies
```bash
pnpm add <package>          # Production
pnpm add -D <package>      # Dev
```
Then update `babel.config.js` if UI library (for tree-shaking).

---

## Important Notes

- **NO TypeScript** - This is a pure JavaScript codebase
- **Vue 2.x** - Not Vue 3
- **Stylus** - Not SCSS/CSS
- **No Jest/Vitest** - No test framework configured
- **pnpm workspaces** - Some deps are workspace packages (check `packages/`)
- **Vant UI** - Uses Vant 2.x components (tree-shaken via babel plugin)
- **px to rem** - CSS uses 75px root for mobile sizing
