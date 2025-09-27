import { WebPlugin } from '@capacitor/core';
export class FileOpenerWeb extends WebPlugin {
    open(options) {
        console.log('open', options);
        throw this.unimplemented('Not implemented on web.');
    }
}
//# sourceMappingURL=web.js.map