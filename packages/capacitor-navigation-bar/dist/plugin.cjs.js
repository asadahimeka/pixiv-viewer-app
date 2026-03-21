'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var core = require('@capacitor/core');

exports.NavigationBarPluginEvents = void 0;
(function (NavigationBarPluginEvents) {
    /**
     * Called after the navigation bar is displayed
     */
    NavigationBarPluginEvents["SHOW"] = "onShow";
    /**
     * Called after navigation bar is hidden
     */
    NavigationBarPluginEvents["HIDE"] = "onHide";
    /**
     * Called after navigation bar color is changed
     */
    NavigationBarPluginEvents["COLOR_CHANGE"] = "onColorChange";
})(exports.NavigationBarPluginEvents || (exports.NavigationBarPluginEvents = {}));

const NavigationBar = core.registerPlugin('NavigationBar', {
    web: () => Promise.resolve().then(function () { return web; }).then(m => new m.NavigationBarWeb()),
});

class NavigationBarWeb extends core.WebPlugin {
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

var web = /*#__PURE__*/Object.freeze({
    __proto__: null,
    NavigationBarWeb: NavigationBarWeb
});

exports.NavigationBar = NavigationBar;
//# sourceMappingURL=plugin.cjs.js.map
