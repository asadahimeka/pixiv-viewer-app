import Foundation
import Capacitor
import QuickLook

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitorjs.com/docs/plugins/ios
 */
@objc(FileOpenerPlugin)
public class FileOpenerPlugin: CAPPlugin {
    lazy var fileURL = NSURL()

    @objc func open(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        //let mime = call.getString("mime") ?? "" // Not used on IOS

        self.fileURL = NSURL(string:path)!;

        if !FileManager.default.fileExists(atPath: fileURL.path!) {
            call.reject("File not found")

            return;
        }

        DispatchQueue.main.async(execute: {
            let previewController = QLPreviewController();
            previewController.dataSource = self;
            previewController.delegate = self;

            self.bridge!.viewController!.present(previewController, animated: true, completion: nil);

            if self.bridge!.viewController!.isViewLoaded {
                call.resolve()
            } else{
                call.reject("Failed")
            }
        });
    }
}

extension FileOpenerPlugin: QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return 1
    }

    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return self.fileURL as QLPreviewItem
    }
}
