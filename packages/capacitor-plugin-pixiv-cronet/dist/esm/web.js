import { WebPlugin } from '@capacitor/core';
/**
 * Web 平台兜底实现
 *
 * 在 Web 环境下，由于没有 Cronet 支持，此实现会抛出错误
 * 实际使用时应在 JS 层判断平台，仅在 Android 上调用此插件
 */
export class PixivCronetWeb extends WebPlugin {
    async request(_options) {
        throw new Error('PixivCronet is only available on Android. Use standard fetch on web.');
    }
    async isAvailable() {
        return { available: false };
    }
}
//# sourceMappingURL=web.js.map