import Foundation
import Capacitor
import GCDWebServer

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitor.ionicframework.com/docs/plugins/ios
 */
@objc(BlobWriter)
public class BlobWriter: CAPPlugin {
  private var _server: GCDWebServer? = nil
  
  // Basic auth constants
  private let _authPassword = UUID().uuidString
  private let _authUser = "app"
  
  @objc public override func load() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(startServer),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    if UIApplication.shared.applicationState == .active {
      startServer()
    }
  }

  @objc private func startServer() {
    if _server != nil {
      // already started
      return
    }

    // listen for errors only
    GCDWebServer.setLogLevel(4)
    
    // find an available port and listen on it
    var retriesLeft = 5;
    while(_server == nil && retriesLeft > 0) {
      let server = GCDWebServer()
      
      server.addDefaultHandler(forMethod: "OPTIONS", request: GCDWebServerRequest.self, processBlock: {request in
        return self.emptyCorsResponse(statusCode: 200, request: request)
      })
      
      server.addDefaultHandler(forMethod: "PUT", request: GCDWebServerFileRequest.self, processBlock: {request in
        // unfortunately, we only check Authorization once the request has been
        // written to disk, which is somewhat insecure (although the file will be
        // deleted almost immediately)
        //
        // When https://github.com/swisspol/GCDWebServer/issues/479 is fixed, we
        // should use GCDWebServer's built in Basic auth functionality (commented
        // out)
        if (request.headers["Authorization"] != self._authPassword) {
          return self.emptyCorsResponse(statusCode: 401, request: request)
        }
        
        let fileRequest = request as! GCDWebServerFileRequest
        let src = URL(fileURLWithPath: fileRequest.temporaryPath)
        let dest = URL(fileURLWithPath: fileRequest.path)

        // move file into place
        do {
          // remove file if it exists
          try? FileManager.default.removeItem(at: dest)

          // create intermediate directories
          if (request.query?["recursive"] == "true") {
            let destDir = dest.deletingLastPathComponent()

            try FileManager.default.createDirectory(
              at: destDir,
              withIntermediateDirectories: true,
              attributes: nil
            )
          }

          try FileManager.default.moveItem(at: src, to: dest)
        } catch {
          CAPLog.print("BlobWriter failed to move temp file into place", error)
          return self.emptyCorsResponse(statusCode: 500, request: request)
        }

        return self.emptyCorsResponse(statusCode: 204, request: request)
      })
      // select a random, private port
      let port = UInt.random(in: 49151..<65536)
      
      do {
        try server.start(options: [
          GCDWebServerOption_Port: port,
          GCDWebServerOption_BindToLocalhost: true,
          GCDWebServerOption_AutomaticallySuspendInBackground: true,

          // unfortunately, Basic auth breaks CORS
          // pending https://github.com/swisspol/GCDWebServer/issues/479
//          GCDWebServerOption_AuthenticationMethod: GCDWebServerAuthenticationMethod_Basic,
//          GCDWebServerOption_AuthenticationAccounts: [_authUser: _authPassword]
        ])
        
        // success
        if (server.serverURL != nil) {
          CAPLog.print("BlobWriter listening at \(server.serverURL!.absoluteString)")
          _server = server
          break
        } else {
          CAPLog.print("BlobWriter failed to start on port \(port)")
        }
      } catch {
        CAPLog.print("BlobWriter failed to start on port \(port)", error)
      }
      
      retriesLeft -= 1
    }
  }
  
  @objc func get_config(_ call: CAPPluginCall) {
    if (_server?.serverURL != nil && _server!.isRunning) {
      var baseUrl = _server!.serverURL!.absoluteString
      
      if baseUrl.last == "/" {
        baseUrl = String(baseUrl.dropLast())
      }
      
      // generate Authorization header
      // pending https://github.com/swisspol/GCDWebServer/issues/479
//      let basicValue = "\(_authUser):\(_authPassword)"
//      let basicBase64 = Data(basicValue.utf8).base64EncodedString()
//      let authToken = "Basic \(basicBase64)"
      let authToken = _authPassword
      
      call.resolve([
        "base_url": baseUrl,
        "auth_token": authToken
      ])
    } else {
      call.reject("BlobWriter server not running", "server_down")
    }
  }
  
  private func emptyCorsResponse(
    statusCode: Int,
    request: GCDWebServerRequest
  ) -> GCDWebServerResponse {
    let response = GCDWebServerResponse(statusCode: statusCode)
    let origin = request.headers["Origin"]
    
    if (origin != nil) {
      response.setValue(
        origin,
        forAdditionalHeader: "Access-Control-Allow-Origin"
      )
      
      response.setValue(
        "GET, POST, PUT, HEAD, OPTIONS",
        forAdditionalHeader: "Access-Control-Allow-Methods"
      )
      
      let requestHeaders = request.headers["Access-Control-Request-Headers"]
      if (requestHeaders != nil) {
        response.setValue(
          requestHeaders,
          forAdditionalHeader: "Access-Control-Allow-Headers"
        )
      }
    }
    
    return response
  }
}
