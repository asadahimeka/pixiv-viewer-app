'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var core = require('@capacitor/core');

const PixivLoginProxy = core.registerPlugin('PixivLoginProxy', {
    web: () => Promise.resolve().then(function () { return web; }).then(m => new m.PixivLoginProxyWeb()),
});

/**
 * Web 平台兜底实现
 *
 * Web 环境没有原生 WebView / MITM 代理支持，全部方法抛错或返回不可用。
 * 实际使用时应在 JS 层判断平台，仅在 Android 上调用此插件。
 */
class PixivLoginProxyWeb extends core.WebPlugin {
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

var web = /*#__PURE__*/Object.freeze({
    __proto__: null,
    PixivLoginProxyWeb: PixivLoginProxyWeb
});

exports.PixivLoginProxy = PixivLoginProxy;
//# sourceMappingURL=plugin.cjs.js.map
