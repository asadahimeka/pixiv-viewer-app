var capacitorMediastore = (function (exports, core) {
    'use strict';

    const Mediastore = core.registerPlugin('Mediastore', {
        web: () => Promise.resolve().then(function () { return web; }).then(m => new m.MediastoreWeb()),
    });

    class MediastoreWeb extends core.WebPlugin {
        async savePicture(options) {
            return new Promise((resolve, reject) => {
                reject('web is not supported');
            });
        }
        async saveToDownloads(options) {
            return new Promise((resolve, reject) => {
                reject('web is not supported');
            });
        }
        async saveVideo(options) {
            return new Promise((resolve, reject) => {
                reject('web is not supported');
            });
        }
    }

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        MediastoreWeb: MediastoreWeb
    });

    exports.Mediastore = Mediastore;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
