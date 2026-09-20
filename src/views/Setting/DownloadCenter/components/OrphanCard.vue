<template>
  <div class="orphan-card">
    <div class="orphan-card__icon">
      <van-icon :name="iconName" />
    </div>
    <div class="orphan-card__body">
      <div class="orphan-card__title">{{ orphan.name }}</div>
      <div class="orphan-card__meta num">{{ metaText }}</div>
    </div>
    <div class="orphan-card__actions">
      <van-button size="mini" type="info" plain round @click="$emit('claim')">{{ $t('dlc.claim') }}</van-button>
      <van-button size="mini" type="danger" plain round @click="$emit('delete')">{{ $t('dlc.delete') }}</van-button>
    </div>
  </div>
</template>

<script>
import dayjs from 'dayjs'
import { formatBytes } from '@/utils'

const KIND_ICONS = {
  image: 'photo-o',
  video: 'video-o',
  ugoira: 'bulb-o',
  novel: 'notes-o',
  epub: 'bookmark-o',
  backup: 'description',
}

export default {
  name: 'OrphanCard',
  props: {
    orphan: {
      type: Object,
      required: true,
    },
  },
  computed: {
    iconName() {
      return KIND_ICONS[this.orphan.kind] || 'description'
    },
    metaText() {
      const parts = []
      if (this.orphan.size) parts.push(formatBytes(this.orphan.size))
      if (this.orphan.mtime) parts.push(dayjs(this.orphan.mtime).format('YYYY-MM-DD HH:mm'))
      return parts.join(' · ')
    },
  },
}
</script>

<style lang="stylus" scoped>
.orphan-card
  display flex
  align-items center
  padding 0.16rem 0.4rem

  &__icon
    flex none
    width 0.6rem
    height 0.6rem
    margin-right 0.2rem
    display flex
    align-items center
    justify-content center
    color #c8c9cc
    font-size 0.36rem

  &__body
    flex 1
    min-width 0

  &__title
    font-size 0.26rem
    color #646566
    overflow hidden
    text-overflow ellipsis
    white-space nowrap

  &__meta
    margin-top 0.04rem
    font-size 0.24rem
    color #c8c9cc
    font-variant-numeric tabular-nums

  &__actions
    display flex
    gap 0.12rem
    flex none
    margin-left 0.16rem

.dark .orphan-card
  &__title
    color #aaa

  &__meta
    color #666
</style>
