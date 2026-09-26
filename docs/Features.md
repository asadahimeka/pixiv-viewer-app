# Features

English | [简体中文](./Features.zh-CN.md)

> Back to [README](../README.md)

Yet another Pixiv viewer, providing online browsing of Pixiv illustrations, ugoira, manga, and novels, with multi-platform clients (Android / iOS / Windows / macOS / Linux) and multiple browsing layouts. Supports custom API instances and image proxies, and login via RefreshToken / OAuth / Cookie.

## ✨ Features

### 🏠 Home

| Feature | Description |
| --- | --- |
| Multiple Content Types | Illustrations, manga, novels, collections, and more |
| Rankings | View daily popular works |
| Featured Specials | Browse official curated special content |
| Personalized Recommendations | Recommendations based on personal preferences |
| Discover Page | Explore site-wide popular and newly discovered works |
| Random Browse | Randomly browse high-quality works |
| Bookmarks | Centralized display of favorite works |

### 🔍 Search

| Feature | Description |
| --- | --- |
| Comprehensive Search | Illustrations & manga, novels, users, collections |
| Trending Keywords | Current trending search terms (long press for tag cover) |
| Smart Suggestions | Automatic keyword autocomplete |
| Search Filters | Filter by bookmark count, submission time, etc. |
| Popular Preview | Non-member preview of popular works (first 30) |
| Search by Image | Upload images (SauceNAO) to find similar works |
| Direct ID Navigation | Enter a work/user ID in the search box to jump directly |

### 📊 Rankings

| Feature | Description |
| --- | --- |
| Multi-dimensional Rankings | Overall / illustrations / manga / ugoira / novels |
| R18 / AI Rankings | Adult content and AI-generated works rankings |
| Historical Rankings | View rankings by date |

### 📱 Activity

| Feature | Description |
| --- | --- |
| Following Updates | New works from followed users |
| My Bookmarks | Bookmarked illustrations and novels |
| Followed Users | Followed user list |
| Recommended Users | Recommended user list |
| Latest Works | Latest uploads site-wide |

### 🖼️ Artwork Page

| Feature | Description |
| --- | --- |
| Illustration Actions | Bookmark, unbookmark, download, comment, share |
| Source Link | Quick access to the Pixiv source page |
| ID Copy | One-click copy of artwork / author ID |
| Ugoira Playback | Ugoira playback with frame control |
| Ugoira Export | Download as ZIP / GIF / WebM / APNG / MP4 / AVIF |
| Swipe Navigation | Swipe left / right to switch between works |

### 👤 Author Page

| Feature | Description |
| --- | --- |
| Follow Management | Follow / unfollow authors |
| Works Browsing | Illustrations, manga, bookmarks, novels, collections |
| Series View | Manga and novel series |
| Tag Browsing | Author's commonly used illustration tags |
| Related Users | Discover similar authors |
| Twitter Media | Images / videos posted on X (Twitter) |

### 📖 Novel Reading

| Feature | Description |
| --- | --- |
| Novel Download | TXT / HTML / Markdown / DOC / PDF / EPUB |
| Reading Settings | Customize fonts, colors, reading direction, etc. |
| Rich Text Rendering | Novel rich text formatting |
| Reading Progress Memory | Auto-saves scroll position for continued reading |
| Immersive Reader | Distraction-free reading experience |
| Novel Translation | Integrated online translation |

### 🈶 Manga Translation

| Feature | Description |
| --- | --- |
| One-Click Translation | Built-in translation engine |
| Local Inference | Text detection / OCR / inpainting via ONNX Runtime Web (WebGPU/WASM), all in a Web Worker |
| Typesetting Engine | Horizontal / vertical text layout, bubble & reading order matching |
| Multiple Model Providers | SiliconCloud and other OpenAI-compatible LLM providers, or a self-hosted server-side engine |
| Original / Translated Toggle | One-click comparison of results |

### ⚙️ Settings

#### Login Methods

| Feature | Description |
| --- | --- |
| RefreshToken Login | Log in directly using a Pixiv RefreshToken |
| OAuth Login | Log in via Pixiv OAuth authorization |
| Cookie Login | Cookie-based login (not recommended) |

#### Content Control

| Feature | Description |
| --- | --- |
| R18 Toggle | Control adult content display |
| AI Works Toggle | Control AI-generated works display |
| Local Blacklist | Block tags / users with tag-based management, individually removable |

#### Browsing Experience

| Feature | Description |
| --- | --- |
| Multi-language Support | Simplified / Traditional Chinese, English, Japanese, Korean, Russian, etc. (14 languages) |
| Dark Mode | Eye-friendly night mode |
| Custom Theme Color | Customize the app accent color |
| Image Feed Layouts | Masonry, grid, justified, virtual list, virtual slide, etc. |
| Image Quality Selection | Medium / Large / Large (WebP), etc. |
| Page Transitions | Multiple page transition animations (View Transitions API) |

#### Network & Data

| Feature | Description |
| --- | --- |
| Multiple Image Proxies | Switch between image proxy services |
| Multiple API Instances | Switch between backend API instances |
| AppAPI Proxy Mode | Direct Pixiv App API connection (self-hosted proxy required) |
| pximg Direct Access | Direct access to Pixiv image servers (Web version requires a Tampermonkey helper script) |
| IndexedDB Cache | Local caching for faster loading |
| Browsing History | View works you have visited |
| Clear Cache | One-click cache clearing |

#### Downloads

| Feature | Description |
| --- | --- |
| Long Press Download | Long press list images to download |
| Long Press Block | Long press to quickly block a user |
| Custom Filename Format | Custom download filename templates |
| Animated Export Formats | ZIP / GIF / WebM / APNG / MP4 / AVIF |
| Tampermonkey Support | Web version can download via Tampermonkey + HTTP Helper user script |

#### Backup & Sync

| Feature | Description |
| --- | --- |
| Settings Backup | Backup / restore app settings |
| History Backup | Backup / restore browsing history |
| Cloud Sync | PBKDF2 + AES encryption, conflict detection & smart merge |
| Export RefreshToken | Export the token for use in other applications |

#### 📱 Client Support

| Platform | Distribution |
| --- | --- |
| Web / PWA | Static hosting (e.g. Cloudflare Pages) |
| Android | Universal APK (Capacitor) |
| iOS | Unsigned IPA, requires self-signing (Capacitor) |
| Windows | EXE / MSI installer (Tauri) |
| macOS | DMG / APP, Apple Silicon & Intel (Tauri) |
| Linux | deb / rpm / AppImage / Arch package (Tauri) |
