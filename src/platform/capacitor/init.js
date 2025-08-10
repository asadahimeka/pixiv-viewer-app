import '@/lib/vant-style'
import 'swiper/css/swiper.css'
import '@/assets/style/base.styl'
import '@/assets/style/theme.styl'
import '@/assets/style/theme-bg.styl'
import '@/assets/style/vta.css'
import '@/lib/polyfill'

import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar'
import { AndroidShortcuts } from 'capacitor-android-shortcuts'
import { NavigationBar } from '@capgo/capacitor-navigation-bar'
import { SafeArea } from 'capacitor-plugin-safe-area'

import Vue from 'vue'
import VueAwesomeSwiper from 'vue-awesome-swiper'
import { Dialog, Lazyload, Toast } from 'vant'

import setupVant from '@/lib/vant'
import SvgIcon, { loadingSvg } from '@/icons'
import VueMasonry from '@/components/VueMasonryCss'
import ImageLayout from '@/components/ImageLayout.vue'
import TopBar from '@/components/TopBar.vue'
import Pximg from '@/components/DirectPximg.vue'
import AppComp from '@/App.vue'
import router from '@/router'
import store from '@/store'
import longpress from '@/directives/longpress'
import { i18n, initLocale } from '@/i18n'
import { getActionMap, setPximgIP } from '@/api/client/action'
import { LocalStorage } from '@/utils/storage'
import { loadCustomFont } from '@/utils/font'
import { initBookmarkCache } from '@/utils/storage/siteCache'
import { login } from '@/api/client/login'
import { trackEvent } from '@/utils'
import platform from '..'

setStatusBar()
setSafeAreaVar()
addCapListeners()
addErrorListener()
setupApp()

async function setupApp() {
  const isPersisted = await navigator.storage?.persisted?.().catch(() => false)
  if (!isPersisted) await navigator.storage?.persist?.().catch(() => {})
  await setPximgIP()
  await initSetting()
  await initLocale()
  await initLocalApi()
  setShortcuts()

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
    render: h => h(AppComp),
  }).$mount('#app')
}

async function initLocalApi() {
  const config = LocalStorage.get('PXV_CLIENT_CONFIG', {})
  window.APP_CONFIG = config
  if (!config.useLocalAppApi) return
  document.querySelector('#ldio-loading .ldio-content')?.insertAdjacentHTML('beforeend', `<p class="ldio-title" style="top:180px;font-size:14px">${i18n.t('hyCctySRvfcddmi6nVh9b')}</p>`)
  window.__localApiMap__ = await getActionMap()
  await initBookmarkCache()
  window.umami?.track('initLocalApi')
}

async function initSetting() {
  const { pageTransition, withBodyBg, pageFont } = store.state.appSetting
  if (pageFont) loadCustomFont(pageFont)
  if (pageTransition) document.documentElement.classList.add(pageTransition)
  if (withBodyBg) document.documentElement.classList.add('with-body-bg')
}

function addErrorListener() {
  Vue.config.errorHandler = function (err, vm, info) {
    trackEvent('vue_error', {
      err: `Error: ${err.toString()}\nInfo: ${info}\nDescription: ${vm.description}\nTag: ${vm.$vnode.tag}`,
    })
  }
  window.onerror = function (ev, source, lineno, colno, error) {
    trackEvent('global_error', { err: `${ev} ${error}: ${source} ${lineno}:${colno}` })
  }
}

function setSafeAreaVar() {
  SafeArea.getSafeAreaInsets().then(({ insets }) => {
    console.log('insets: ', insets)
    document.documentElement.style.setProperty('--safe-area-top', `${insets.top}px`)
    document.documentElement.style.setProperty('--safe-area-bottom', `${insets.bottom}px`)
  }).catch(() => {})
}

function setStatusBar() {
  if (platform.isIOS) {
    StatusBar.setStyle({ style: localStorage.PXV_DARK ? StatusBarStyle.Dark : StatusBarStyle.Light }).catch(() => {})
    return
  }
  const color = localStorage.PXV_DARK ? '#16161A' : '#FFFFFF'
  StatusBar.setStyle({ style: localStorage.PXV_DARK ? StatusBarStyle.Dark : StatusBarStyle.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color }).catch(() => {})
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
  NavigationBar.setNavigationBarColor({ color }).catch(() => {})
}

function addCapListeners() {
  CapApp.addListener('backButton', ev => {
    if (!ev.canGoBack || history.length <= 1) {
      CapApp.exitApp()
    } else if (document.querySelector('.comments-popup .comments-area')) {
      document.querySelector('.comments-popup .van-popup__close-icon')?.click()
    } else if (document.querySelector('.fancybox__container')) {
      document.querySelector('.fancybox__container .f-button[data-fancybox-close]')?.click()
    } else {
      router.back()
    }
  })

  CapApp.addListener('appUrlOpen', async ({ url }) => {
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
      trackEvent('OAuth Login Success')
      Toast.success(i18n.t('login.succ_tip'))
      setTimeout(() => {
        location.replace('/')
      }, 200)
    } catch (err) {
      alert('Login Error: ' + (err?.message || JSON.stringify(err)))
      Dialog.alert({ message: i18n.t('login.fail_tip') })
    }
  })
}

async function setShortcuts() {
  if (!platform.isAndroid) return
  try {
    if (LocalStorage.get('PXV_SHORTCUTS_SET')) {
      AndroidShortcuts.addListener('shortcut', res => {
        const pathMap = {
          Search: '/search',
          Ranking: '/rank',
          Feeds: '/following',
          Setting: '/setting',
        }
        router.push(pathMap[res.data])
      })
      return
    }
    const { result } = await AndroidShortcuts.isDynamicSupported()
    if (!result) return
    AndroidShortcuts.setDynamic({
      items: [
        {
          id: 'search',
          shortLabel: i18n.t('nav.search'),
          longLabel: i18n.t('nav.search'),
          icon: {
            type: 'Bitmap',
            name: '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',
          },
          data: 'Search',
        },
        {
          id: 'ranking',
          shortLabel: i18n.t('nav.rank'),
          longLabel: i18n.t('nav.rank'),
          icon: {
            type: 'Bitmap',
            name: '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',
          },
          data: 'Ranking',
        },
        {
          id: 'feeds',
          shortLabel: i18n.t('nav.follow'),
          longLabel: i18n.t('nav.follow'),
          icon: {
            type: 'Bitmap',
            name: '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',
          },
          data: 'Feeds',
        },
        {
          id: 'setting',
          shortLabel: i18n.t('nav.setting'),
          longLabel: i18n.t('nav.setting'),
          icon: {
            type: 'Bitmap',
            name: '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',
          },
          data: 'Setting',
        },
      ],
    })
    LocalStorage.set('PXV_SHORTCUTS_SET', true)
  } catch (error) {
    console.log('error: ', error)
  }
}
