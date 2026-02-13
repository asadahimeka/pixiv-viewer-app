import { CURRENT_WEB_VERSION, getAppInfo, getDeviceInfo } from './version'
import { trackEvent } from '@/utils'

export async function onMounted() {
  const appInfo = await getAppInfo()
  const deviceInfo = await getDeviceInfo()
  trackEvent('Capacitor App Mounted', {
    webVer: CURRENT_WEB_VERSION,
    appVer: `${appInfo.version}(${appInfo.build})`,
    webViewVersion: deviceInfo.webViewVersion,
    os: deviceInfo.platform + '_' + deviceInfo.osVersion,
    brand: deviceInfo.manufacturer,
    model: deviceInfo.manufacturer + '_' + deviceInfo.model,
  })
}
