<template>
  <div class="setting-page">
    <top-bar id="top-bar-wrap" />
    <h3 class="af_title">{{ $t('user.sess.login') }}</h3>
    <div>
      <van-cell size="large" center :title="$t('hqciRRXfoN19LYLh8xr4D')" is-link @click="openConfirmDialog('showTokenDialog')" />
      <van-cell size="large" center :title="$t('8zJrQTdrphmkCMMgL9SPW')" is-link @click="openConfirmDialog('showConfirmDialog')" />
      <van-cell size="large" center :title="$t('3ZvAP-w7q7teBcLoqOgCc')" is-link to="/account/session" />
    </div>
    <van-dialog
      v-model="showConfirmDialog"
      width="9rem"
      :title="$t('tips.tip')"
      show-cancel-button
      :cancel-button-text="$t('common.cancel')"
      :confirm-button-text="$t('common.confirm')"
      @confirm="openLoginWindow"
    >
      <van-cell>{{ $t('login.o.desc1') }}</van-cell>
    </van-dialog>
    <van-dialog
      v-model="showTokenDialog"
      width="9rem"
      :title="$t('login.t.d3')"
      show-cancel-button
      :cancel-button-text="$t('common.cancel')"
      confirm-button-text="OK"
      @confirm="setLocalHibi"
    >
      <van-cell>{{ $t('login.t.d1') }}</van-cell>
      <van-cell>{{ $t('login.t.d2') }}</van-cell>
      <van-cell><a href="https://www.nanoka.top/posts/e78ef86/" target="_blank">🔗https://www.nanoka.top/posts/e78ef86/</a></van-cell>
      <van-cell><a href="https://github.com/Tsuk1ko/pxder#%E5%87%86%E5%A4%87" target="_blank">🔗https://github.com/Tsuk1ko/pxder</a></van-cell>
      <van-cell><a href="https://github.com/mixmoe/HibiAPI/issues/53" target="_blank">🔗https://github.com/mixmoe/HibiAPI/issues/53</a></van-cell>
      <van-field v-model="appConfig.refreshToken" label="RefreshToken：" label-width="2.75rem" :placeholder="$t('login.t.d3')" />
      <van-cell>
        <div class="flex">
          <span style="margin-right: 0.3rem">{{ $t('setting.other.direct_mode.proxy.title') }}</span>
          <van-switch :value="appConfig.useApiProxy" :disabled="appConfig.directMode" size="24" @change="setUseApiProxy" />
        </div>
      </van-cell>
      <van-cell v-if="platform.isAndroid">
        <div class="flex">
          <span style="margin-right: 0.3rem">{{ $t('setting.other.direct_mode.title') }}</span>
          <van-switch :value="appConfig.directMode" :disabled="appConfig.useApiProxy" size="24" @change="setDirectMode" />
        </div>
      </van-cell>
    </van-dialog>
  </div>
</template>

<script>
import { Dialog } from 'vant'
import platform from '@/platform'
import PixivAuth from '@/api/client/pixiv-auth'
import { getLoginURL } from '@/api/client/login'
import { LocalStorage } from '@/utils/storage'

export default {
  name: 'Login',
  data() {
    return {
      appConfig: { ...window.APP_CONFIG },
      showConfirmDialog: false,
      showTokenDialog: false,
      platform,
    }
  },
  head() {
    return { title: this.$t('user.sess.login') }
  },
  methods: {
    async openConfirmDialog(showKey) {
      const res = await Dialog.confirm({
        title: this.$t('sess.warn.title'),
        message: this.$t('sess.warn.text'),
        closeOnPopstate: true,
        cancelButtonText: this.$t('common.cancel'),
        confirmButtonText: this.$t('common.confirm'),
      }).catch(() => {})
      if (res != 'confirm') return
      this[showKey] = true
    },
    async setLocalHibi() {
      if (this.appConfig.refreshToken?.length != 43) {
        this.$toast(this.$t('login.t.d4'))
      }
      this.appConfig.useLocalAppApi = true
      PixivAuth.writeConfig(this.appConfig)
      window.umami?.track('token_login', { len: this.appConfig.refreshToken?.length })
      setTimeout(() => {
        location.assign('/')
      }, 500)
    },
    async openLoginWindow() {
      const res = getLoginURL()
      LocalStorage.set('PXV_LOGIN_CODEV', res.code_verifier, 600)
      window.open(res.login_url, '_blank', 'noopener noreferrer')
    },
    async setUseApiProxy(val) {
      if (val) {
        const res = await Dialog.confirm({
          title: this.$t('setting.other.direct_mode.confirm.proxy_title'),
          message: this.$t('setting.other.direct_mode.confirm.proxy_msg'),
          confirmButtonText: this.$t('common.confirm'),
          cancelButtonText: this.$t('common.cancel'),
        }).catch(() => 'cancel')
        if (res == 'cancel') return
        this.$set(this.appConfig, 'useApiProxy', true)
      } else {
        this.$set(this.appConfig, 'useApiProxy', false)
      }
      window.umami?.track('useApiProxy', { val })
      await this.$nextTick()
      PixivAuth.writeConfig(this.appConfig)
    },
    async setDirectMode(val) {
      if (val) {
        const res = await Dialog.confirm({
          title: this.$t('setting.other.direct_mode.confirm.title'),
          message: this.$t('setting.other.direct_mode.confirm.msg') + '<br><br>' + this.$t('Vac-n5rX-GcGmqcu-bhvl') + '<br><br>' + this.$t('GRVq7phCyjYNikSeFBUpq'),
          confirmButtonText: this.$t('common.confirm'),
          cancelButtonText: this.$t('common.cancel'),
        }).catch(() => 'cancel')
        if (res == 'cancel') return
        this.$set(this.appConfig, 'directMode', true)
      } else {
        this.$set(this.appConfig, 'directMode', false)
      }
      window.umami?.track('setDirectMode', { val })
      await this.$nextTick()
      PixivAuth.writeConfig(this.appConfig)
      const { setSkipSslSetting } = await import('@/platform/capacitor/utils')
      await setSkipSslSetting(val)
      Dialog.alert({
        title: this.$t('tips.tip'),
        message: this.$t('lvocRILZVORp4Y1U0x6gz'),
        showConfirmButton: false,
        closeOnPopstate: false,
      })
    },
  },
}
</script>

<style lang="stylus" scoped>

</style>
