<template>
  <div class="nav-container" :class="{ showNav: isNavAppear }">
    <ul class="nav-bar">
      <li @click="navigateTo('Home')">
        <Icon
          class="icon home"
          :class="{ active: isActive('Home') }"
          name="home"
          index="Home"
          :current-index="$route.name"
        />
        <van-icon v-if="isDark" :class="{ active: isActive('Home') }" name="wap-home-o" />
        <span>{{ $t('nav.home') }}</span>
      </li>
      <li @click="navigateTo('Search')">
        <Icon
          class="icon"
          :class="{ active: isActive('Search') }"
          name="search"
          index="Search"
          :current-index="$route.name"
        />
        <van-icon v-if="isDark" :class="{ active: isActive('Search') }" name="search" />
        <span>{{ $t('nav.search') }}</span>
      </li>
      <li @click="navigateTo('Rank', { type: 'daily' })">
        <Icon
          class="icon"
          :class="{ active: isActive('Rank') }"
          name="rank"
          index="Rank"
          :current-index="$route.name"
        />
        <van-icon v-if="isDark" :class="{ active: isActive('Rank') }" name="bar-chart-o" />
        <span>{{ $t('nav.rank') }}</span>
      </li>
      <li v-if="isLogin" @click="navigateTo('Following')">
        <Icon class="icon" name="following" index="Following" :current-index="$route.name" />
        <van-icon v-if="isDark" :class="{ active: isActive('Following') }" name="star-o" />
        <span>{{ $t('nav.follow') }}</span>
      </li>
      <li class="nav_setting" @click="navigateTo('Setting')">
        <Icon class="icon" name="setting" index="Setting" :current-index="$route.name" />
        <van-icon v-if="isDark" :class="{ active: isActive('Setting') }" name="setting-o" />
        <span>{{ $t('nav.setting') }}</span>
      </li>
      <li v-if="isShowBackTop" class="nav_to_top" @click="scrollToTop()">
        <van-icon name="back-top" size="0.6rem" />
      </li>
      <li v-if="isShowBackTop" class="nav_back" @click="$router.back()">
        <van-icon name="arrow-left" size="0.6rem" />
      </li>
    </ul>
  </div>
</template>

<script>
import { localApi } from '@/api'
import { existsSessionId } from '@/api/user'

export default {
  props: {
    isNavAppear: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      isLogin: localApi.APP_CONFIG.useLocalAppApi || existsSessionId(),
      isShowBackTop: document.documentElement.clientWidth > 1110,
      isDark: !!localStorage.PXV_DARK,
    }
  },
  methods: {
    isActive(name) {
      return this.$route.name.startsWith(name)
    },
    scrollToTop() {
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
    },
    navigateTo(name, params) {
      if (this.$route.name.startsWith(name)) {
        this.scrollToTop()
      } else {
        this.$router.push({ name, params })
      }
    },
  },
}
</script>

<style lang="stylus" scoped>
.nav_to_top, .nav_back
  display none

.nav-container {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100px;
  // height: calc(100px + env(safe-area-inset-bottom));
  z-index: 10;

  opacity: 0;
  transform: translateY(100%);
  transition: 0.2s;

  &.showNav {
    opacity: 1;
    transform: translateY(0);
  }

  .nav-bar {
    display: flex;
    justify-content: space-between;
    // border-radius: .7rem .7rem 0 0;
    box-shadow: 0px 0px 20px #dedede;
    width: 100%;
    // max-width: 750px;
    height: 100%;
    margin: 0 auto;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    backdrop-filter: saturate(200%) blur(10PX);
    background: rgba(255, 255, 255, 0.8);

    li {
      position: relative;
      color: #777;
      font-size: 22px;
      cursor: pointer;
      width: 20%;
      vertical-align: middle;
      text-align: center;
      margin: 0 10px;

      .icon {
        display: block;
        font-size: 50px;
        margin: 0 auto;
        margin-top: 0.1rem;
        margin-bottom 3px
        color: #fffdf7;

        &.active {
          color: #F2C358;
        }
      }
    }
  }
}
</style>
