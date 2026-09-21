import { registerPlugin } from '@capacitor/core';
const PixivLoginProxy = registerPlugin('PixivLoginProxy', {
    web: () => import('./web').then(m => new m.PixivLoginProxyWeb()),
});
export * from './definitions';
export { PixivLoginProxy };
//# sourceMappingURL=index.js.map
