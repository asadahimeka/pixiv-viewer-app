/*jslint browser */

import {Capacitor, registerPlugin} from "@capacitor/core";
import {Filesystem} from "@capacitor/filesystem";

const BlobWriter = registerPlugin("BlobWriter");

// The built-in CapacitorHttp plugin can be configured to monkey patch the
// global 'fetch' function, but that forces 'blob' over the bridge which is
// what we're trying to avoid. We attempt to subvert the monkey patching.

const real_fetch = window.CapacitorWebFetch || window.fetch;

function array_buffer_to_base64(buffer) {
    return window.btoa(
        Array.from(new Uint8Array(buffer)).map(function (byte) {
            return String.fromCharCode(byte);
        }).join("")
    );
}

function write_file_via_indexeddb({
    path,
    directory,
    blob,
    recursive
}) {

// Firstly, create the file entry in the database. This populates a bunch of
// properties on the entry, such as mtime, ctime and type, and also gives the
// Filesystem plugin a chance to initialize its database.

    return Filesystem.writeFile({
        directory,
        path,
        recursive,
        data: ""
    }).then(function () {

// Now reach into IndexedDB and assign 'blob' to the file entry.

        return new Promise(function (resolve, reject) {
            function fail(event) {
                reject(event.target.error);
            }
            const connection = window.indexedDB.open("Disc");
            connection.onerror = fail;
            connection.onsuccess = function () {
                const db = connection.result;
                const transaction = db.transaction("FileStorage", "readwrite");
                transaction.onerror = fail;
                const store = transaction.objectStore("FileStorage");
                const name = `/${directory}/${path.replace(/^\//, "")}`;
                const load = store.get(name);
                load.onsuccess = function () {
                    load.result.size = blob.size;
                    load.result.content = blob;
                    const put = store.put(load.result);
                    put.onsuccess = function () {
                        resolve(undefined);
                    };
                };
            };
        });
    });
}

function write_file_via_bridge({
    path,
    directory,
    blob,
    recursive
}) {

// Firstly, create or truncate the file.

    return Filesystem.writeFile({
        directory,
        path,
        recursive,
        data: ""
    }).then(function consume_blob() {

// Now write the file incrementally so that we do not exhaust our memory in
// attempting to Base64 encode the entire Blob at once.

        if (blob.size === 0) {
            return Promise.resolve();
        }

// By choosing a chunk size which is a multiple of 3, we avoid a bug in
// Filesystem.appendFile, only on the web platform, which corrupts files by
// inserting Base64 padding characters within the file. See
// https://github.com/ionic-team/capacitor-plugins/issues/649.

        const chunk_size = 3 * 128 * 1024;
        const chunk_blob = blob.slice(0, chunk_size);
        blob = blob.slice(chunk_size);

// Read the Blob as an ArrayBuffer, then append it to the file on disk.

        return new Response(
            chunk_blob
        ).arrayBuffer(
        ).then(function append_chunk_to_file(buffer) {
            return Filesystem.appendFile({
                directory,
                path,
                data: array_buffer_to_base64(buffer)
            });
        }).then(
            consume_blob
        );
    });
}

function write_blob(options) {
    const {
        path,
        directory,
        blob,
        fast_mode = false,
        recursive,
        on_fallback
    } = options;
    if (
        !blob
        || !Number.isSafeInteger(blob.size)
        || typeof blob.type !== "string"
    ) {
        return Promise.reject(new Error("Not a Blob."));
    }
    if (Capacitor.getPlatform() === "web") {
        return (
            fast_mode
            ? write_file_via_indexeddb(options)
            : write_file_via_bridge(options)
        );
    }
    return Promise.all([
        BlobWriter.get_config(),
        Filesystem.getUri({path, directory})
    ]).then(function ([config, file_info]) {
        const absolute_path = file_info.uri.replace("file://", "");
        return real_fetch(
            config.base_url + absolute_path + (
                recursive
                ? "?recursive=true"
                : ""
            ),
            {
                headers: {authorization: config.auth_token},
                method: "put",
                body: blob
            }
        ).then(function (response) {
            if (response.status !== 204) {
                throw new Error("Bad HTTP status: " + response.status);
            }

// Producing a file URI is deprecated. In the next major version, the returned
// Promise should resolve to undefined.

            return file_info.uri;
        });
    }).catch(function on_fail(error) {
        if (on_fallback !== undefined) {
            on_fallback(error);
        }
        return write_file_via_bridge(options);
    });
}

export default Object.freeze(write_blob);
