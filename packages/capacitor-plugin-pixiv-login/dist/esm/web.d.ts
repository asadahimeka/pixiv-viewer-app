import { WebPlugin } from '@capacitor/core';
import type { PixivLoginProxyPlugin, PrepareOptions, PrepareResult, DnsRefreshResult, OpenLoginOptions, OpenLoginResult, ProxyRequestOptions, ProxyRequestResult, IsAvailableResult } from './definitions';
/**
 * Web 平台兜底实现
 *
 * Web 环境没有原生 WebView / MITM 代理支持，全部方法抛错或返回不可用。
 * 实际使用时应在 JS 层判断平台，仅在 Android 上调用此插件。
 */
export declare class PixivLoginProxyWeb extends WebPlugin implements PixivLoginProxyPlugin {
    prepare(_options?: PrepareOptions): Promise<PrepareResult>;
    refreshDns(): Promise<DnsRefreshResult>;
    openLogin(_options: OpenLoginOptions): Promise<OpenLoginResult>;
    stop(): Promise<void>;
    request(_options: ProxyRequestOptions): Promise<ProxyRequestResult>;
    isAvailable(): Promise<IsAvailableResult>;
}
//# sourceMappingURL=web.d.ts.map
