import type { PluginListenerHandle } from '@capacitor/core';
export interface FileDownloadPlugin {
    download(options: FileDownloadOptions): Promise<FileDownloadResponse>;
    /**
     * Cancel a queued/running DownloadManager task registered by taskId.
     * The pending call is rejected with "DOWNLOAD_CANCELLED".
     */
    cancelDownload(options: CancelDownloadOptions): Promise<void>;
    addListener(eventName: 'downloadProgress', listenerFunc: (progress: FileDownloadProgress) => void): Promise<PluginListenerHandle> & PluginListenerHandle;
}
export interface FileDownloadOptions {
    uri: string;
    fileName: string;
    /** Task id used to correlate the download with `cancelDownload`. */
    taskId?: string;
}
export interface CancelDownloadOptions {
    taskId: string;
}
export interface FileDownloadResponse {
    path: string;
}
export interface FileDownloadProgress {
    progress: number;
}
