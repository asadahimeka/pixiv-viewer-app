import { WebPlugin } from '@capacitor/core';
import type { CronetPlugin, CronetRequestOptions, CronetResponse } from './definitions';
/**
 * Web 平台兜底实现
 *
 * 在 Web 环境下，由于没有 Cronet 支持，此实现会抛出错误
 * 实际使用时应在 JS 层判断平台，仅在 Android 上调用此插件
 */
export declare class PixivCronetWeb extends WebPlugin implements CronetPlugin {
    request(_options: CronetRequestOptions): Promise<CronetResponse>;
    isAvailable(): Promise<{
        available: boolean;
    }>;
}
