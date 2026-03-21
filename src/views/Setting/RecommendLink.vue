<template>
  <div class="setting-page">
    <van-cell
      center
      title="PixivNow"
      is-link
      label="https://pixiv.js.org"
      @click="openLink('https://pixiv.js.org/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="Pixiviz"
      is-link
      label="https://pixiviz.xyz"
      @click="openLink('https://pixiviz.xyz/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="Pixivel Kai"
      is-link
      label="https://pxelk.cocomi.eu.org"
      @click="openLink('https://pxelk.cocomi.eu.org')"
    />
    <van-cell
      center
      title="Pixiviz Kai"
      is-link
      label="https://pixiviz.cocomi.eu.org"
      @click="openLink('https://pixiviz.cocomi.eu.org')"
    />
    <van-cell
      center
      title="PixivNow Kai"
      is-link
      label="https://pxnow.cocomi.eu.org"
      @click="openLink('https://pxnow.cocomi.eu.org')"
    />
    <van-cell
      center
      title="pixiv萌え改"
      is-link
      label="https://pixivmoe.cocomi.eu.org"
      @click="openLink('https://pixivmoe.cocomi.eu.org')"
    />
    <van-cell
      center
      title="PixivLxns"
      is-link
      label="https://pixivlxns.cocomi.eu.org"
      @click="openLink('https://pixivlxns.cocomi.eu.org')"
    />
    <van-cell
      center
      title="PixivFE"
      is-link
      label="https://pixiv.perennialte.ch"
      @click="openLink('https://pixiv.perennialte.ch/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="MixPiv"
      is-link
      label="https://mixpiv.cocomi.eu.org"
      @click="openLink('https://mixpiv.cocomi.eu.org')"
    />
    <van-cell
      center
      title="Pixiv Ranking"
      is-link
      label="https://www.nanoka.top/illust/pixiv/"
      @click="openLink('https://www.nanoka.top/illust/pixiv/')"
    />
    <van-cell
      center
      title="Ugoira Converter"
      is-link
      label="https://ugoira.cocomi.eu.org"
      @click="openLink('https://ugoira.cocomi.eu.org')"
    />
    <van-cell
      center
      title="PixivCollection"
      is-link
      label="https://pxc.cocomi.eu.org"
      @click="openLink('https://pxc.cocomi.eu.org')"
    />
    <van-cell
      center
      title="Moeview"
      is-link
      label="https://moeview.app"
      @click="openLink('https://moeview.app')"
    />
    <van-cell
      center
      title="Booru Masonry"
      is-link
      label="https://booru.cocomi.eu.org"
      @click="openLink('https://booru.cocomi.eu.org')"
    />
    <van-cell
      center
      title="Wotaku - The Otaku Index"
      is-link
      label="https://wotaku.wiki"
      @click="openLink('https://wotaku.wiki/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="AnimeGarden - Anime Torrent aggregation site"
      is-link
      label="https://animes.garden"
      @click="openLink('https://animes.garden/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="EverythingMoe - Index of best Anime/Manga sites"
      is-link
      label="https://everythingmoe.com"
      @click="openLink('https://everythingmoe.com/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="Nekon - ≡ω≡"
      is-link
      label="https://nekon.app"
      @click="openLink('https://nekon.app/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="SomeACG - 做最棒的ACG插画作品分享平台"
      is-link
      label="https://www.someacg.top"
      @click="openLink('https://www.someacg.top/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="ManyACG - 二次元美图精选收集"
      is-link
      label="https://manyacg.top"
      @click="openLink('https://manyacg.top/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="Cosine 🎨 Gallery | 精选 ACG 好图壁纸集"
      is-link
      label="https://pic.cosine.ren"
      @click="openLink('https://pic.cosine.ren/?ref=pixiv.pictures')"
    />
    <van-cell
      center
      title="萌哩 - 萌萌的二次元美图"
      is-link
      label="https://www.moely.link"
      @click="openLink('https://www.moely.link/?ref=pixiv.pictures')"
    />
  </div>
</template>

<script>
export default {
  name: 'SettingRecommendLinks',
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
