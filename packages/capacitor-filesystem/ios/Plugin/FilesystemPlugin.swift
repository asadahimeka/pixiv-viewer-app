import Foundation
import Capacitor
import ImageIO
import CryptoKit

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitorjs.com/docs/plugins/ios
 */
@objc(FilesystemPlugin)
public class FilesystemPlugin: CAPPlugin {
    private let implementation = Filesystem()

    /**
     * 取消下载:按 taskId 找回 URLSessionTask 并 cancel(),
     * 任务以 error 完成回调,JS 侧收到 reject("cancelled")
     */
    @objc func cancelDownload(_ call: CAPPluginCall) {
        guard let taskId = call.getString("taskId") else {
            return call.reject("taskId is required")
        }
        Filesystem.cancelDownloadTask(taskId: taskId)
        call.resolve()
    }

    /**
     * 生成下载缩略图:ImageIO 按 maxSize 采样解码;
     * 产物写入 Caches/download_thumbs/<md5(path+mtime)>.jpg,命中直接复用。
     * 返回 { uri, mtime }。视频缩略图暂不支持,JS 侧回退类型图标。
     */
    @objc func generateThumbnail(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            return call.reject("path is required")
        }
        let maxSize = call.getInt("maxSize", 320)
        var clean = path
        if clean.hasPrefix("file://") {
            clean = String(clean.dropFirst("file://".count))
        }
        let src = URL(fileURLWithPath: clean)
        guard FileManager.default.fileExists(atPath: src.path) else {
            return call.reject("FILE_NOT_FOUND")
        }

        var mtime: TimeInterval = 0
        if let attrs = try? FileManager.default.attributesOfItem(atPath: src.path),
           let modDate = attrs[.modificationDate] as? Date {
            mtime = modDate.timeIntervalSince1970
        }

        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("download_thumbs", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        let digest = Insecure.MD5.hash(data: Data("\(clean)_\(mtime)".utf8))
        let key = digest.map { String(format: "%02x", $0) }.joined()
        let out = cacheDir.appendingPathComponent("\(key).jpg")

        if FileManager.default.fileExists(atPath: out.path) {
            call.resolve(["uri": out.absoluteString, "mtime": mtime])
            return
        }

        guard let source = CGImageSourceCreateWithURL(src as CFURL, nil) else {
            return call.reject("THUMB_UNSUPPORTED")
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSize
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return call.reject("THUMB_UNSUPPORTED")
        }
        guard let dest = CGImageDestinationCreateWithURL(out as CFURL, "public.jpeg" as CFString, 1, nil) else {
            return call.reject("THUMB_ERROR")
        }
        CGImageDestinationAddImage(dest, image, nil)
        if CGImageDestinationFinalize(dest) {
            call.resolve(["uri": out.absoluteString, "mtime": mtime])
        } else {
            call.reject("THUMB_ERROR")
        }
    }

    /**
     * Read a file from the filesystem.
     */
    @objc func readFile(_ call: CAPPluginCall) {
        let encoding = call.getString("encoding")

        guard let file = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }
        let directory = call.getString("directory")

