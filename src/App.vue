<template>
  <div id="app">
    <Preload />
    <div v-if="platform.isCapacitor" id="nav-bar-overlay"></div>
    <router-view />
    <FpsDemo v-if="showFpsDemo" />
  </div>
</template>

<script>
import Preload from './components/Preload.vue'
import FpsDemo from './components/FpsDemo.vue'
import platform from '@/platform'
import store from '@/store'
import { checkIsLogin } from '@/store/actions/check-login'
import { fetchNotices } from '@/store/actions/fetch-notice'
import { loadKISSTranslator } from './utils/translate'

export default {
  name: 'App',
  components: { Preload, FpsDemo },
  data: () => ({ platform }),
  computed: {
    showFpsDemo() {
      return store.state.appSetting.showFpsDemo
    },
  },
  beforeCreate() {
    if (location.pathname != '/') return
    if (sessionStorage.getItem('PXV_WELCOME_PAGE_DONE')) return
    const { appStartPage } = store.state.appSetting
    if (appStartPage) {
      sessionStorage.setItem('PXV_WELCOME_PAGE_DONE', '1')
      this.$router.replace(appStartPage)
    }
  },
  async created() {
    checkIsLogin()
    fetchNotices()
  },
  async mounted() {
    document.querySelector('#ldio-loading')?.remove()
    if (store.state.appSetting.isAutoLoadKissT) loadKISSTranslator(true)
    if (platform.isCapacitor) (await import('@/platform/capacitor/mounted')).onMounted()
    if (platform.isTauri) (await import('@/platform/tauri/mounted')).onMounted()
  },
}
</script>

<style>
html.tauri {
  --status-bar-height: 0PX !important;
  --nav-bar-height: 0PX !important;
}
.with-body-bg.custom_theme body:not(.dark) .shrink::after {
  --color: color-mix(in srgb, var(--accent-color), white 90%);
  background: linear-gradient(to top, var(--color), rgba(255, 255, 255, 0));
}
.with-body-bg.custom_theme body:not(.dark) .novel .artwork-meta .shrink::after {
  background: linear-gradient(to top, #fff, rgba(255, 255, 255, 0));
}
.with-body-bg body:not(.dark) .image-view.shrink {
  max-height: 95vh;
}
@media screen and (max-width: 600px) {
  .with-body-bg body:not(.dark) .image-view.shrink{
    max-height: 13rem;
  }
}
</style>
<style lang="stylus">
html,body
  width 100%;
  // height 100%

#app
  -webkit-font-smoothing antialiased
  -moz-osx-font-smoothing grayscale
  // max-width 750px
  width 100%
  // height 100%
  margin 0 auto

#nprogress
  .bar
    background-color: rgb(253, 186, 47)
  .spinner
    display none

.Home
  padding-top 1.2rem
  .com_sel_tabs
    position fixed
    z-index 9
    left 50%
    transform translateX(-50%)
    top calc(0.3rem + var(--status-bar-height))
    width 100vw
    margin-bottom 0
    padding-top 0
    padding-bottom 0.3rem
    // background: white
    background: rgba(255,255,255,0.8)
    backdrop-filter: saturate(200%) blur(10PX)
    .home-title
      position absolute
      top calc(50% + var(--status-bar-height) / 2)
      left 6vw
      transform translateY(-50%)
      display flex
      align-items center
    .app-logo,.home-search
      height 0.8rem
    .sel-tabs .com_sel_tab
      height 0.7rem
      margin-right 0.18rem
      padding 0 0.2rem
      font-size 0.35rem
    .home-search
      position absolute
      top calc(50% + var(--status-bar-height) / 2)
      left 50%
      transform translate(-50%, -50%)
      display flex
      align-items center
      .van-search
        width 25vw
        padding 0
        background transparent
    .app-title
      margin-left 10px
      padding-top 5px
      font-size 36px
      font-family "Lucida Handwriting", "Georgia Pro", Georgia, "Times New Roman", serif
      font-weight bold

@media screen and (max-width: 999px)
  .Home .home-i-tabs
    justify-content flex-end
    padding-right 0.3rem !important
    .home-search
      display none

@media screen and (max-width: 600px)
  .Home .home-i-tabs
    .app-title
      display none

@media screen and (min-width: 1000px)
  #app
    .Home
      padding-top 1.4rem
      .home-i-tabs
        justify-content flex-end
        align-items center
        padding-left 6vw
        padding-right 6vw

@media screen and (min-width: 1120px)
  #app
    .app-main
      padding-left 1.4rem !important
      padding-right 0.2rem !important
    .app-main:has(.user-container)
      padding-left 1.2rem
      padding-right 0
      .user-tabs
        padding-left 0.2rem
        padding-right 0.2rem
    .top-bar-wrap
      left 1.2rem
    .rank,.search
      padding-left 0.18rem
      padding-right 0.18rem
    .rank .top
      padding-left 1.7rem
    .search
      .search-bar-wrap
        padding-left 1.4rem
        padding-right 0.2rem
        box-sizing border-box
        .search-bar
          width 100%
        .search-bar-word
          left 2.5rem
      .search_params,
      .search-dropdown
          left 1.2rem
          width calc(100% - 1.2rem)
      .search-history
        padding-left 0.4rem
        padding-right 0.4rem
      .pid-n-uid
        padding-left 0.2rem
        padding-right 0.2rem
      .image-search
        right 0.9rem
        .container
          left 1.4rem
          width: calc(100vw - 1.5rem)
      .search_param_sel
        margin-top .3rem
        .van-dropdown-menu__bar
          border-radius 10px
        .van-dropdown-item
          left 1.6rem
          width calc(100% - 2rem)
    .Home .com_sel_tabs,
    .search .com_sel_tabs
      padding-left 1.2rem
    .Home .com_sel_tabs .home-title
      left: 2rem
    .Following
      padding-left 0.2rem
      padding-right 0.2rem
      .van-sticky--fixed
        padding-left 1.2rem
    .nav-container
      display block !important
      top 0
      left 0
      right unset
      z-index 999
      width 1.2rem
      height 100vh
      opacity 1
      transform: translate(0, 0) !important;
    .nav-bar
      flex-direction: column
      justify-content: center
      align-items: center
      border-radius: 0;
      li
        width 100%
        margin 0
        &:not(:last-child)
          margin-bottom 30px
        &.nav_to_top
          display list-item
        .icon
          margin-bottom 4px
          font-size 0.55rem
        span
          font-size 0.26rem
          word-break: break-all
  .custom_theme #app
    .search_param_sel
      margin-top 0
      .van-dropdown-menu__bar
        border-radius 0

html:not([lang^=zh])
  @media screen and (max-width: 1200px)
    .Home .home-search
      display none
  @media screen and (max-width: 786px)
    .Home .home-i-tabs
      .app-title
        display none
</style>
