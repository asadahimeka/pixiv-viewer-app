import { CURRENT_APP_VERSION } from '@/consts'
import { App } from '@capacitor/app'
import { Device } from '@capacitor/device'

export const CURRENT_WEB_VERSION = CURRENT_APP_VERSION

/** @type {import('@capacitor/app').AppInfo} */
let appInfo = null
export async function getAppInfo() {
  if (!appInfo) appInfo = await App.getInfo().catch(() => ({}))
  return appInfo
}

/** @type {import('@capacitor/device').DeviceInfo} */
let deviceInfo = null
export async function getDeviceInfo() {
  if (!deviceInfo) deviceInfo = await Device.getInfo().catch(() => ({}))
  return deviceInfo
}
