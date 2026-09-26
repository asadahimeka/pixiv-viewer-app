# 常见问题

简体中文 | [English](./FAQ.md)

> 返回 [README](./README.zh-CN.md)

## ❓ 常见问题

### 如何获取 RefreshToken？

参考教程：[https://www.nanoka.top/posts/e78ef86/](https://www.nanoka.top/posts/e78ef86/)

### 提示 API 超限或 Rate Limit

- 在「设置 → API」中切换其他 API 实例
- 使用 RefreshToken 或 OAuth 方式登录

### 图片加载很慢

- 在「设置 → 图床」中切换其他图片反代
- 启用 pximg 图片直连模式（需要良好的网络环境；Web 版还需配合 Tampermonkey 辅助脚本）
- 下载客户端版本使用

### 使用美国/英国 IP 无法查看某些作品

参考 Pixiv 官方公告：[https://www.pixiv.net/info.php?id=10837](https://www.pixiv.net/info.php?id=10837)

建议：

1. 使用自己的账号登录
2. 在 Pixiv 官方网页端里[设置](https://www.pixiv.net/setting_user.php)地区为非美国/英国地区（建议选择日区）

### Cookie/SessionID 登录出错

建议使用 RefreshToken 方式登录，更加稳定可靠。

### 列表与详情图片不匹配或重复、搜索结果与搜索标签不匹配

这是自建 API 的 CDN 缓存导致的，解决方案：

- 切换其他 API 实例
- 登录后使用

### 提示“尚无此页”或“尚无权限浏览该作品”或“您的访问权限被限制了”

通常表示该作品已被作者删除或隐藏。

### Android 版本点击下载就闪退

- 在系统设置中授予应用存储权限
- 下载最新版本后再尝试

### 如何安装 iOS 版本？

可到 [GitHub Releases](https://github.com/asadahimeka/pixiv-viewer-app/releases) 下载 IPA。

注意 iOS 版本未签名，需要自行签名侧载安装：

- [爱思助手（视频教程）](https://www.bilibili.com/video/BV1Jg4y1n7hi/)
- [爱思助手（图文教程）](https://www.i4.cn/news_detail_38195.html)
- [安装教程](https://kazumi.app/docs/misc/how-to-install-in-ios.html)
- [AltStore](https://altstore.io/)

### 桌面端（Windows/macOS/Linux）版本有签名吗？

没有。桌面端构建目前均未签名：

- Windows：SmartScreen 可能会弹出警告，选择「更多信息」→「仍要运行」
- macOS：未签名应用可能被 Gatekeeper 拦截，需在「系统设置 → 隐私与安全性」中允许运行

### 自建部署如何预设图床与 API 实例？

在构建时通过环境变量设置，见 `.env.example` 与[部署说明](./Deployment.zh-CN.md)，也可参考讨论：

- [#10](https://github.com/asadahimeka/pixiv-viewer/discussions/10)
- [#13](https://github.com/asadahimeka/pixiv-viewer/discussions/13)

### 如何反馈 bug 或提出功能请求？

请到 [GitHub Issues](https://github.com/asadahimeka/pixiv-viewer/issues) 提交。