        guard let fileUrl = implementation.getFileUrl(at: file, in: directory) else {
            handleError(call, "Invalid path")
            return
        }
        do {
            let data = try implementation.readFile(at: fileUrl, with: encoding)
            call.resolve([
                "data": data
            ])
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    /**
     * Write a file to the filesystem.
     */
    @objc func writeFile(_ call: CAPPluginCall) {
        let encoding = call.getString("encoding")
        let recursive = call.getBool("recursive") ?? false

        guard let file = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        guard let data = call.getString("data") else {
            handleError(call, "Data must be provided and must be a string.")
            return
        }

        let directory = call.getString("directory")

        guard let fileUrl = implementation.getFileUrl(at: file, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        do {
            let path = try implementation.writeFile(at: fileUrl, with: data, recursive: recursive, with: encoding)
            call.resolve([
                "uri": path
            ])
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    /**
     * Append to a file.
     */
    @objc func appendFile(_ call: CAPPluginCall) {
        let encoding = call.getString("encoding")

        guard let file = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        guard let data = call.getString("data") else {
            handleError(call, "Data must be provided and must be a string.")
            return
        }

        let directory = call.getString("directory")
        guard let fileUrl = implementation.getFileUrl(at: file, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        do {
            try implementation.appendFile(at: fileUrl, with: data, recursive: false, with: encoding)
            call.resolve()
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    /**
     * Delete a file.
     */
    @objc func deleteFile(_ call: CAPPluginCall) {
        guard let file = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        let directory = call.getString("directory")
        guard let fileUrl = implementation.getFileUrl(at: file, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        do {
            try implementation.deleteFile(at: fileUrl)
            call.resolve()
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    /**
     * Make a new directory, optionally creating parent folders first.
     */
    @objc func mkdir(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        let recursive = call.getBool("recursive") ?? false
        let directory = call.getString("directory")
        guard let fileUrl = implementation.getFileUrl(at: path, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        do {
            try implementation.mkdir(at: fileUrl, recursive: recursive)
            call.resolve()
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    /**
     * Remove a directory.
     */
    @objc func rmdir(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        let directory = call.getString("directory")
        guard let fileUrl = implementation.getFileUrl(at: path, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        let recursive = call.getBool("recursive") ?? false

        do {
            try implementation.rmdir(at: fileUrl, recursive: recursive)
            call.resolve()
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    /**
     * Read the contents of a directory.
     */
    @objc func readdir(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        let directory = call.getString("directory")
        guard let fileUrl = implementation.getFileUrl(at: path, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        do {
            let directoryContents = try implementation.readdir(at: fileUrl)
            let directoryContent = try directoryContents.map {(url: URL) -> [String: Any] in
                let attr = try implementation.stat(at: url)
                var ctime = ""
                var mtime = ""

                if let ctimeSeconds = (attr[.creationDate] as? Date)?.timeIntervalSince1970 {
                    ctime = String(format: "%.0f", ctimeSeconds * 1000)
                }

                if let mtimeSeconds = (attr[.modificationDate] as? Date)?.timeIntervalSince1970 {
                    mtime = String(format: "%.0f", mtimeSeconds * 1000)
                }
                return [
                    "name": url.lastPathComponent,
                    "type": implementation.getType(from: attr),
                    "size": attr[.size] as? UInt64 ?? 0,
                    "ctime": ctime,
                    "mtime": mtime,
                    "uri": url.absoluteString
                ]
            }
            call.resolve([
                "files": directoryContent
            ])
        } catch {
            handleError(call, error.localizedDescription, error)
        }
    }

    @objc func stat(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        let directory = call.getString("directory")
        guard let fileUrl = implementation.getFileUrl(at: path, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        do {
            let attr = try implementation.stat(at: fileUrl)

            var ctime = ""
            var mtime = ""

            if let ctimeSeconds = (attr[.creationDate] as? Date)?.timeIntervalSince1970 {
                ctime = String(format: "%.0f", ctimeSeconds * 1000)
            }

            if let mtimeSeconds = (attr[.modificationDate] as? Date)?.timeIntervalSince1970 {
                mtime = String(format: "%.0f", mtimeSeconds * 1000)
            }

            call.resolve([
                "type": implementation.getType(from: attr),
                "size": attr[.size] as? UInt64 ?? 0,
                "ctime": ctime,
                "mtime": mtime,
                "uri": fileUrl.absoluteString
            ])
        } catch {
            handleError(call, error.localizedDescription, error)
        }
    }

    @objc func getUri(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            handleError(call, "path must be provided and must be a string.")
            return
        }

        let directory = call.getString("directory")
        guard let fileUrl = implementation.getFileUrl(at: path, in: directory) else {
            handleError(call, "Invalid path")
            return
        }

        call.resolve([
            "uri": fileUrl.absoluteString
        ])

    }

    /**
     * Rename a file or directory.
     */
    @objc func rename(_ call: CAPPluginCall) {
        guard let from = call.getString("from"), let to = call.getString("to") else {
            handleError(call, "Both to and from must be provided")
            return
        }

        let directory = call.getString("directory")
        let toDirectory = call.getString("toDirectory") ?? directory

        guard let fromUrl = implementation.getFileUrl(at: from, in: directory) else {
            handleError(call, "Invalid from path")
            return
        }

        guard let toUrl = implementation.getFileUrl(at: to, in: toDirectory) else {
            handleError(call, "Invalid to path")
            return
        }
        do {
            try implementation.rename(at: fromUrl, to: toUrl)
            call.resolve()
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    /**
     * Copy a file or directory.
     */
    @objc func copy(_ call: CAPPluginCall) {
        guard let from = call.getString("from"), let to = call.getString("to") else {
            handleError(call, "Both to and from must be provided")
            return
        }

        let directory = call.getString("directory")
        let toDirectory = call.getString("toDirectory") ?? directory

        guard let fromUrl = implementation.getFileUrl(at: from, in: directory) else {
            handleError(call, "Invalid from path")
            return
        }

        guard let toUrl = implementation.getFileUrl(at: to, in: toDirectory) else {
            handleError(call, "Invalid to path")
            return
        }
        do {
            try implementation.copy(at: fromUrl, to: toUrl)
            call.resolve([
                "uri": toUrl.absoluteString
            ])
        } catch let error as NSError {
            handleError(call, error.localizedDescription, error)
        }
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve([
            "publicStorage": "granted"
        ])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        call.resolve([
            "publicStorage": "granted"
        ])
    }

    @objc func downloadFile(_ call: CAPPluginCall) {
        guard let url = call.getString("url") else { return call.reject("Must provide a URL") }
        let progressEmitter: Filesystem.ProgressEmitter = { bytes, contentLength in
            self.notifyListeners("progress", data: [
                "url": url,
                "bytes": bytes,
                "contentLength": contentLength
            ])
        }

        do {
            try implementation.downloadFile(call: call, emitter: progressEmitter, config: bridge?.config)
        } catch let error {
            call.reject(error.localizedDescription)
        }
    }

    /**
     * Helper for handling errors
     */
    private func handleError(_ call: CAPPluginCall, _ message: String, _ error: Error? = nil) {
        call.reject(message, nil, error)
    }

}
