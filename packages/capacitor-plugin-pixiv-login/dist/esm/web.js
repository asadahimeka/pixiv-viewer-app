import { WebPlugin } from '@capacitor/core';
/**
 * Web 平台兜底实现
 *
 * Web 环境没有原生 WebView / MITM 代理支持，全部方法抛错或返回不可用。
 * 实际使用时应在 JS 层判断平台，仅在 Android 上调用此插件。
 */
export class PixivLoginProxyWeb extends WebPlugin {
    async prepare(_options) {
        throw new Error('PixivLoginProxy is only available on Android.');
    }
    async refreshDns() {
        throw new Error('PixivLoginProxy is only available on Android.');
    }
    async openLogin(_options) {
        throw new Error('PixivLoginProxy is only available on Android.');
    }
    async stop() {
        // no-op
    }
    async request(_options) {
        throw new Error('PixivLoginProxy is only available on Android.');
    }
    async isAvailable() {
        return { available: false };
    }
}
//# sourceMappingURL=web.js.map
