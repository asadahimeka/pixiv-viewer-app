import { WebPlugin } from '@capacitor/core';
export class NavigationBarWeb extends WebPlugin {
    async show() {
        return new Promise((resolve) => {
            console.log('Navigation Bar Showed!');
            resolve();
        });
    }
    async hide() {
        return new Promise((resolve) => {
            console.log('Navigation Bar Hided!');
            resolve();
        });
    }
    async setColor(options) {
        return new Promise((resolve) => {
            console.log(`Navigation Bar color changed to ${options.color ? options.color : '#FFFFFF'} : Dark Buttons: ${options.darkButtons ? 'YES' : 'NO'}`);
            resolve();
        });
    }
    async setTransparency(options) {
        return new Promise((resolve) => {
            console.log(`Navigation Bar is transparent: ${options.isTransparent ? 'YES' : 'NO'}`);
            resolve();
        });
    }
    async getColor() {
        return new Promise((resolve) => {
            resolve({ color: '#FFFFFF' });
        });
    }
}
//# sourceMappingURL=web.js.map