<template>
  <div class="setting-page">
    <van-cell
      center
      title="PixEz Flutter (Android,iOS)"
      is-link
      label="使用 Flutter 编写的 Pixiv 第三方客户端。支持免代理直连。"
      @click="openLink('https://github.com/Notsfsssf/pixez-flutter')"
    />
    <van-cell
      center
      title="Pixiv Artvier (Android)"
      is-link
      label="A third-party app for pixiv. 一个第三方pixiv App。"
      @click="openLink('https://github.com/yleencc/pixiv-artvier')"
    />
    <van-cell
      center
      title="Pixiv-SwiftUI (iOS,macOS)"
      is-link
      label="一个 Pixiv 客户端，支持 iOS/iPadOS/macOS"
      @click="openLink('https://github.com/Eslzzyl/Pixiv-SwiftUI')"
    />
    <van-cell
      center
      title="Pixeval (Windows)"
      is-link
      label="Wow. Yet another Pixiv client!"
      @click="openLink('https://github.com/Pixeval/Pixeval')"
    />
    <van-cell
      center
      title="pixes (Android,iOS,Linux,macOS,Windows)"
      is-link
      label="Unofficial pixiv app"
      @click="openLink('https://github.com/wgh136/pixes')"
    />
    <van-cell
      center
      title="PiPixiv (Android,iOS,Linux,macOS,Windows)"
      is-link
      label="一个使用Compose Multiplatform开发的第三方Pixiv客户端，支持国内直连"
      @click="openLink('https://github.com/darriousliu/PiPixiv')"
    />
    <van-cell
      center
      title="Pixiv-MultiPlatform (Android,iOS,Linux,macOS,Windows)"
      is-link
      label="跨平台第三方客户端，专注于预览。"
      @click="openLink('https://github.com/magic-cucumber/Pixiv-MultiPlatform')"
    />
    <van-cell
      center
      title="Materixiv (Android)"
      is-link
      label="Pixiv app with Material Design."
      @click="openLink('https://github.com/onlymash/materixiv')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/CeuiLiSA/Pixiv-Shaft')"
    >
      <template #title> Pixiv-Shaft (Android) </template>
      <template #label> Pixiv 第三方 Android 客户端。 </template>
    </van-cell>
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/CeuiLiSA/Pixiv-Slinky')"
    >
      <template #title> <s>Clover (Android)</s> </template>
      <template #label> <s>全新的第三方 pixiv 客户端。</s> </template>
    </van-cell>
    <!-- <van-cell
      center
      is-link
      @click="openLink('https://github.com/git-xiaocao/pixiv_func_mobile')"
    >
      <template #title> <s>Pixiv Func (Android,Windows)</s> </template>
      <template #label> <s>功能齐全的Pixiv第三方客户端 免代理 支持查看动图查看直播</s> </template>
    </van-cell> -->
    <van-cell
      center
      title="PixivCollection (Windows)"
      is-link
      label="Pixiv本地收藏夹图片管理"
      @click="openLink('https://github.com/asadahimeka/PixivCollection/releases')"
    />
    <van-cell
      center
      title="Boorusama (Android)"
      is-link
      label="A mobile client for booru sites built with Flutter"
      @click="openLink('https://github.com/khoadng/Boorusama')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/nullxception/boorusphere')"
    >
      <template #title> <s>Boorusphere (Android)</s> </template>
      <template #label> <s>Simple, content-focused booru viewer for Android</s> </template>
    </van-cell>
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/flexbooru/flexbooru')"
    >
      <template #title> <s>Flexbooru (Android)</s> </template>
      <template #label> <s>A booru client for Android, support Danbooru, Moebooru, Gelbooru, Shimmie, etc.</s> </template>
    </van-cell>
    <van-cell
      center
      title="BooruHub (Android)"
      is-link
      label="轻松发现和管理您最喜欢的 Booru 图像板"
      @click="openLink('https://play.google.com/store/apps/details?id=onlymash.flexbooru.play')"
    />
    <van-cell
      center
      title="JHenTai (Android,iOS,Linux,macOS,Windows)"
      is-link
      label="A cross-platform app made for e-hentai & exhentai by Flutter."
      @click="openLink('https://github.com/jiangtian616/JHenTai')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/Dar9586/NClientV2')"
    >
      <template #title> <s>NClientV2 (Android)</s> </template>
      <template #label> <s>An unofficial NHentai android client.</s> </template>
    </van-cell>
    <van-cell
      center
      title="NClientV3 (Android)"
      is-link
      label="An unofficial NHentai android client"
      @click="openLink('https://github.com/maxwai/NClientV3')"
    />
    <van-cell
      center
      title="Eros-N (Android,iOS)"
      is-link
      label="An unofficial nhentai app."
      @click="openLink('https://github.com/erosTeam/eros_n')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/wgh136/PicaComic')"
    >
      <template #title> <s>PicaComic (Android,Windows)</s> </template>
      <template #label> <s>Unofficial picacg app built with flutter/使用 Flutter 构建的跨平台 Picacg App</s> </template>
    </van-cell>
    <van-cell
      center
      title="venera (Android,iOS,Linux,macOS,Windows)"
      is-link
      label="A comic app"
      @click="openLink('https://github.com/venera-app/venera')"
    />
    <van-cell
      center
      title="动漫之家X (Android,iOS,Linux,macOS,Windows)"
      is-link
      label="动漫之家 Flutter 客户端。"
      @click="openLink('https://github.com/xiaoyaocz/flutter_dmzj')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/tachiyomiorg')"
    >
      <template #title> <s>Tachiyomi (Android)</s> </template>
      <template #label> <s>Free and open source manga reader for Android.</s> </template>
    </van-cell>
    <van-cell
      center
      title="TachiyomiJ2K (Android)"
      is-link
      label="TachiyomiJ2K is a free and open source manga reader for Android 6.0 and above. Based on the original Tachiyomi"
      @click="openLink('https://github.com/Jays2Kings/tachiyomiJ2K')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/KotatsuApp/Kotatsu')"
    >
      <template #title> <s>Kotatsu (Android)</s> </template>
      <template #label> <s>Manga reader for Android</s> </template>
    </van-cell>
    <van-cell
      center
      title="全是漫画 (Android)"
      is-link
      label="https://github.com/hongchacha/cartoon"
      @click="openLink('https://github.com/hongchacha/cartoon')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/crowforkotlin/CopyMangaX')"
    >
      <template #title> <s>CopyMangaX (Android)</s> </template>
      <template #label> <s>拷贝漫画三方APP 、项目采用多模块 和 MVI框架开发</s> </template>
    </van-cell>
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/niuhuan/kobi')"
    >
      <template #title> <s>kobi (Android,iOS,macOS,Windows,Linux)</s> </template>
      <template #label> <s>拷贝漫画客户端</s> </template>
    </van-cell>
    <van-cell
      center
      title="Neko Anime (Android)"
      is-link
      label="一个可以在线看番的 Android App."
      @click="openLink('https://github.com/xioneko/neko-anime')"
    />
    <van-cell
      center
      title="纯纯看番 (Android)"
      is-link
      label="纯纯看番，使用 Compose 开发的看番软件，支持多番剧源"
      @click="openLink('https://easybangumi.org/')"
    />
    <van-cell
      center
      title="Animeko (Android,iOS,Linux,macOS,Windows)"
      is-link
      label="集找番、追番、看番的一站式弹幕追番平台"
      @click="openLink('https://github.com/open-ani/animeko')"
    />
    <van-cell
      center
      title="Aniyomi (Android)"
      is-link
      label="Full-featured player and reader, based on Tachiyomi."
      @click="openLink('https://aniyomi.org/')"
    />
    <van-cell
      center
      title="KNKPAnime (Android,Windows)"
      is-link
      label="支持多番剧源与弹幕的看番软件。"
      @click="openLink('https://github.com/KNKPA/KNKPAnime')"
    />
    <van-cell
      center
      title="Kazumi (Android,Windows)"
      is-link
      label="基于自定义规则的番剧采集APP，支持流媒体在线观看，支持弹幕。"
      @click="openLink('https://github.com/Predidit/Kazumi')"
    />
    <van-cell
      center
      title="Kikoeru (Android)"
      is-link
      label="Kikoeru(ASMR Online) android client."
      @click="openLink('https://github.com/loli-ball/KikoeruRelease/releases')"
    />
    <van-cell
      center
      title="KikoFlu (Android,iOS,macOS,Windows)"
      is-link
      label="Kikoeru Flutter ASMR player app, 跨平台同人音声客户端"
      @click="openLink('https://github.com/Meteor-Sage/KikoFlu')"
    />
    <van-cell
      center
      title="LightNovelReader (Android)"
      is-link
      label="一款开源的轻小说阅读软件，追求轻量化的体积和流畅的阅读体验。"
      @click="openLink('https://github.com/dmzz-yyhyy/LightNovelReader')"
    />
    <van-cell
      center
      is-link
      @click="openLink('https://github.com/lucinhu/bili_you')"
    >
      <template #title> <s>Bili You (Android)</s> </template>
      <template #label> <s>一个用flutter制作的第三方B站客户端</s> </template>
    </van-cell>
    <van-cell
      center
      title="HamsterHelper (Windows)"
      is-link
      label="仓鼠助手,p站pixiv图片下载收藏管理器"
      @click="openLink('https://github.com/HamsterHelper/HamsterHelper')"
    />
    <!-- <van-cell
      center
      title="ComicNyaa (Android)"
      is-link
      label=" 一个跨平台的漫画/图库聚合阅读器。"
      @click="openLink('https://github.com/tsukiseele/ComicNyaa')"
    />
    <van-cell
      center
      title="MoeViewerN (Windows)"
      is-link
      label="一个可爱的二次元网络画廊浏览器。"
      @click="openLink('https://github.com/tsukiseele/MoeViewerN')"
    /> -->
  </div>
</template>

<script>
export default {
  name: 'SettingRecommendApps',
  components: {
  },
  data() {
    return {

    }
  },
  methods: {
    openLink(link) {
      window.umami?.track('open_link', { link: link.replace('https://', '') })
      window.open(link, '_blank', 'noopener')
    },
  },
}
</script>

<style lang="stylus" scoped>

</style>
