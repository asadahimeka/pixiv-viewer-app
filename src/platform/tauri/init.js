import '@/lib/vant-style'
import 'swiper/css/swiper.css'
import '@/assets/style/base.styl'
import '@/assets/style/theme.styl'
import '@/assets/style/theme-bg.styl'
import '@/assets/style/vta.css'
import '@vant/touch-emulator'
import './polyfill'

import { listen } from '@tauri-apps/api/event'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'

import Vue from 'vue'
import VueAwesomeSwiper from 'vue-awesome-swiper'
import { Dialog, Lazyload, Toast } from 'vant'

import setupVant from '@/lib/vant'
import SvgIcon, { loadingSvg } from '@/icons'
import VueMasonry from '@/components/VueMasonryCss'
import ImageLayout from '@/components/ImageLayout.vue'
import TopBar from '@/components/TopBar.vue'
import Pximg from '@/components/DirectPximg.vue'
import App from '@/App.vue'
import router from '@/router'
import store from '@/store'
import longpress from '@/directives/longpress'
import { i18n, initLocale } from '@/i18n'
import { getActionMap, setPximgIP } from '@/api/client/action'
import { LocalStorage } from '@/utils/storage'
import { loadCustomFont } from '@/utils/font'
import { initBookmarkCache } from '@/utils/storage/siteCache'
import { login } from '@/api/client/login'

addTauriListener()
addErrorListener()
setupApp()

async function setupApp() {
  const isPersisted = await navigator.storage?.persisted?.().catch(() => false)
  if (!isPersisted) await navigator.storage?.persist?.().catch(() => {})
  await setPximgIP()
  await initSetting()
  await initLocale()
  await initLocalApi()

  setupVant()
  Vue.use(Toast)
  if (store.state.appSetting.isImgLazy) {
    Vue.use(Lazyload, {
      observer: store.state.appSetting.isImgLazyOb,
      observerOptions: { rootMargin: '0px 50px 50px 0px', threshold: [0] },
      lazyComponent: false,
      loading: loadingSvg(localStorage.PXV_ACT_COLOR || '#38a9f5'),
      preload: 1.3,
    })
  }

  Vue.use(VueAwesomeSwiper)
  Vue.use(VueMasonry)
  Vue.use(SvgIcon)
  Vue.use(longpress)

  Vue.component('WfCont', ImageLayout)
  Vue.component('TopBar', TopBar)
  Vue.component('Pximg', Pximg)

  Vue.config.productionTip = false

  new Vue({
    router,
    store,
    i18n,
    render: h => h(App),
  }).$mount('#app')
}

async function initLocalApi() {
  const config = LocalStorage.get('PXV_CLIENT_CONFIG', {})
  window.APP_CONFIG = config
  if (!config.useLocalAppApi) return
  document.querySelector('#ldio-loading .ldio-content')?.insertAdjacentHTML('beforeend', `<p class="ldio-title" style="top:180px;font-size:14px">${i18n.t('hyCctySRvfcddmi6nVh9b')}</p>`)
  window.__localApiMap__ = await getActionMap()
  await initBookmarkCache()
}

async function initSetting() {
  const { pageTransition, withBodyBg, pageFont } = store.state.appSetting
  if (pageFont) loadCustomFont(pageFont)
  if (pageTransition) document.documentElement.classList.add(pageTransition)
  if (withBodyBg) document.documentElement.classList.add('with-body-bg')
}

function addTauriListener() {
  onOpenUrl(async ([url]) => {
    console.log('deep link:', url)
    if (url.startsWith('pixiv://users')) {
      url = url.replace('pixiv:/', '')
    }
    if (url.startsWith('pixiv://illusts')) {
      url = url.replace('pixiv://illusts', '/artworks')
    }
    if (url.startsWith('pixiv://novels')) {
      url = url.replace('pixiv://novels', '/novel')
    }
    if (url.startsWith('/')) {
      router.push(url)
      return
    }

    const code = new URL(url).searchParams.get('code')
    if (!code) return

    try {
      await login(code, LocalStorage.get('PXV_LOGIN_CODEV'))
      window.umami?.track('OAuth Login Success')
      Toast.success(i18n.t('login.succ_tip'))
      setTimeout(() => {
        location.replace('/')
      }, 200)
    } catch (err) {
      alert(`Login Error: ${err?.message || JSON.stringify(err)}'`)
      Dialog.alert({ message: i18n.t('login.fail_tip') })
    }
  })

  listen('download_file_progress', evt => {
    const { current, total } = evt.payload
    Toast.clear()
    Toast(`${i18n.t('tip.downloading')}: ${(current / total * 100).toFixed(0)}%`)
  })
}

function addErrorListener() {
  Vue.config.errorHandler = function (err, vm, info) {
    window.umami?.track('vue_error', {
      err: `Error: ${err.toString()}\nInfo: ${info}\nDescription: ${vm.description}\nTag: ${vm.$vnode.tag}`,
    })
  }
  window.onerror = function (ev, source, lineno, colno, error) {
    window.umami?.track('global_error', { err: `${ev} ${error}: ${source} ${lineno}:${colno}` })
  }
  listen('error', event => {
    window.umami?.track('Got error in window', { windowLabel: event.windowLabel, payload: event.payload })
  })
}
