import { registerPlugin } from '@capacitor/core';
const PixivCronet = registerPlugin('PixivCronet', {
    web: () => import('./web').then(m => new m.PixivCronetWeb()),
});
export * from './definitions';
export { PixivCronet };
//# sourceMappingURL=index.js.map