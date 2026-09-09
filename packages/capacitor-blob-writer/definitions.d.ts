import { Directory } from '@capacitor/filesystem';

export interface BlobWriteOptions {
    path: string;
    directory?: Directory;
    blob: Blob;
    fast_mode?: boolean;
    recursive?: boolean;
    on_fallback?: (error: Error) => void;
}

declare function write_blob(options: BlobWriteOptions): Promise<string>;
export default write_blob;
