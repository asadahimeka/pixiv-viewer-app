/**
 * Pixiv Cronet 插件类型定义
 */
export interface CronetRequestOptions {
    /**
     * 请求 URL
     */
    url: string;
    /**
     * HTTP 方法
     * @default 'GET'
     */
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /**
     * 请求头
     */
    headers?: Record<string, string>;
    /**
     * 请求体
     */
    body?: string;
}
export interface CronetResponse {
    /**
     * HTTP 状态码
     */
    status: number;
    /**
     * 响应头
     */
    headers: Record<string, string>;
    /**
     * 响应体
     */
    data: string;
    /**
     * 协商的协议 (h3/h2/http/1.1)
     */
    protocol: string;
}
export interface CronetPlugin {
    /**
     * 发起 HTTP 请求
     */
    request(options: CronetRequestOptions): Promise<CronetResponse>;
    /**
     * 检查 Cronet 是否可用
     */
    isAvailable(): Promise<{
        available: boolean;
    }>;
}
