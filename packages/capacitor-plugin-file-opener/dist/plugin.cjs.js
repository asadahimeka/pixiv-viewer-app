'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var core = require('@capacitor/core');

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
//# sourceMappingURL=plugin.cjs.js.map
