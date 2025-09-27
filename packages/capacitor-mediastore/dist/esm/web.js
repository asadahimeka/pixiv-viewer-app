import { WebPlugin } from '@capacitor/core';
export class MediastoreWeb extends WebPlugin {
    async savePicture(options) {
        return new Promise((resolve, reject) => {
            void options;
            void resolve;
            reject('web is not supported');
        });
    }
    async saveToDownloads(options) {
        return new Promise((resolve, reject) => {
            void options;
            void resolve;
            reject('web is not supported');
        });
    }
    async saveVideo(options) {
        return new Promise((resolve, reject) => {
            void options;
            void resolve;
            reject('web is not supported');
        });
    }
}
//# sourceMappingURL=web.js.map