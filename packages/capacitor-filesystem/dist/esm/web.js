import { WebPlugin, buildRequestInit } from '@capacitor/core';
import { Encoding } from './definitions';
function resolve(path) {
    const posix = path.split('/').filter(item => item !== '.');
    const newPosix = [];
    posix.forEach(item => {
        if (item === '..' &&
            newPosix.length > 0 &&
            newPosix[newPosix.length - 1] !== '..') {
            newPosix.pop();
        }
        else {
            newPosix.push(item);
        }
    });
    return newPosix.join('/');
}
function isPathParent(parent, children) {
    parent = resolve(parent);
    children = resolve(children);
    const pathsA = parent.split('/');
    const pathsB = children.split('/');
    return (parent !== children &&
        pathsA.every((value, index) => value === pathsB[index]));
}
export class FilesystemWeb extends WebPlugin {
    constructor() {
        super(...arguments);
        this.DB_VERSION = 1;
        this.DB_NAME = 'Disc';
        this._writeCmds = ['add', 'put', 'delete'];
        /**
         * Function that performs a http request to a server and downloads the file to the specified destination
         *
         * @param options the options for the download operation
         * @returns a promise that resolves with the download file result
         */
        this.downloadFile = async (options) => {
            var _a, _b;
            const requestInit = buildRequestInit(options, options.webFetchExtra);
            const response = await fetch(options.url, requestInit);
            let blob;
            if (!options.progress)
                blob = await response.blob();
            else if (!(response === null || response === void 0 ? void 0 : response.body))
                blob = new Blob();
            else {
                const reader = response.body.getReader();
                let bytes = 0;
                const chunks = [];
                const contentType = response.headers.get('content-type');
                const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    chunks.push(value);
                    bytes += (value === null || value === void 0 ? void 0 : value.length) || 0;
                    const status = {
                        url: options.url,
                        bytes,
                        contentLength,
                    };
                    this.notifyListeners('progress', status);
                }
                const allChunks = new Uint8Array(bytes);
                let position = 0;
                for (const chunk of chunks) {
                    if (typeof chunk === 'undefined')
                        continue;
                    allChunks.set(chunk, position);
                    position += chunk.length;
                }
                blob = new Blob([allChunks.buffer], { type: contentType || undefined });
            }
            const result = await this.writeFile({
                path: options.path,
                directory: (_a = options.directory) !== null && _a !== void 0 ? _a : undefined,
                recursive: (_b = options.recursive) !== null && _b !== void 0 ? _b : false,
                data: blob,
            });
            return { path: result.uri, blob };
        };
    }
    async initDb() {
        if (this._db !== undefined) {
            return this._db;
        }
        if (!('indexedDB' in window)) {
            throw this.unavailable("This browser doesn't support IndexedDB");
        }
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = FilesystemWeb.doUpgrade;
            request.onsuccess = () => {
                this._db = request.result;
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
                console.warn('db blocked');
            };
        });
    }
    static doUpgrade(event) {
        const eventTarget = event.target;
        const db = eventTarget.result;
        switch (event.oldVersion) {
            case 0:
            case 1:
            default: {
                if (db.objectStoreNames.contains('FileStorage')) {
                    db.deleteObjectStore('FileStorage');
                }
                const store = db.createObjectStore('FileStorage', { keyPath: 'path' });
                store.createIndex('by_folder', 'folder');
            }
        }
    }
    async dbRequest(cmd, args) {
        const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? 'readwrite' : 'readonly';
        return this.initDb().then((conn) => {
            return new Promise((resolve, reject) => {
                const tx = conn.transaction(['FileStorage'], readFlag);
                const store = tx.objectStore('FileStorage');
                const req = store[cmd](...args);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        });
    }
    async dbIndexRequest(indexName, cmd, args) {
        const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? 'readwrite' : 'readonly';
        return this.initDb().then((conn) => {
            return new Promise((resolve, reject) => {
                const tx = conn.transaction(['FileStorage'], readFlag);
                const store = tx.objectStore('FileStorage');
                const index = store.index(indexName);
                const req = index[cmd](...args);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        });
    }
    getPath(directory, uriPath) {
        const cleanedUriPath = uriPath !== undefined ? uriPath.replace(/^[/]+|[/]+$/g, '') : '';
        let fsPath = '';
        if (directory !== undefined)
            fsPath += '/' + directory;
        if (uriPath !== '')
            fsPath += '/' + cleanedUriPath;
        return fsPath;
    }
    async clear() {
        const conn = await this.initDb();
        const tx = conn.transaction(['FileStorage'], 'readwrite');
        const store = tx.objectStore('FileStorage');
        store.clear();
    }
    /**
     * Read a file from disk
     * @param options options for the file read
     * @return a promise that resolves with the read file data result
     */
    async readFile(options) {
        const path = this.getPath(options.directory, options.path);
        // const encoding = options.encoding;
        const entry = (await this.dbRequest('get', [path]));
        if (entry === undefined)
            throw Error('File does not exist.');
        return { data: entry.content ? entry.content : '' };
    }
    /**
     * Write a file to disk in the specified location on device
     * @param options options for the file write
     * @return a promise that resolves with the file write result
     */
    async writeFile(options) {
        const path = this.getPath(options.directory, options.path);
        let data = options.data;
        const encoding = options.encoding;
        const doRecursive = options.recursive;
        const occupiedEntry = (await this.dbRequest('get', [path]));
        if (occupiedEntry && occupiedEntry.type === 'directory')
            throw Error('The supplied path is a directory.');
        const parentPath = path.substr(0, path.lastIndexOf('/'));
        const parentEntry = (await this.dbRequest('get', [parentPath]));
        if (parentEntry === undefined) {
            const subDirIndex = parentPath.indexOf('/', 1);
            if (subDirIndex !== -1) {
                const parentArgPath = parentPath.substr(subDirIndex);
                await this.mkdir({
                    path: parentArgPath,
                    directory: options.directory,
                    recursive: doRecursive,
                });
            }
        }
        if (!encoding && !(data instanceof Blob)) {
            data = data.indexOf(',') >= 0 ? data.split(',')[1] : data;
            if (!this.isBase64String(data))
                throw Error('The supplied data is not valid base64 content.');
        }
        const now = Date.now();
        const pathObj = {
            path: path,
            folder: parentPath,
            type: 'file',
            size: data instanceof Blob ? data.size : data.length,
            ctime: now,
            mtime: now,
            content: data,
        };
        await this.dbRequest('put', [pathObj]);
        return {
            uri: pathObj.path,
        };
    }
    /**
     * Append to a file on disk in the specified location on device
     * @param options options for the file append
     * @return a promise that resolves with the file write result
     */
    async appendFile(options) {
        const path = this.getPath(options.directory, options.path);
        let data = options.data;
        const encoding = options.encoding;
        const parentPath = path.substr(0, path.lastIndexOf('/'));
        const now = Date.now();
        let ctime = now;
        const occupiedEntry = (await this.dbRequest('get', [path]));
        if (occupiedEntry && occupiedEntry.type === 'directory')
            throw Error('The supplied path is a directory.');
        const parentEntry = (await this.dbRequest('get', [parentPath]));
        if (parentEntry === undefined) {
            const subDirIndex = parentPath.indexOf('/', 1);
            if (subDirIndex !== -1) {
                const parentArgPath = parentPath.substr(subDirIndex);
                await this.mkdir({
                    path: parentArgPath,
                    directory: options.directory,
                    recursive: true,
                });
            }
        }
        if (!encoding && !this.isBase64String(data))
            throw Error('The supplied data is not valid base64 content.');
        if (occupiedEntry !== undefined) {
            if (occupiedEntry.content instanceof Blob) {
                throw Error('The occupied entry contains a Blob object which cannot be appended to.');
            }
            if (occupiedEntry.content !== undefined && !encoding) {
                data = btoa(atob(occupiedEntry.content) + atob(data));
            }
            else {
                data = occupiedEntry.content + data;
            }
            ctime = occupiedEntry.ctime;
        }
        const pathObj = {
            path: path,
            folder: parentPath,
            type: 'file',
            size: data.length,
            ctime: ctime,
            mtime: now,
            content: data,
        };
        await this.dbRequest('put', [pathObj]);
    }
    /**
     * Delete a file from disk
     * @param options options for the file delete
     * @return a promise that resolves with the deleted file data result
     */
    async deleteFile(options) {
        const path = this.getPath(options.directory, options.path);
        const entry = (await this.dbRequest('get', [path]));
        if (entry === undefined)
            throw Error('File does not exist.');
        const entries = await this.dbIndexRequest('by_folder', 'getAllKeys', [
            IDBKeyRange.only(path),
        ]);
        if (entries.length !== 0)
            throw Error('Folder is not empty.');
        await this.dbRequest('delete', [path]);
    }
    /**
     * Create a directory.
     * @param options options for the mkdir
     * @return a promise that resolves with the mkdir result
     */
    async mkdir(options) {
        const path = this.getPath(options.directory, options.path);
        const doRecursive = options.recursive;
        const parentPath = path.substr(0, path.lastIndexOf('/'));
        const depth = (path.match(/\//g) || []).length;
        const parentEntry = (await this.dbRequest('get', [parentPath]));
        const occupiedEntry = (await this.dbRequest('get', [path]));
        if (depth === 1)
            throw Error('Cannot create Root directory');
        if (occupiedEntry !== undefined)
            throw Error('Current directory does already exist.');
        if (!doRecursive && depth !== 2 && parentEntry === undefined)
            throw Error('Parent directory must exist');
        if (doRecursive && depth !== 2 && parentEntry === undefined) {
            const parentArgPath = parentPath.substr(parentPath.indexOf('/', 1));
            await this.mkdir({
                path: parentArgPath,
                directory: options.directory,
                recursive: doRecursive,
            });
        }
        const now = Date.now();
        const pathObj = {
            path: path,
            folder: parentPath,
            type: 'directory',
            size: 0,
            ctime: now,
            mtime: now,
        };
        await this.dbRequest('put', [pathObj]);
    }
    /**
     * Remove a directory
     * @param options the options for the directory remove
     */
    async rmdir(options) {
        const { path, directory, recursive } = options;
        const fullPath = this.getPath(directory, path);
        const entry = (await this.dbRequest('get', [fullPath]));
        if (entry === undefined)
            throw Error('Folder does not exist.');
        if (entry.type !== 'directory')
            throw Error('Requested path is not a directory');
        const readDirResult = await this.readdir({ path, directory });
        if (readDirResult.files.length !== 0 && !recursive)
            throw Error('Folder is not empty');
        for (const entry of readDirResult.files) {
            const entryPath = `${path}/${entry.name}`;
            const entryObj = await this.stat({ path: entryPath, directory });
            if (entryObj.type === 'file') {
                await this.deleteFile({ path: entryPath, directory });
            }
            else {
                await this.rmdir({ path: entryPath, directory, recursive });
            }
        }
        await this.dbRequest('delete', [fullPath]);
    }
    /**
     * Return a list of files from the directory (not recursive)
     * @param options the options for the readdir operation
     * @return a promise that resolves with the readdir directory listing result
     */
    async readdir(options) {
        const path = this.getPath(options.directory, options.path);
        const entry = (await this.dbRequest('get', [path]));
        if (options.path !== '' && entry === undefined)
            throw Error('Folder does not exist.');
        const entries = await this.dbIndexRequest('by_folder', 'getAllKeys', [IDBKeyRange.only(path)]);
        const files = await Promise.all(entries.map(async (e) => {
            let subEntry = (await this.dbRequest('get', [e]));
            if (subEntry === undefined) {
                subEntry = (await this.dbRequest('get', [e + '/']));
            }
            return {
                name: e.substring(path.length + 1),
                type: subEntry.type,
                size: subEntry.size,
                ctime: subEntry.ctime,
                mtime: subEntry.mtime,
                uri: subEntry.path,
            };
        }));
        return { files: files };
    }
    /**
     * Return full File URI for a path and directory
     * @param options the options for the stat operation
     * @return a promise that resolves with the file stat result
     */
    async getUri(options) {
        const path = this.getPath(options.directory, options.path);
        let entry = (await this.dbRequest('get', [path]));
        if (entry === undefined) {
            entry = (await this.dbRequest('get', [path + '/']));
        }
        return {
            uri: (entry === null || entry === void 0 ? void 0 : entry.path) || path,
        };
    }
    /**
     * Return data about a file
     * @param options the options for the stat operation
     * @return a promise that resolves with the file stat result
     */
    async stat(options) {
        const path = this.getPath(options.directory, options.path);
        let entry = (await this.dbRequest('get', [path]));
        if (entry === undefined) {
            entry = (await this.dbRequest('get', [path + '/']));
        }
        if (entry === undefined)
            throw Error('Entry does not exist.');
        return {
            type: entry.type,
            size: entry.size,
            ctime: entry.ctime,
            mtime: entry.mtime,
            uri: entry.path,
        };
    }
    async getFileSize(options) {
        console.log('options: ', options);
        throw new Error('Not implemented in web.');
    }
    /**
     * Rename a file or directory
     * @param options the options for the rename operation
     * @return a promise that resolves with the rename result
     */
    async rename(options) {
        await this._copy(options, true);
        return;
    }
    /**
     * Copy a file or directory
     * @param options the options for the copy operation
     * @return a promise that resolves with the copy result
     */
    async copy(options) {
        return this._copy(options, false);
    }
    async requestPermissions() {
        return { publicStorage: 'granted' };
    }
    async checkPermissions() {
        return { publicStorage: 'granted' };
    }
    /**
     * Function that can perform a copy or a rename
     * @param options the options for the rename operation
     * @param doRename whether to perform a rename or copy operation
     * @return a promise that resolves with the result
     */
    async _copy(options, doRename = false) {
        let { toDirectory } = options;
        const { to, from, directory: fromDirectory } = options;
        if (!to || !from) {
            throw Error('Both to and from must be provided');
        }
        // If no "to" directory is provided, use the "from" directory
        if (!toDirectory) {
            toDirectory = fromDirectory;
        }
        const fromPath = this.getPath(fromDirectory, from);
        const toPath = this.getPath(toDirectory, to);
        // Test that the "to" and "from" locations are different
        if (fromPath === toPath) {
            return {
                uri: toPath,
            };
        }
        if (isPathParent(fromPath, toPath)) {
            throw Error('To path cannot contain the from path');
        }
        // Check the state of the "to" location
        let toObj;
        try {
            toObj = await this.stat({
                path: to,
                directory: toDirectory,
            });
        }
        catch (e) {
            // To location does not exist, ensure the directory containing "to" location exists and is a directory
            const toPathComponents = to.split('/');
            toPathComponents.pop();
            const toPath = toPathComponents.join('/');
            // Check the containing directory of the "to" location exists
            if (toPathComponents.length > 0) {
                const toParentDirectory = await this.stat({
                    path: toPath,
                    directory: toDirectory,
                });
                if (toParentDirectory.type !== 'directory') {
                    throw new Error('Parent directory of the to path is a file');
                }
            }
        }
        // Cannot overwrite a directory
        if (toObj && toObj.type === 'directory') {
            throw new Error('Cannot overwrite a directory with a file');
        }
        // Ensure the "from" object exists
        const fromObj = await this.stat({
            path: from,
            directory: fromDirectory,
        });
        // Set the mtime/ctime of the supplied path
        const updateTime = async (path, ctime, mtime) => {
            const fullPath = this.getPath(toDirectory, path);
            const entry = (await this.dbRequest('get', [fullPath]));
            entry.ctime = ctime;
            entry.mtime = mtime;
            await this.dbRequest('put', [entry]);
        };
        const ctime = fromObj.ctime ? fromObj.ctime : Date.now();
        switch (fromObj.type) {
            // The "from" object is a file
            case 'file': {
                // Read the file
                const file = await this.readFile({
                    path: from,
                    directory: fromDirectory,
                });
                // Optionally remove the file
                if (doRename) {
                    await this.deleteFile({
                        path: from,
                        directory: fromDirectory,
                    });
                }
                let encoding;
                if (!(file.data instanceof Blob) && !this.isBase64String(file.data)) {
                    encoding = Encoding.UTF8;
                }
                // Write the file to the new location
                const writeResult = await this.writeFile({
                    path: to,
                    directory: toDirectory,
                    data: file.data,
                    encoding: encoding,
                });
                // Copy the mtime/ctime of a renamed file
                if (doRename) {
                    await updateTime(to, ctime, fromObj.mtime);
                }
                // Resolve promise
                return writeResult;
            }
            case 'directory': {
                if (toObj) {
                    throw Error('Cannot move a directory over an existing object');
                }
                try {
                    // Create the to directory
                    await this.mkdir({
                        path: to,
                        directory: toDirectory,
                        recursive: false,
                    });
                    // Copy the mtime/ctime of a renamed directory
                    if (doRename) {
                        await updateTime(to, ctime, fromObj.mtime);
                    }
                }
                catch (e) {
                    // ignore
                }
                // Iterate over the contents of the from location
                const contents = (await this.readdir({
                    path: from,
                    directory: fromDirectory,
                })).files;
                for (const filename of contents) {
                    // Move item from the from directory to the to directory
                    await this._copy({
                        from: `${from}/${filename.name}`,
                        to: `${to}/${filename.name}`,
                        directory: fromDirectory,
                        toDirectory,
                    }, doRename);
                }
                // Optionally remove the original from directory
                if (doRename) {
                    await this.rmdir({
                        path: from,
                        directory: fromDirectory,
                    });
                }
            }
        }
        return {
            uri: toPath,
        };
    }
    isBase64String(str) {
        try {
            return btoa(atob(str)) == str;
        }
        catch (err) {
            return false;
        }
    }
    /**
     * Web 端下载走 fetch,无跨调用登记表,取消由 JS 执行层在回调后短路,这里只做应答
     */
    async cancelDownload(_) {
        return;
    }
    /**
     * Web 端不做缩略图生成:直接返回原图路径,由调用方按需降级
     */
    async generateThumbnail(options) {
        return { uri: options.path, mtime: 0 };
    }
}
FilesystemWeb._debug = true;
//# sourceMappingURL=web.js.map