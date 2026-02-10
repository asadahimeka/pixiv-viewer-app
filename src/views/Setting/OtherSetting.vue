<template>
  <div class="setting-page">
    <top-bar id="top-bar-wrap" />
    <h3 class="af_title">{{ $t('setting.other.title') }}</h3>
    <van-cell-group :title="$t('GS0J0mAbmiqPGKw20ORPi')">
      <van-cell center :title="$t('setting.other.lang')" is-link :label="selLangLabel" @click="lang.show = true" />
      <van-cell center :title="$t('psoXLFqv51j1SeKjTbnms')" is-link :label="`${accentColor} ${actTheme}`" to="/setting/accent_color" />
      <van-cell center :title="$t('setting.dark.title')" :label="$t('setting.lab.title')">
        <template #right-icon>
          <van-switch :value="isDark" size="24" @change="onDarkChange" />
        </template>
      </van-cell>
      <van-cell center :title="$t('SLO07VkQh2wjFJJ1MLvUl')" :label="appSetting.pageFont || $t('ZfJcs8gi6ptsljzInCNpH')" is-link @click="showPageFontSel" />
    </van-cell-group>

    <van-cell-group :title="$t('9X179hdP1zzapzk5Rvqx2')">
      <van-cell center :title="$t('setting.layout.title')" is-link :label="appSetting.wfType" @click="wfType.show = true" />
      <van-cell center :title="$t('setting.img_res.title')" is-link :label="appSetting.imgReso" @click="imgRes.show = true" />
      <van-cell center :title="$t('ZO7u4XT4flW6_nmyvmXt7')" :label="$t('WdS4RTIeeWqdaqLtvk7ZO')">
        <template #right-icon>
          <van-switch :value="appSetting.isImageCardOuterMeta" size="24" @change="v => saveAppSetting('isImageCardOuterMeta', v, true)" />
        </template>
      </van-cell>
      <van-cell v-if="!isNavSHSetShow" center :title="$t('mR4YFHYUnr00zmzYydrMv')" :label="$t('V-KoSeNoEiNct7oZJgCcD')">
        <template #right-icon>
          <van-switch :value="appSetting.isImageFitScreen" size="24" @change="v => saveAppSetting('isImageFitScreen', v, true)" />
        </template>
      </van-cell>
      <van-cell center :title="$t('kFOiZTwKWwXy-sxaspqSD')" :label="$t('NgE24V8lvXN2c15W_2gnE')">
        <template #right-icon>
          <van-switch :disabled="appSetting.isLongpressDL" :value="appSetting.isLongpressBlock" size="24" @change="v => saveAppSetting('isLongpressBlock', v, true)" />
        </template>
      </van-cell>
      <van-cell v-if="isPageTransitionSelShow" center :title="$t('Cy6qJLutMa5O3jJr8TawB')" :label="pageTransitionLabel" is-link @click="pageTransition.show = true" />
      <van-cell v-if="platform.isAndroid" center :title="$t('GC421AyTxr0fbKIiTVhNt')" :label="$t('Rw0vijWia2YYJTECmLXnR')">
        <template #right-icon>
          <van-switch :value="isDisableStatusbarOverlay" size="24" @change="changeStatusbarOverlayOff" />
        </template>
      </van-cell>
    </van-cell-group>

    <van-cell-group :title="$t('novel.settings.title')">
      <van-cell center :title="$t('j1tomH0kHtIiXUQ-6NhcS')" :label="$t('UiF3Ob-tYkIolJhNVMUFM')" is-link @click="showNovelConfig" />
      <van-cell center :title="$t('MIvoTULAIywXTtFIKsEuD')" :label="novelDlFmtLabel" is-link @click="novelDlFmt.show = true" />
      <template v-if="showAutoLoadImtSwitch">
        <van-cell center title="小说默认翻译服务" :label="novelTranslateLabel" is-link @click="novelTranslate.show = true" />
        <van-cell center title="自动加载沉浸式翻译 SDK 并翻译" label="如已安装沉浸式翻译浏览器扩展则无需加载沉浸式翻译 SDK">
          <template #right-icon>
            <van-switch :value="appSetting.isAutoLoadImt" size="24" @change="changeAutoLoadImt" />
          </template>
        </van-cell>
      </template>
    </van-cell-group>

    <van-cell-group :title="$t('j2tFt08r6GGMmsfbF4HAN')">
      <van-cell center :title="$t('5syY7l774noiN5LHKUnqF')" :label="$t('QRASoWf3qDfwihoIa84C9')">
        <template #right-icon>
          <van-switch :disabled="appSetting.isLongpressBlock" :value="appSetting.isLongpressDL" size="24" @change="v => saveAppSetting('isLongpressDL', v, true)" />
        </template>
      </van-cell>
      <van-cell v-if="platform.isTauri" center :title="$t('C-gNiRgJ5qHE6we1kLwaZ')" is-link :label="saveFileDir || $t('CQXPpD9lIK5Te0yjGoy56')" @click="selSaveFileDir" />
      <van-cell v-if="!appSetting.preferDownloadManager" center :title="$t('IQH88ofRzNxE0CTcT0-wO')" :label="$t('setting.lab.title')">
        <template #right-icon>
          <van-switch :value="appSetting.dlSubDirByAuthor" size="24" @change="v => saveAppSetting('dlSubDirByAuthor', v)" />
        </template>
      </van-cell>
      <van-cell center :title="$t('m9rhO-859d7Br05Hm5b54')" is-link :label="appSetting.dlFileNameTpl" @click="showDlFileNameTplDialog = true" />
      <van-cell center :title="$t('Rq0GHiUs_LyUxDu-IhfBb')" is-link :label="appSetting.ugoiraDefDLFormat || $t('ks96nwuAms0B8wSWBWhil')" @click="ugoiraDL.show = true" />
      <van-cell v-if="platform.isAndroid" center :title="$t('8uktANA7hP_We9wM_o8lN')" :label="$t('9zbbiHNnDhb2eebwLd3HR')">
        <template #right-icon>
          <van-switch
            :value="appSetting.preferDownloadManager"
            size="24"
            @change="v => {
              v && saveAppSetting('preferMediaStore', false);
              saveAppSetting('preferDownloadManager', v, true);
            }"
          />
        </template>
      </van-cell>
      <van-cell v-if="platform.isAndroid" center :title="$t('OcF9ZWmu2_E8bvGSIiAdJ')" :label="$t('oaNdIowRN9TQxKA0EECI4')">
        <template #right-icon>
          <van-switch
            :value="appSetting.preferMediaStore"
            size="24"
            @change="v => {
              v && saveAppSetting('preferDownloadManager', false);
              saveAppSetting('preferMediaStore', v, true);
            }"
          />
        </template>
      </van-cell>
    </van-cell-group>

    <van-cell-group :title="$t('7-drBPGRIz_BsYuc9ybCm')">
      <van-cell v-if="!(appSetting.isDirectPximg && clientConfig.useLocalAppApi)" center :title="$t('setting.other.manual_input')" :label="$t('setting.other.manual_input_label')">
        <template #right-icon>
          <van-switch v-model="hideApSelect" size="24" />
        </template>
      </van-cell>
      <van-cell v-if="hideApSelect && !appSetting.isDirectPximg" center :title="$t('setting.img_proxy.title')" is-link :label="pximgBed.value" @click="pximgBed.show = true" />
      <van-cell v-if="!clientConfig.useLocalAppApi && hideApSelect" center :title="$t('setting.api.title')" is-link :label="hibiapi.value" @click="hibiapi.show = true" />
      <van-cell v-if="!hideApSelect && !appSetting.isDirectPximg" center :title="$t('setting.img_proxy.title2')" is-link :label="pximgBedLabel" @click="pximgBed_.show = true" />
      <van-cell v-if="!clientConfig.useLocalAppApi && !hideApSelect" center :title="$t('setting.api.title2')" is-link :label="hibiapiLabel" @click="hibiapi_.show = true" />
      <van-cell center :title="$t('lGZGzwfWz9tW_KQey3AmQ')" :label="appSetting.isDirectPximg?$t('1bFB0dqSmKBnjbVLFyJKp', [directApiHosts.pximg]):$t('OA8ygupG-4FcNWHtwEUG-')">
        <template #right-icon>
          <van-switch :value="appSetting.isDirectPximg" size="24" @change="setDirectPximg" />
        </template>
      </van-cell>
      <van-cell v-if="clientConfig.directMode || appSetting.isDirectPximg" center :title="$t('setting.other.direct_mode.host.title')" is-link :label="$t('setting.other.direct_mode.host.label')" @click="clearApiHosts" />
      <template v-if="clientConfig.useLocalAppApi">
        <van-cell v-if="platform.isAndroid" center :title="$t('setting.other.direct_mode.title')" :label="clientConfig.directMode?$t('1bFB0dqSmKBnjbVLFyJKp', [directApiHosts.api]):$t('setting.other.direct_mode.label')">
          <template #right-icon>
            <van-switch :value="clientConfig.directMode" :disabled="clientConfig.useApiProxy" size="24" @change="setDirectMode" />
          </template>
        </van-cell>
        <van-cell center :title="$t('setting.other.direct_mode.proxy.title')" :label="$t('setting.other.direct_mode.proxy.label')">
          <template #right-icon>
            <van-switch :value="clientConfig.useApiProxy" :disabled="clientConfig.directMode" size="24" @change="setUseApiProxy" />
          </template>
        </van-cell>
        <van-cell v-if="clientConfig.useApiProxy" center :title="$t('setting.other.api_proxy.title')" is-link :label="apiProxyLabel||$t('setting.other.api_proxy.def_ph')" @click="apiProxySel.show = true" />
        <van-cell v-if="clientConfig.refreshToken" center :title="$t('setting.other.cp_token_title')" is-link :label="$t('setting.other.cp_token_label')" @click="copyToken" />
      </template>
    </van-cell-group>

    <van-cell-group :title="$t('6oe7JPS26HGAlcjQdmHZ4')">
      <van-cell center :title="$t('Na5UTdncjCSNrFJGlrPoq')">
        <template #right-icon>
          <van-switch :value="appSetting.withBodyBg" size="24" @change="v => saveAppSetting('withBodyBg', v, true)" />
        </template>
      </van-cell>
      <van-cell center :title="$t('qLUWER5bf4X2lE0RjKTBj')">
        <template #right-icon>
          <van-switch :value="appSetting.isUseFancybox" size="24" @change="v => saveAppSetting('isUseFancybox', v)" />
        </template>
      </van-cell>
      <van-cell center :title="$t('setting.other.swipe_toggle')">
        <template #right-icon>
          <van-switch :value="appSetting.isEnableSwipe" size="24" @change="v => saveAppSetting('isEnableSwipe', v, true)" />
        </template>
      </van-cell>
      <van-cell v-if="isNavSHSetShow" center :title="$t('Gry1iNTJ2wm_9FMG_JpBT')">
        <template #right-icon>
          <van-switch :value="appSetting.hideNavBarOnScroll" size="24" @change="v => saveAppSetting('hideNavBarOnScroll', v, true)" />
        </template>
      </van-cell>
      <van-cell center :title="$t('GnyWarxXoDw49xCft4IlS')">
        <template #right-icon>
          <van-switch :value="appSetting.isImgLazy" size="24" @change="v => saveAppSetting('isImgLazy', v, true)" />
        </template>
      </van-cell>
      <van-cell center :title="$t('2CmJxHkq8O-uA68cU90Lx')">
        <template #right-icon>
          <van-switch :value="appSetting.isImgLazyOb" size="24" @change="v => saveAppSetting('isImgLazyOb', v, true)" />
        </template>
      </van-cell>
      <van-cell center :title="$t('_E9iTJP6wHVE-Qxau80YA')">
        <template #right-icon>
          <van-switch :value="appSetting.isImageCardBorderRadius" size="24" @change="v => saveAppSetting('isImageCardBorderRadius', v, true)" />
        </template>
      </van-cell>
      <van-cell center title="Enable Umami Analytics">
        <template #right-icon>
          <van-switch :value="isAnalyticsOn" size="24" @change="onAnalyticsChange" />
        </template>
      </van-cell>
    </van-cell-group>

    <van-cell-group :title="$t('_AEPlcZHsKjnjPXQBX59p')">
      <van-cell center :title="$t('Wc3yMDMSkHUhoGx22bsP8')" is-link @click="importSettings" />
      <van-cell center :title="$t('Bi5BpYwKhUhWcm_RueGZN')" is-link @click="exportSettings" />
      <van-cell v-if="platform.isAndroid" center :title="$t('V8DX1WzGd142O8SUrOlMP')" is-link @click="shareSettings" />
    </van-cell-group>

    <van-dialog
      v-model="pximgBed.show"
      width="9rem"
      :title="$t('setting.img_proxy.title3')"
      show-cancel-button
      :cancel-button-text="$t('common.cancel')"
      :confirm-button-text="$t('common.confirm')"
      @confirm="changePximgBed"
    >
      <van-cell>{{ $t('setting.img_proxy.desc') }}</van-cell>
      <van-cell>{{ $t('setting.img_proxy.desc2') }}</van-cell>
      <van-field v-model="pximgBed.value" :label="$t('setting.input')" label-width="3.5em" :placeholder="$t('setting.img_proxy.title4')" />
    </van-dialog>
    <van-dialog
      v-model="hibiapi.show"
      width="9rem"
      :title="$t('setting.api.title4')"
      show-cancel-button
      :cancel-button-text="$t('common.cancel')"
      :confirm-button-text="$t('common.confirm')"
      @confirm="changeHibiapi"
    >
      <van-cell>{{ $t('setting.api.desc') }}</van-cell>
      <van-cell>{{ $t('setting.api.desc2') }}</van-cell>
      <van-cell>{{ $t('setting.api.desc3') }}: <a href="https://github.com/mixmoe/HibiAPI">🔗Github</a></van-cell>
      <!-- <van-cell>{{ $t('setting.api.desc5') }}</van-cell> -->
      <van-field v-model="hibiapi.value" :label="$t('setting.input')" label-width="3.5em" :placeholder="$t('setting.api.title3')" />
    </van-dialog>
    <van-action-sheet
      v-model="apiProxySel.show"
      :actions="apiProxySel.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('setting.other.api_proxy.sel_desc')"
      close-on-click-action
      @select="changeApiProxy"
    />
    <van-action-sheet
      v-model="wfType.show"
      :actions="wfType.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('setting.layout.ph')"
      close-on-click-action
      @select="v => saveAppSetting('wfType', v.name, true)"
    />
    <van-action-sheet
      v-model="imgRes.show"
      :actions="imgRes.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('setting.img_res.ph')"
      close-on-click-action
      @select="v => saveAppSetting('imgReso', v.name, true)"
    />
    <van-action-sheet
      v-model="ugoiraDL.show"
      :actions="ugoiraDL.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('Rq0GHiUs_LyUxDu-IhfBb')"
      close-on-click-action
      @select="v => saveAppSetting('ugoiraDefDLFormat', v.name)"
    />
    <van-action-sheet
      v-model="pageTransition.show"
      :actions="pageTransition.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('Cy6qJLutMa5O3jJr8TawB')"
      close-on-click-action
      @select="onPageTransitionChange"
    />
    <van-action-sheet
      v-model="pageFont.show"
      style="font-family: Arial, Helvetica, sans-serif"
      :actions="pageFont.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('SLO07VkQh2wjFJJ1MLvUl')"
      close-on-click-action
      @select="e => saveAppSetting('pageFont', e._value, true)"
    />
    <van-action-sheet
      v-model="novelDlFmt.show"
      :actions="novelDlFmt.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('MIvoTULAIywXTtFIKsEuD')"
      close-on-click-action
      @select="e => saveAppSetting('novelDlFormat', e._value)"
    />
    <van-action-sheet
      v-model="novelTranslate.show"
      :actions="novelTranslate.actions"
      :cancel-text="$t('common.cancel')"
      description="小说默认翻译服务 (不可与自动加载沉浸式翻译 SDK 同时使用)"
      close-on-click-action
      @select="e => saveAppSetting('novelDefTranslate', e._value)"
    />
    <van-action-sheet
      v-model="lang.show"
      :actions="lang.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('setting.other.lang_ph')"
      close-on-click-action
      @select="changeLang"
    />
    <van-action-sheet
      v-model="pximgBed_.show"
      :actions="pximgBed_.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('setting.img_proxy.ph')"
      close-on-click-action
      @select="changePximgBed_"
    />
    <van-action-sheet
      v-model="hibiapi_.show"
      :actions="hibiapi_.actions"
      :cancel-text="$t('common.cancel')"
      :description="$t('setting.api.ph')"
      close-on-click-action
      class="hibiapi-actions"
      @select="changeHibiapi_"
    />
    <van-dialog
      v-model="showDlFileNameTplDialog"
      width="9rem"
      :title="$t('m9rhO-859d7Br05Hm5b54')"
      show-cancel-button
      :cancel-button-text="$t('common.cancel')"
      :confirm-button-text="$t('common.confirm')"
      @confirm="saveAppSetting('dlFileNameTpl', dlFileNameTpl)"
      @cancel="dlFileNameTpl=appSetting.dlFileNameTpl"
    >
      <van-cell>{{ $t('QJJd8OqGWs3rIHxMwYma9') }}</van-cell>
      <van-cell class="tips">{{ $t('bmqXgC68c1dDsgtYwO1Sv') }} <code>{pid}</code> <code>{index}</code></van-cell>
      <van-cell>{{ $t('Zt3czgV8wrvas-it5b9Z0') }}</van-cell>
      <div class="dl-tpl-tags">
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{author}'">
          <van-tag round plain type="primary" size="large">author</van-tag>
          <span>{{ $t('VJLRKYZZDrAv5NKTHcisN') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{authorId}'">
          <van-tag round plain type="primary" size="large">authorId</van-tag>
          <span>{{ $t('hVJXyeDWfpiwbIS7CpgEX') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{title}'">
          <van-tag round plain type="primary" size="large">title</van-tag>
          <span>{{ $t('xVDEqSshq1e1ZEmv3q-3s') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{pid}'">
          <van-tag round plain type="primary" size="large">pid</van-tag>
          <span>{{ $t('6_DlIX_02ur5HfDOc9wsb') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{index}'">
          <van-tag round plain type="primary" size="large">index</van-tag>
          <span>{{ $t('SjI_Ww3ngIBNJxTDLAszn') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{width}'">
          <van-tag round plain type="primary" size="large">width</van-tag>
          <span>{{ $t('0VXbrbumb60glupUb3cUk') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{height}'">
          <van-tag round plain type="primary" size="large">height</van-tag>
          <span>{{ $t('G6LGYgi1RdW54WbmYURmF') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{tags}'">
          <van-tag round plain type="primary" size="large">tags</van-tag>
          <span>{{ $t('9tIV83JmVMkNKF2B8F4LI') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='{createDate}'">
          <van-tag round plain type="primary" size="large">createDate</van-tag>
          <span>{{ $t('JHBWOqLzMQN-kgmyDVSzN') }}</span>
        </div>
        <div class="dl-tpl-tag" @click="dlFileNameTpl+='_'">
          <van-tag plain type="primary" size="large">_</van-tag>
          <span>{{ $t('P2gkznjKnjtHZDGXgzYfg') }}</span>
        </div>
      </div>
      <van-field v-model="dlFileNameTpl" :label="$t('498jRU7yCP-NoupL7HBFk')" label-width="3.5em" />
    </van-dialog>
    <NovelTextConfig ref="novelConfigRef" style="left: 50%;right: unset;" />
  </div>
</template>

<script>
import { Dialog } from 'vant'
import PixivAuth from '@/api/client/pixiv-auth'
import localDb from '@/utils/storage/localDb'
import store from '@/store'
import { APP_API_PROXYS, DEF_HIBIAPI_MAIN, DEF_PXIMG_MAIN, HIBIAPI_ALTS, PXIMG_PROXYS } from '@/consts'
import { i18n } from '@/i18n'
import { checkImgAvailable, checkUrlAvailable, copyText, downloadFile, isURL, readTextFile } from '@/utils'
import { mintVerify } from '@/utils/filter'
import { LocalStorage, SessionStorage } from '@/utils/storage'
import { getPageFontModel } from '@/utils/font'
import NovelTextConfig from '../Artwork/components/NovelTextConfig.vue'
import platform from '@/platform'

export default {
  name: 'SettingOthers',
  components: {
    NovelTextConfig,
  },
  data() {
    return {
      platform,
      clientConfig: { ...window.APP_CONFIG },
      apiProxySel: {
        show: false,
        actions: APP_API_PROXYS.split(',').map((_value, i) => {
          const arr = _value.split('.')
          const label = arr.map((e, i) => {
            if (i == 0) { return e.length <= 4 ? e : `${e[0]}*${e.slice(-3)}` }
            return i == arr.length - 1 ? e : '*'
          }).join('.')
          return { name: `Proxy ${i} (${label})`, _value }
        }),
      },
      pximgBed: {
        show: false,
        value: LocalStorage.get('PXIMG_PROXY', DEF_PXIMG_MAIN),
      },
      pximgBed_: {
        show: false,
        value: LocalStorage.get('PXIMG_PROXY', DEF_PXIMG_MAIN),
        actions: PXIMG_PROXYS.split(';').map(e => {
          const [name, _value] = e.split(',')
          return { name, _value }
        }),
      },
      hibiapi: {
        show: false,
        value: LocalStorage.get('HIBIAPI_BASE', DEF_HIBIAPI_MAIN),
      },
      hibiapi_: {
        show: false,
        value: LocalStorage.get('HIBIAPI_BASE', DEF_HIBIAPI_MAIN),
        actions: HIBIAPI_ALTS.split(';').map(e => {
          const [name, _value] = e.split(',')
          return { name, _value }
        }),
      },
      wfType: {
        show: false,
        actions: [
          { name: 'Masonry', subname: this.$t('setting.layout.m') },
          { name: 'Grid', subname: this.$t('setting.layout.g') },
          { name: 'Justified', subname: this.$t('setting.layout.j') },
          { name: 'Masonry(CSSGrid)', subname: this.$t('setting.layout.m') + ' - ' + this.$t('setting.lab.title') },
          { name: 'Justified(Transform)', subname: this.$t('setting.layout.j') + ' - ' + this.$t('setting.lab.title') },
          { name: 'Masonry(FlexOrder)', subname: this.$t('setting.layout.m') + ' - ' + this.$t('setting.lab.title') },
        ],
      },
      imgRes: {
        show: false,
        actions: [
          { name: 'Medium', subname: this.$t('setting.img_res.m') },
          { name: 'Large', subname: this.$t('setting.img_res.l') },
          { name: 'Original', subname: this.$t('setting.img_res.o'), disabled: LocalStorage.get('PXIMG_PROXY') != 'i.pixiv.re' },
        ],
      },
      lang: {
        show: false,
        value: i18n.locale,
        actions: [
          { _value: 'zh-CN', name: '简体中文' },
          { _value: 'zh-TW', name: '繁體中文' },
          { _value: 'en', name: 'English' },
          { _value: 'ja', name: '日本語' },
          { _value: 'ko', name: '한국어' },
          { _value: 'de', name: 'Deutsch' },
          { _value: 'fr', name: 'Français' },
          { _value: 'ru', name: 'Русский' },
          { _value: 'it', name: 'Italiano' },
          { _value: 'es', name: 'Español' },
          { _value: 'pt', name: 'Português' },
          { _value: 'el', name: 'Ελληνικά' },
        ],
      },
      ugoiraDL: {
        show: false,
        actions: [
          { name: 'ZIP', subname: i18n.t('artwork.download.zip') },
          { name: 'GIF', subname: i18n.t('artwork.download.gif') },
          { name: 'WebM', subname: i18n.t('artwork.download.webm') },
          { name: 'APNG', subname: i18n.t('artwork.download.webm') },
          { name: 'MP4(Browser)', subname: i18n.t('pIghtXdU8socMNNRUn5UR') },
          { name: 'MP4(Server)', subname: i18n.t('zuVom-C8Ss8JTEDZIhzBj') },
          { name: 'Other', subname: i18n.t('artwork.download.mp4') },
        ],
      },
      pageTransition: {
        show: false,
        actions: [
          { name: 'none', _value: '' },
          { name: 'ios', _value: 'f7-ios' },
          { name: 'md', _value: 'f7-md' },
          // { name: 'scale', _value: 'f7-circle' },
          { name: 'cover', _value: 'f7-cover' },
          { name: 'cover-v', _value: 'f7-cover-v' },
          { name: 'dive', _value: 'f7-dive' },
          { name: 'fade', _value: 'f7-fade' },
          { name: 'flip', _value: 'f7-flip' },
          { name: 'parallax', _value: 'f7-parallax' },
          { name: 'push', _value: 'f7-push' },
        ],
      },
      pageFont: {
        show: false,
        actions: [],
      },
      novelDlFmt: {
        show: false,
        actions: [
          { name: 'TXT', _value: 'txt' },
          { name: 'HTML', _value: 'html' },
        ],
      },
      novelTranslate: {
        show: false,
        actions: [
          { name: '未设置', _value: '' },
          { name: 'AI 翻译(glm-4-9b)', className: 'sc', key: 'sc_glm' },
          { name: 'AI 翻译(GLM-4-9B-0414)', className: 'sc', key: 'sc_glm_0414' },
          { name: 'AI 翻译(GLM-Z1-9B-0414)', className: 'sc', key: 'sc_glm_z1' },
          { name: 'AI 翻译(Qwen3-8B)', className: 'sc', key: 'sc_qwen3' },
          { name: 'AI 翻译(Qwen2.5-7B)', className: 'sc', key: 'sc_qwen2_5' },
          { name: 'AI 翻译(Qwen2-7B)', className: 'sc', key: 'sc_qwen2' },
          { name: 'AI 翻译(DS-R1-Llama-8B)', className: 'sc', key: 'sc_ds_r1_llama' },
          { name: 'AI 翻译(DS-R1-Qwen-7B)', className: 'sc', key: 'sc_ds_r1_qwen' },
          { name: '微软翻译', _value: 'ms' },
          { name: '谷歌翻译', _value: 'gg' },
          { name: '有道翻译', _value: 'yd' },
        ],
      },
      hideApSelect: LocalStorage.get('__HIDE_AP_SEL', false),
      isDark: !!localStorage.getItem('PXV_DARK'),
      showAutoLoadImtSwitch: i18n.locale.includes('zh'),
      actTheme: localStorage.PXV_THEME || '',
      accentColor: localStorage.PXV_ACT_COLOR || 'Default',
      showDlFileNameTplDialog: false,
      dlFileNameTpl: store.state.appSetting.dlFileNameTpl,
      isAnalyticsOn: LocalStorage.get('PXV_ANALYTICS', true),
      isPageTransitionSelShow: Boolean(document.startViewTransition),
      isDisableStatusbarOverlay: LocalStorage.get('PXV_STATUSBAR_OVERLAY_OFF', false),
      directApiHosts: {
        api: window.p_api_hosts?.['app-api.pixiv.net'],
        pximg: window.p_pximg_ip,
      },
      saveFileDir: LocalStorage.get('PXV_DL_DIR'),
      isNavSHSetShow: document.documentElement.clientWidth <= 1270,
    }
  },
  head() {
    return { title: this.$t('setting.other.title') }
  },
  computed: {
    selLangLabel() {
      return this.lang.actions.find(e => e._value == this.lang.value)?.name || ''
    },
    pximgBedLabel() {
      return this.pximgBed_.actions.find(e => e._value == this.pximgBed_.value)?.name || ''
    },
    hibiapiLabel() {
      return this.hibiapi_.actions.find(e => e._value == this.hibiapi_.value)?.name || ''
    },
    apiProxyLabel() {
      return this.apiProxySel.actions.find(e => e._value == this.clientConfig.apiProxy)?.name || ''
    },
    appSetting() {
      return store.state.appSetting
    },
    pageTransitionLabel() {
      return this.pageTransition.actions.find(e => e._value == store.state.appSetting.pageTransition)?.name || ''
    },
    novelDlFmtLabel() {
      return this.novelDlFmt.actions.find(e => e._value == store.state.appSetting.novelDlFormat)?.name || ''
    },
    novelTranslateLabel() {
      return this.novelTranslate.actions.find(e => e._value == store.state.appSetting.novelDefTranslate)?.name || ''
    },
  },
  watch: {
    hideApSelect(val) {
      LocalStorage.set('__HIDE_AP_SEL', val)
      if (val) {
        LocalStorage.set('HIBIAPI_BASE', DEF_HIBIAPI_MAIN)
        LocalStorage.set('PXIMG_PROXY', DEF_PXIMG_MAIN)
      }
      setTimeout(() => {
        location.reload()
      }, 500)
    },
  },
  methods: {
    copyToken() {
      const token = this.clientConfig.refreshToken
      if (!token) return
      copyText(token, () => this.$toast(this.$t('tips.copylink.succ')), err => {
        window.umami?.track('copy_err', { err: `${err}` })
        this.$toast(this.$t('tips.copy_err') + ': ' + err)
        Dialog.alert({
          title: 'Refresh Token',
          confirmButtonText: 'Close',
          message: `<input type="text" value="${token}" style="min-width:200px">`,
        })
      })
    },
    async saveClientConfig({ reload } = { reload: true }) {
      PixivAuth.writeConfig(this.clientConfig)
      reload && setTimeout(() => {
        location.reload()
      }, 500)
    },
    saveAppSetting(/** @type {keyof typeof store.state.appSetting} */ key, val, needReload = false) {
      console.log(key, val)
      window.umami?.track(`set:${key}`, { val })
      store.commit('setAppSetting', { [key]: val })
      if (needReload) setTimeout(() => location.reload(), 200)
    },
    async setDirectPximg(val) {
      if (val) {
        let message = this.$t('mq3jjWeUDS-TPnfYJQvD5')
        if (platform.isAndroid) message += '<br><br>' + this.$t('GRVq7phCyjYNikSeFBUpq')
        const res = await Dialog.confirm({
          title: this.$t('setting.other.direct_mode.confirm.title'),
          message,
          confirmButtonText: this.$t('common.confirm'),
          cancelButtonText: this.$t('common.cancel'),
        }).catch(() => 'cancel')
        if (res == 'cancel') return
      }
      LocalStorage.set('PXV_PXIMG_DIRECT', val)
      this.saveAppSetting('isDirectPximg', val, !platform.isAndroid)
      if (platform.isAndroid) {
        const { setSkipSslSetting } = await import('@/platform/capacitor/utils')
        await setSkipSslSetting(this.clientConfig.directMode || val)
        Dialog.alert({
          title: this.$t('tips.tip'),
          message: this.$t('lvocRILZVORp4Y1U0x6gz'),
          showConfirmButton: false,
          closeOnPopstate: false,
        })
      }
      this.$nextTick(() => {
        this.hibiapi.show = false
        this.hibiapi_.show = false
      })
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
      }
      window.umami?.track('setDirectMode', { val })
      this.clientConfig.directMode = val
      await this.$nextTick()
      await this.saveClientConfig({ reload: false })
      const { setSkipSslSetting } = await import('@/platform/capacitor/utils')
      await setSkipSslSetting(this.appSetting.isDirectPximg || val)
      Dialog.alert({
        title: this.$t('tips.tip'),
        message: this.$t('lvocRILZVORp4Y1U0x6gz'),
        showConfirmButton: false,
        closeOnPopstate: false,
      })
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
        window.umami?.track('setUseApiProxy')
        this.clientConfig.useApiProxy = true
        await this.$nextTick()
        await this.saveClientConfig()
      } else {
        this.clientConfig.useApiProxy = false
        await this.$nextTick()
        await this.saveClientConfig()
      }
    },
    async clearApiHosts() {
      const res = await Dialog.confirm({
        message: this.$t('setting.other.direct_mode.host_msg'),
        confirmButtonText: this.$t('common.confirm'),
        cancelButtonText: this.$t('common.cancel'),
      }).catch(() => 'cancel')
      if (res == 'cancel') return
      window.umami?.track('clearApiHosts')
      LocalStorage.remove('PXV_PXIMG_IP')
      delete this.clientConfig.apiHosts
      await this.saveClientConfig()
    },
    async changeApiProxy({ _value }) {
      this.clientConfig.apiProxy = _value
      window.umami?.track('set_api_proxy', { _value })
      await this.saveClientConfig()
    },
    saveSetting(key, val) {
      window.umami?.track(`set:${key}`, { val })
      this.$nextTick(() => {
        LocalStorage.set(key, val)
        setTimeout(() => {
          location.reload()
        }, 500)
      })
    },
    async changePximgBed() {
      const url = `https://${this.pximgBed.value}`
      const res = await this.checkURL(url, () => {
        return checkImgAvailable(`${url}/user-profile/img/2022/02/03/15/54/20/22159592_fce9f5c7a908c9b601dc7e9da7a412a3_50.jpg?_t=${Date.now()}`)
      })
      if (!res) return
      SessionStorage.clear()
      await localDb.clear()
      this.saveSetting('PXIMG_PROXY', this.pximgBed.value)
    },
    async changePximgBed_({ _value }) {
      const url = `https://${_value}`
      const res = await this.checkURL(url, () => {
        return checkImgAvailable(`${url}/user-profile/img/2022/02/03/15/54/20/22159592_fce9f5c7a908c9b601dc7e9da7a412a3_50.jpg?_t=${Date.now()}`)
      })
      if (!res) return
      this.pximgBed_.value = _value
      SessionStorage.clear()
      await localDb.clear()
      this.saveSetting('PXIMG_PROXY', _value)
    },
    async changeHibiapi() {
      const url = this.hibiapi.value
      const res = await this.checkURL(url, () => {
        return checkUrlAvailable(`${url}/rank?_t=${Date.now()}`)
      })
      if (!res) return
      SessionStorage.clear()
      await localDb.clear()
      this.saveSetting('HIBIAPI_BASE', this.hibiapi.value)
    },
    async changeHibiapi_({ _value }) {
      const res = await this.checkURL(_value, () => {
        return checkUrlAvailable(`${_value}/rank?_t=${Date.now()}`)
      })
      if (!res) return
      this.hibiapi_.value = _value
      SessionStorage.clear()
      await localDb.clear()
      this.saveSetting('HIBIAPI_BASE', _value)
    },
    changeStatusbarOverlayOff(val) {
      window.umami?.track('DisableStatusbarOverlay', { val })
      this.isDisableStatusbarOverlay = val
      this.$nextTick(() => {
        LocalStorage.set('PXV_STATUSBAR_OVERLAY_OFF', val)
        setTimeout(() => {
          location.reload()
        }, 500)
      })
    },
    onDarkChange(val) {
      window.umami?.track(`set_dark_${val}`)
      this.isDark = val
      localStorage.setItem('PXV_DARK', val || '')
      if (val) {
        document.documentElement.classList.add('dark')
        document.body.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
        document.body.classList.remove('dark')
      }
      setTimeout(() => location.reload(), 200)
    },
    onPageTransitionChange({ _value }) {
      this.saveAppSetting('pageTransition', _value, false)
      setTimeout(() => location.assign('/'), 200)
    },
    async showPageFontSel() {
      const pageFont = await getPageFontModel()
      pageFont.show = true
      this.pageFont = pageFont
    },
    showNovelConfig() {
      this.$refs.novelConfigRef?.open()
    },
    async changeAutoLoadImt(val) {
      if (val) {
        const res = await Dialog.confirm({
          title: '自动加载沉浸式翻译 SDK',
          message: '提示：如果已安装沉浸式翻译浏览器扩展则无需加载沉浸式翻译 SDK',
          lockScroll: false,
          closeOnPopstate: true,
          cancelButtonText: '取消',
          confirmButtonText: '确定',
        }).catch(() => 'cancel')
        if (res != 'confirm') return
      }
      this.saveAppSetting('isAutoLoadImt', val, true)
    },
    changeLang({ _value }) {
      this.lang.value = _value
      window.umami?.track('set_lang', { lang: _value })
      localStorage.setItem('PXV_LANG', _value)
      LocalStorage.remove('PXV_SHORTCUTS_SET')
      setTimeout(() => {
        location.reload()
      }, 500)
    },
    async selSaveFileDir() {
      const { getSelectedSaveDir } = await import('@/platform/tauri/utils')
      const selected = await getSelectedSaveDir()
      if (selected != null && !Array.isArray(selected)) {
        this.saveFileDir = selected
        this.saveSetting('PXV_DL_DIR', selected)
      }
    },
    onAnalyticsChange(val) {
      window.umami?.track('AnalyticsChange', { val })
      this.isAnalyticsOn = val
      LocalStorage.set('PXV_ANALYTICS', val)
      val ? localStorage.removeItem('umami.disabled') : localStorage.setItem('umami.disabled', 'true')
    },
    importSettings() {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.txt'
      input.style.display = 'none'
      input.onchange = async e => {
        try {
          const text = await readTextFile(e.target.files[0])
          const settings = JSON.parse(decodeURI(atob(text)))
          console.log('settings: ', settings)
          Object.keys(settings).forEach(k => {
            localStorage.setItem(k, settings[k])
          })
          window.umami?.track('importSettings')
          this.$toast.success('Success')
          setTimeout(() => {
            location.reload()
          }, 500)
        } catch (err) {
          console.log('err: ', err)
          window.umami?.track('importSettingsError', { err })
          this.$toast(`Error: ${err.message}`)
        }
      }
      input.click()
    },
    exportSettings(action) {
      const settings = {}
      const len = localStorage.length
      for (let i = 0; i < len; i++) {
        const keyName = localStorage.key(i)
        settings[keyName] = localStorage.getItem(keyName)
      }
      const blob = new Blob([btoa(encodeURI(JSON.stringify(settings)))], { type: 'text/plain;charset=utf-8' })
      if (action == 'return-blob') return blob
      window.umami?.track('exportSettings')
      downloadFile(blob, 'pixiv-viewer-settings.txt', { subDir: 'backup' })
    },
    async shareSettings() {
      try {
        window.umami?.track('shareSettings')
        const { shareSettingsFile } = await import('@/platform/capacitor/utils')
        await shareSettingsFile(this.exportSettings('return-blob'))
      } catch (err) {
        console.log('err: ', err)
        window.umami?.track('shareSettingsError', { err })
      }
    },
    async checkURL(val, checkFn) {
      if (!isURL(val)) {
        const isOK = await mintVerify(val, true)
        if (isOK) {
          Dialog.alert({
            title: 'Error',
            confirmButtonText: 'Close',
            message: 'Invalid URL input.',
          }).then(() => {
            location.reload()
          })
        } else {
          Dialog.alert({
            width: '9rem',
            title: 'U3VuIG9mIEJlYWNo',
            confirmButtonText: 'Close',
            message: '<img src="https://upload-bbs.miyoushe.com/upload/2023/05/21/190122060/911b2f7ef84a863194dfb247c2dfdac9_4125491471312265373.png" alt style="width:100%">',
          }).then(() => {
            location.reload()
          })
        }
        return false
      }
      const loading = this.$toast.loading({
        duration: 0,
        forbidClick: true,
        message: this.$t('tips.loading'),
      })
      try {
        await checkFn(val)
        loading.clear()
        return true
      } catch (error) {
        loading.clear()
        Dialog.alert({
          message: this.$t('tip.connect_err'),
          confirmButtonText: 'OK',
        }).then(() => {
          location.reload()
        })
        return false
      }
    },
  },
}
</script>

<style lang="stylus" scoped>
.setting-page
  min-height 80vh
  #top-bar-wrap
    width 1.4rem
  .van-cell__title
    padding-right 20px
  .van-cell-group
    margin-bottom 15px
  .dl-tpl-tag
    display flex
    flex-direction column
    justify-content center
    align-items center
    gap 5PX
    min-width 1.2rem
    cursor pointer
    >span:last-child
      color: gray
      font-size 12PX
    &s
      display flex
      align-items center
      flex-wrap wrap
      gap 8px
      padding 20px
</style>
