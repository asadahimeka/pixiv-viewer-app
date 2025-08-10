<template>
  <div class="setting-page">
    <top-bar id="top-bar-wrap" />
    <h3 class="af_title">{{ $t('about.title') }}</h3>
    <van-cell-group :title="$t('about.about_site')">
      <van-cell center :title="$t('about.version')" clickable :label="ver" />
      <template v-if="platform.isCapacitor">
        <van-cell v-if="appInfo.version" center :title="'APP '+$t('about.version')" clickable :label="`${appInfo.version}(${appInfo.build})`" />
        <van-cell v-if="wvVersion" center :title="'Webview '+$t('about.version')" clickable :label="wvVersion" />
      </template>
      <van-cell center :title="$t('about.disclaimer')" is-link :label="$t('tips.click_view')" to="/setting/about/disclaimer" />
      <van-cell center :title="$t('setting.check_update')" label="Github Release" clickable @click="openGithubRelease" />
      <van-cell
        center
        title="Github"
        is-link
        :label="$t('BTQ4EAQMdeN-0ZdoU8ZsP')"
        @click="openLink('https://github.com/asadahimeka/pixiv-viewer-app')"
      />
      <van-cell center :title="$t('QV1uifvU3RRNg7roth-8s')" is-link :label="$t('tips.click_view')" to="/setting/about/faq" />
    </van-cell-group>
    <van-cell-group :title="$t('about.credits')">
      <van-cell
        center
        title="@journey-ad"
        is-link
        :label="$t('VISKhjE86qDcIl_XXpx1q')"
        @click="openLink('https://github.com/journey-ad')"
      />
      <van-cell
        center
        title="HibiAPI"
        is-link
        :label="$t('44eCE1yMuhnfx93siUVJ8')"
        @click="openLink('https://github.com/mixmoe/HibiAPI')"
      />
      <van-cell
        center
        title="PixivNow"
        is-link
        :label="$t('OcYnjztb0HpfzH4xK-2f4')"
        @click="openLink('https://github.com/FreeNowOrg/PixivNow')"
      />
      <van-cell
        center
        title="Pixiv.cat"
        is-link
        :label="$t('R7wR59U5tm8NR3Gn1FKAw')"
        @click="openLink('https://pixiv.re')"
      />
      <van-cell
        center
        title="@Blueberryy"
        is-link
        :label="$t('PtZhgMV8k86Gmg96kKTCA')"
        @click="openLink('https://github.com/Blueberryy')"
      />
      <van-cell
        center
        title="@olivertzeng"
        is-link
        :label="$t('FyTTJetQW2e3wVs2sOjif')"
        @click="openLink('https://github.com/olivertzeng')"
      />
      <van-cell
        center
        title="pxder"
        is-link
        :label="$t('tQaYxaOwYjOgf1OAnQm4J')"
        @click="openLink('https://github.com/Tsuk1ko/pxder')"
      />
      <van-cell
        center
        title="PixEz"
        is-link
        :label="$t('tQaYxaOwYjOgf1OAnQm4J')"
        @click="openLink('https://github.com/Notsfsssf/pixez-flutter')"
      />
      <van-cell
        center
        title="pixivpy-async"
        is-link
        :label="$t('tQaYxaOwYjOgf1OAnQm4J')"
        @click="openLink('https://github.com/Mikubill/pixivpy-async')"
      />
    </van-cell-group>
    <van-cell-group :title="$t('about.feedback')">
      <van-cell
        center
        :title="$t('cIyLKP7_S_Wo0Y0908dnm')"
        is-link
        label="Github:asadahimeka/pixiv-viewer"
        @click="openLink('https://github.com/asadahimeka/pixiv-viewer/discussions')"
      />
      <van-cell
        center
        :title="$t('TnXv_wGi3BhyVLjxBYf1u')"
        is-link
        label="Github:asadahimeka/pixiv-viewer"
        @click="openLink('https://github.com/asadahimeka/pixiv-viewer/issues')"
      />
      <van-cell
        center
        :title="$t('VhMNSWrg03-_ryN7nRBJ3')"
        is-link
        :label="$t('9H-9VJU67Fuabl8OgbhOr')"
        @click="openLink('https://www.nanoka.top/say/pxve_comments.html')"
      />
    </van-cell-group>
  </div>
</template>

<script>
import { Dialog } from 'vant'
import { CURRENT_APP_VERSION } from '@/consts'
import platform from '@/platform'

export default {
  name: 'SettingAbout',
  data() {
    return {
      platform,
      ver: CURRENT_APP_VERSION,
      wvVersion: '',
      appInfo: {},
    }
  },
  head() {
    return { title: this.$t('about.title') }
  },
  async created() {
    if (platform.isCapacitor) {
      const { getDeviceInfo, getAppInfo } = await import('@/platform/capacitor/version')
      this.wvVersion = (await getDeviceInfo()).webViewVersion
      this.appInfo = await getAppInfo()
    }
    this.checkUpdate()
  },
  methods: {
    openLink(link) {
      window.umami?.track('open_link', { link: link.replace('https://', '') })
      window.open(link, '_blank', 'noopener noreferrer')
    },
    openGithubRelease() {
      window.umami?.track('Check Update')
      window.open('https://github.com/asadahimeka/pixiv-viewer/releases', '_blank', 'noopener noreferrer')
    },
    async checkUpdate() {
      const resp = await fetch('https://pxve-notice.nanoka.top/version.json')
      const json = await resp.json()
      const latest = json[platform.current]
      if (latest && latest != CURRENT_APP_VERSION) {
        const res = await Dialog.confirm({ message: this.$t('JKCgrgXZfg4-HDftheb96') }).catch(() => {})
        if (res != 'confirm') return
        this.openGithubRelease()
      }
    },
  },
}
</script>

<style lang="stylus" scoped>

</style>
