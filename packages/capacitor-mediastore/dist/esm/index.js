import { registerPlugin } from '@capacitor/core';
const Mediastore = registerPlugin('Mediastore', {
    web: () => import('./web').then(m => new m.MediastoreWeb()),
});
export * from './definitions';
export { Mediastore };
//# sourceMappingURL=index.js.map