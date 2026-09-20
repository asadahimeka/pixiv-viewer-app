<template>
  <div class="active-task">
    <div class="active-task__icon">
      <van-icon :name="statusIcon" :class="{ spinning: isDownloading }" />
    </div>
    <div class="active-task__body">
      <div class="active-task__title">{{ baseName }}</div>
      <van-progress
        v-if="hasProgress"
        :percentage="percent"
        :show-pivot="false"
        stroke-width="4"
        class="active-task__bar"
      />
      <div class="active-task__meta num">{{ statusText }}</div>
    </div>
    <van-button
      size="mini"
      plain
      round
      :disabled="task.status == 'canceling'"
      @click="$emit('cancel')"
    >
      {{ $t('dlc.cancel') }}
    </van-button>
  </div>
</template>

<script>
import { formatBytes } from '@/utils'

export default {
  name: 'ActiveTaskCard',
  props: {
    task: {
      type: Object,
      required: true,
    },
  },
  computed: {
    baseName() {
      return String(this.task.fileName || '').split('/').pop()
    },
    isDownloading() {
      return this.task.status == 'downloading'
    },
    statusIcon() {
      if (this.task.status == 'queued') return 'clock-o'
      if (this.task.status == 'canceling') return 'close'
      return 'photo-o'
    },
    hasProgress() {
      return (this.task.status == 'downloading' || this.task.status == 'postprocess') && this.task.total > 0
    },
    percent() {
      if (!this.task.total) return 0
      return Math.min(99, Math.round(this.task.received / this.task.total * 100))
    },
    statusText() {
      switch (this.task.status) {
        case 'queued':
          return this.$t('dlc.queued')
        case 'downloading':
          return this.task.total > 0
            ? `${this.percent}% · ${formatBytes(this.task.received)} / ${formatBytes(this.task.total)}`
            : `${formatBytes(this.task.received)}`
        case 'postprocess':
          return this.$t('dlc.postprocess')
        case 'canceling':
          return this.$t('dlc.canceling')
        default:
          return ''
      }
    },
  },
}
</script>

<style lang="stylus" scoped>
.active-task
  display flex
  align-items center
  padding 0.26rem 0.4rem
  background #fff
  border-radius 0.16rem
  margin 0 0.32rem 0.2rem

  &__icon
    flex none
    width 0.68rem
    height 0.68rem
    margin-right 0.24rem
    display flex
    align-items center
    justify-content center
    color var(--accent-color, #f2c358)
    font-size 0.4rem

    .spinning
      animation dl-spin 1.4s linear infinite

  &__body
    flex 1
    min-width 0
    margin-right 0.16rem

  &__title
    font-size 0.28rem
    font-weight 600
    color #323233
    overflow hidden
    text-overflow ellipsis
    white-space nowrap

  &__bar
    margin-top 0.12rem
    background #f0f0f0

  &__meta
    margin-top 0.08rem
    font-size 0.24rem
    color #969799
    font-variant-numeric tabular-nums

.dark .active-task
  background #2c2c2e

  &__title
    color #fff

@keyframes dl-spin
  from
    transform rotate(0deg)
  to
    transform rotate(360deg)
</style>
