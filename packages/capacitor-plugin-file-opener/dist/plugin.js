var capacitorFileOpener = (function (exports, core) {
    'use strict';

    const FileOpener = core.registerPlugin('FileOpener', {
        web: () => Promise.resolve().then(function () { return web; }).then(m => new m.FileOpenerWeb()),
    });

    class FileOpenerWeb extends core.WebPlugin {
        open(options) {
            console.log('open', options);
            throw this.unimplemented('Not implemented on web.');
        }
    }

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        FileOpenerWeb: FileOpenerWeb
    });

    exports.FileOpener = FileOpener;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
