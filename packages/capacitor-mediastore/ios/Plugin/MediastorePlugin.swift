import Foundation
import Capacitor

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitorjs.com/docs/plugins/ios
 */
@objc(MediastorePlugin)
public class MediastorePlugin: CAPPlugin {
    private let implementation = Mediastore()

    @objc func savePicture(_ call: CAPPluginCall) {
        call.reject("iOS is not supported");
    }

    @objc func saveToDownloads(_ call: CAPPluginCall) {
        call.reject("iOS is not supported");
    }

    @objc func saveVideo(_ call: CAPPluginCall) {
        call.reject("iOS is not supported");
    }
}
