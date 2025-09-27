import { registerPlugin } from '@capacitor/core';
const FileOpener = registerPlugin('FileOpener', {
    web: () => import('./web').then(m => new m.FileOpenerWeb()),
});
export * from './definitions';
export { FileOpener };
//# sourceMappingURL=index.js.map