import { WebPlugin } from '@capacitor/core';
import type { MediastorePlugin, SavePictureOptions, SavePictureResult, SaveToDownloadsOptions, SaveToDownloadsResult, SaveVideoOptions, SaveVideoResult } from './definitions';
export declare class MediastoreWeb extends WebPlugin implements MediastorePlugin {
    savePicture(options: SavePictureOptions): Promise<SavePictureResult>;
    saveToDownloads(options: SaveToDownloadsOptions): Promise<SaveToDownloadsResult>;
    saveVideo(options: SaveVideoOptions): Promise<SaveVideoResult>;
}
