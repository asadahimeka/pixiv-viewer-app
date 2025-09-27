export interface FileOpenerPlugin {
    open(options: FileOpenerOptions): Promise<void>;
}
export interface FileOpenerOptions {
    /**
     * Path to file
     */
    path: string;
    /**
     * Mime to select (optional, android only)
     */
    mime?: string;
}
