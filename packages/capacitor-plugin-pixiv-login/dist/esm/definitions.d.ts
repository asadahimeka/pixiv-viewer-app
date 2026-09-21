export interface PrepareOptions {
    /**
     * 是否启用内置 MITM 代理（默认 true）。
     * false 时仅清空 WebView 代理覆盖，直接走系统网络。
     */
    useProxy?: boolean;
}
export interface PrepareResult {
    /** 当前登录网络模式 */
    mode: 'proxy' | 'direct';
    /** 本机代理端口（direct 模式为 0） */
    port: number;
    /** DNS 刷新结果摘要 */
    dnsSummary?: string;
    /** 当前 WebView 是否支持 PROXY_OVERRIDE */
    proxySupported?: boolean;
}
export interface DnsRefreshResult {
    /** host -> "ip1,ip2" */
    updated: Record<string, string>;
    /** host -> error message */
    errors: Record<string, string>;
    summary: string;
}
export interface OpenLoginOptions {
    /** PKCE 登录页 URL：https://app-api.pixiv.net/web/v1/login?code_challenge=... */
    url: string;
    /** 是否为 MITM 模式（影响 WebView SSL 错误处理策略） */
    useProxy?: boolean;
}
export interface OpenLoginResult {
    /** 从 pixiv:// 回调截获的授权 code */
    code: string;
}
export interface ProxyRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    /** 请求体字符串（表单等） */
    body?: string;
    /** 连接/读取超时（毫秒），默认 30000 */
    timeout?: number;
}
export interface ProxyRequestResult {
    status: number;
    /** 响应体文本 */
    body: string;
}
export interface IsAvailableResult {
    available: boolean;
}
export interface PixivLoginProxyPlugin {
    /**
     * 准备登录环境：启动本机代理（可选）+ 刷新动态 IP + 给 WebView 设置代理覆盖。
     * DNS 刷新失败时 reject（绝不回退系统 DNS），由 JS 决定降级直连或中止。
     */
    prepare(options?: PrepareOptions): Promise<PrepareResult>;
    /** 手动重新刷新动态 Host IP 表 */
    refreshDns(): Promise<DnsRefreshResult>;
    /**
     * 打开应用内登录 WebView。
     * 截获到 pixiv://account/login?code=... 时 resolve { code }；
     * 用户返回/关闭时 reject('cancelled')。
     */
    openLogin(options: OpenLoginOptions): Promise<OpenLoginResult>;
    /** 停止本机代理并清空 WebView 代理覆盖 */
    stop(): Promise<void>;
    /**
     * 经本机代理发一次 HTTP 请求（MITM 动态 IP + SNI 直拨上游）。
     * 用于 oauth.secure.pixiv.net 的 token 交换兜底通道。
     */
    request(options: ProxyRequestOptions): Promise<ProxyRequestResult>;
    isAvailable(): Promise<IsAvailableResult>;
}
//# sourceMappingURL=definitions.d.ts.map
