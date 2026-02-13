<template>
  <img :class="{'fadeIn':!loading}" :style="bgStyle" :alt="loading?'':alt" loading="lazy" @load="loading=false">
</template>

<script>
import { randomBg } from '@/utils'

export default {
  name: 'LazyImage',
  props: {
    src: {
      type: String,
      required: true,
    },
    alt: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      loading: true,
    }
  },
  computed: {
    bgStyle() {
      return { background: this.loading ? randomBg() : 'none' }
    },
  },
  watch: {
    src() {
      this.setImgSrc()
    },
  },
  mounted() {
    this.$nextTick(() => {
      requestAnimationFrame(() => {
        this.setObserver()
      })
    })
  },
  methods: {
    setObserver() {
      const options = {
        rootMargin: '0px 50px 50px 0px',
        threshold: [0],
      }
      const ob = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && this.loading) {
          this.setImgSrc()
          ob.disconnect()
        }
      }, options)
      ob.observe(this.$el)
    },
    setImgSrc() {
      this.$el.src = this.src
    },
  },
}
</script>
