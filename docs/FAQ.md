# FAQ

English | [简体中文](./FAQ.zh-CN.md)

> Back to [README](../README.md)

## ❓ Frequently Asked Questions

### How to obtain a RefreshToken?

Refer to the tutorial: [https://www.nanoka.top/posts/e78ef86/](https://www.nanoka.top/posts/e78ef86/)

### API quota exceeded or rate limited

- Switch to another API instance in **Settings → API**
- Log in using RefreshToken or OAuth

### Images load very slowly

- Switch to another image proxy in **Settings → Image Proxy**
- Enable pximg direct access mode (requires a good network environment; the Web version also requires a Tampermonkey helper script)
- Download and use the client version

### Some works are not accessible with US/UK IPs

Refer to the official Pixiv announcement: [https://www.pixiv.net/info.php?id=10837](https://www.pixiv.net/info.php?id=10837)

Recommendations:

1. Log in with your own account
2. Set your region to a non-US/UK region in Pixiv web [settings](https://www.pixiv.net/setting_user.php) (Japan recommended)

### Cookie / SessionID login errors

It is recommended to use RefreshToken login, which is more stable and reliable.

### Mismatched or duplicated images in lists and details, or search results do not match the search tags

This is caused by CDN caching of self-hosted APIs. Solutions:

- Switch to another API instance
- Use after logging in

### "Page not found", "No permission to view this work", or "Your access has been restricted"

This usually means the work has been deleted or hidden by the author.

### The Android version crashes when tapping download

- Grant storage permission in system settings
- Update to the latest version and try again

### How to install the iOS version?

Download the IPA from [GitHub Releases](https://github.com/asadahimeka/pixiv-viewer-app/releases).

Note: the iOS build is unsigned and requires manual signing and sideloading:

- [AltStore](https://altstore.io/)
- [i4 Assistant (video tutorial)](https://www.bilibili.com/video/BV1Jg4y1n7hi/)
- [i4 Assistant (text tutorial)](https://www.i4.cn/news_detail_38195.html)
- [Install tutorial](https://kazumi.app/docs/misc/how-to-install-in-ios.html)

### Are the desktop builds signed?

No. Windows / macOS / Linux builds are currently unsigned:

- Windows: SmartScreen may show a warning — choose "More info" → "Run anyway"
- macOS: unsigned builds may be blocked by Gatekeeper — allow it in **System Settings → Privacy & Security**

### How to preset image proxies and API instances for self-hosted deployment?

Set them via environment variables at build time, see `.env.example` and the [Deployment Guide](./Deployment.md), or refer to the discussions:

- [#10](https://github.com/asadahimeka/pixiv-viewer/discussions/10)
- [#13](https://github.com/asadahimeka/pixiv-viewer/discussions/13)

### Where to report bugs or request features?

Please open an issue at [GitHub Issues](https://github.com/asadahimeka/pixiv-viewer/issues).
