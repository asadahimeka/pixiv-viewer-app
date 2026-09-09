#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BlobWriter, "BlobWriter",
    CAP_PLUGIN_METHOD(get_config, CAPPluginReturnPromise);
)
