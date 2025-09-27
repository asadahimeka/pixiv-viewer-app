import { WebPlugin } from '@capacitor/core';
import type { FileOpenerOptions, FileOpenerPlugin } from './definitions';
export declare class FileOpenerWeb extends WebPlugin implements FileOpenerPlugin {
    open(options: FileOpenerOptions): Promise<void>;
}
