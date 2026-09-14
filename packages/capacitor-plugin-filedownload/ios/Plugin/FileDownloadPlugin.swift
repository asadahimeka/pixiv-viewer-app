import Foundation
import Capacitor
import Alamofire
import CoreTelephony

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitorjs.com/docs/plugins/ios
 */
@objc(FileDownloadPlugin)
public class FileDownloadPlugin: CAPPlugin {
    /**
     * 单个下载任务的状态。不能用插件实例字段保存 call/重试次数等，
     * 否则并发下载时后一个任务会覆盖前一个，导致先发起任务的回调丢失（Promise 永远挂起）。
     */
    final class DownloadTask {
        let call: CAPPluginCall
        let url: String
        let fileName: String
        var fileUrl: URL?
        var reTryCount = 0
        var settled = false

        init(call: CAPPluginCall, url: String, fileName: String) {
            self.call = call
            self.url = url
            self.fileName = fileName
        }
    }

    // 保持任务存活直到下载结束
    var activeTasks: [DownloadTask] = []

    @objc func download(_ call: CAPPluginCall) {
        let url = call.getString("uri") ?? ""
        let fileName = call.getString("fileName") ?? ""
        let task = DownloadTask(call: call, url: url, fileName: fileName)
        activeTasks.append(task)
        handlerDownload(task)
    }

    func handlerDownload(_ task: DownloadTask) {
        let destination: DownloadRequest.Destination = { _, _ in
            let documentsUrl = FileManager.default.urls(for: .documentDirectory, in: FileManager.SearchPathDomainMask.userDomainMask).first
            let fileUrl = documentsUrl?.appendingPathComponent(task.fileName)
                ?? URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(task.fileName)
            task.fileUrl = fileUrl

            return (fileUrl, [.removePreviousFile, .createIntermediateDirectories])
        }
        AF.download(task.url, to: destination)
            .downloadProgress { [weak self] progress in
                self?.notifyListeners("downloadProgress", data: ["progress": progress.fractionCompleted])
            }
            .responseData { [weak self] response in
                self?.downloadResponse(task, response: response)
            }
    }

    //根据下载状态处理
    func downloadResponse(_ task: DownloadTask, response: AFDownloadResponse<Data>) {
        switch response.result {
        case .success:
            var data = JSObject()
            data["path"] = task.fileUrl?.absoluteString ?? ""
            task.reTryCount = 0
            finish(task) { call in
                call.resolve(data)
            }
        case .failure:
            //重试期间不结束回调，重试次数用尽才 reject，避免对同一个 call 先 reject 再 resolve 的 double-settle
            if task.reTryCount < 3 {
                task.reTryCount += 1
                handlerDownload(task)
                return
            }
            finish(task) { call in
                call.reject("下载失败！")
            }
        }
    }

    //结束任务：保证 call 只被 settle 一次，并从存活列表移除
    func finish(_ task: DownloadTask, settle: (CAPPluginCall) -> Void) {
        guard !task.settled else { return }
        task.settled = true
        activeTasks.removeAll { $0 === task }
        settle(task.call)
    }
}
