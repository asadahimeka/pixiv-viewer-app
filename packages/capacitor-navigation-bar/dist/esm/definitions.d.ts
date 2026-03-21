import { PluginListenerHandle } from '@capacitor/core';
import type { NavigationBarPluginEvents } from './navigationbar.events';
export interface NavigationBarPlugin {
    /**
     * Display the navigation bar.
     */
    show(): Promise<void>;
    /**
     * Hide the navigation bar.
     */
    hide(): Promise<void>;
    /**
     * Change the color of the navigation bar.
     * *Support alpha hexadecimal numbers.
     * @param options
     */
    setColor(options: ColorParameters): Promise<void>;
    /**
     * Set the Transparency
     * @param isTransparent
     */
    setTransparency(options: {
        isTransparent: boolean;
    }): Promise<void>;
    /**
     * Gets the current color of the navigation bar in Hexadecimal.
     */
    getColor(): Promise<{
        color: string;
    }>;
    /**
     * Event fired after navigation bar is displayed
     * @param event The event
     * @param listenerFunc Callback
     */
    addListener(event: NavigationBarPluginEvents.SHOW, listenerFunc: () => void): PluginListenerHandle;
    /**
     * Event fired after navigation bar is hidden
     * @param event The event
     * @param listenerFunc Callback
     */
    addListener(event: NavigationBarPluginEvents.HIDE, listenerFunc: () => void): PluginListenerHandle;
    /**
     * Event fired after navigation bar color is changed
     * @param event The event
     * @param listenerFunc Callback
     */
    addListener(event: NavigationBarPluginEvents.COLOR_CHANGE, listenerFunc: (returnObject: {
        color: string;
    }) => void): PluginListenerHandle;
}
export interface ColorParameters {
    /**
     * Sets the new color of the navigation bar.
     */
    color: string;
    /**
     * Sets whether the default navigation bar buttons should be black or white.
     */
    darkButtons?: boolean;
}
