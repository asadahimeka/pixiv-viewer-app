import { WebPlugin } from '@capacitor/core';
import type { NavigationBarPlugin } from './definitions';
export declare class NavigationBarWeb extends WebPlugin implements NavigationBarPlugin {
    show(): Promise<void>;
    hide(): Promise<void>;
    setColor(options: {
        color: string;
        darkButtons?: boolean;
    }): Promise<void>;
    setTransparency(options: {
        isTransparent: boolean;
    }): Promise<void>;
    getColor(): Promise<{
        color: string;
    }>;
}
