import Vue from 'vue'
import { Dialog } from '@/lib/vant-apis'
import _ from '@/lib/lodash'
import dayjs from 'dayjs'
import store from '@/store'
import platform from '@/platform'
import { UA_Header, CURRENT_APP_VERSION } from '@/consts'
import { LocalStorage } from '@/utils/storage'
import { HiddenAuthors } from '@/utils/filter'
import { versionGte } from '@/utils'

// 读取已读通知 id 集合；兼容旧的单值格式（纯 id 字符串）
function getReadRec() {
  const raw = localStorage.PXV_NOTICE_READ_REC
  if (raw == null) return []
  try {
    const rec = JSON.parse(raw)
    if (Array.isArray(rec)) return rec.map(String)
    if (rec != null) return [String(rec)]
  } catch (e) {}
  return [String(raw)]
}

function addReadRec(id) {
  const rec = getReadRec()
  const sid = String(id)
  if (!rec.includes(sid)) {
    rec.push(sid)
    localStorage.PXV_NOTICE_READ_REC = JSON.stringify(rec)
  }
}

function showNoticeDialog(notice) {
  const dialog = Dialog.alert({
    width: '8rem',
    className: 'app-notice-dialog',
    title: notice.title,
    message: notice.text,
  })
  // alert 弹窗可能因浏览器返回键关闭而 reject（不写已读），吞掉以保证后续弹窗继续
  dialog.then(() => {
    addReadRec(notice.id)
  }, () => {})
  // 点击消息中的链接（如更新通知的 Release 链接）跳转时，立即写入已读标记，
  // 避免跳转后确认回调不执行，导致下次启动重复弹窗
  Vue.nextTick(() => {
    const message = document.querySelector('.app-notice-dialog .van-dialog__message')
    if (!message) return
    message.addEventListener('click', e => {
      const link = e.target.closest('a')
      if (link && link.closest('.app-notice-dialog')) {
        addReadRec(notice.id)
      }
    })
  })
  return dialog
}

async function setAppNotice(notices, version = {}) {
  const today = dayjs().startOf('day')
  const latestVer = version[platform.current]
  // alert == 'update' 的更新弹窗只面向低于最新版本的客户端，已更新到 version 中的最新版则跳过；
  // alert: true 的普通弹窗不受版本门槛限制
  const actived = notices.filter(e =>
    (e.pnt.length == 0 || e.pnt.includes(platform.current)) &&
    !(e.alert == 'update' && latestVer && versionGte(CURRENT_APP_VERSION, latestVer)) &&
    today.isAfter(dayjs(e.start).startOf('day') - 1) &&
    today.isBefore(dayjs(e.end).endOf('day'))
  )
  console.log('notice: ', actived)
  if (!actived.length) return
  const readRec = getReadRec()
  // 横幅：全部生效的无 alert 通知
  store.commit('setAppNotice', actived.filter(e => !e.alert))
  // 弹窗：未读的 alert 通知串行展示，前一条确认后再弹下一条
  actived
    .filter(e => e.alert && !readRec.includes(String(e.id)))
    .reduce((p, notice) => p.then(() => showNoticeDialog(notice)), Promise.resolve())
  actived.forEach(e => {
    if (e.style) {
      document.head.insertAdjacentHTML('beforeend', `<style>${e.style}</style>`)
    }
    if (e.addClass) {
      document.documentElement.className += e.addClass
    }
    if (Array.isArray(e.randomClass) && e.randomClass.length) {
      document.documentElement.classList.add(_.sample(e.randomClass))
    }
  })
}

async function setSeasonEffects(effects) {
  const today = dayjs().startOf('day')
  const act = effects.filter(e =>
    today.isAfter(dayjs(e.start).startOf('day') - 1) &&
    today.isBefore(dayjs(e.end).endOf('day'))
  )
  console.log('active effects: ', act)
  if (!act) return
  store.commit('setSeasonEffects', act)
}

export async function fetchNotices() {
  try {
    let res = LocalStorage.get('PXV_NOTICES')
    if (!res) {
      const resp = await fetch(`https://pxve-notice.nanoka.top/anon.json?t=${dayjs().format('YYYYMMDD')}`, { headers: UA_Header })
      res = await resp.json()
      LocalStorage.set('PXV_NOTICES', res, 1800)
    }
    const { notices = [], effects = [], version = {}, buids = [], rntm = [], rnta = [], promo = [] } = res
    store.commit('setScPromo', promo)
    setAppNotice(notices, version)
    setSeasonEffects(effects)
    store.commit('addBlockUids', buids)
    store.commit('setScPromo', promo)
    HiddenAuthors.NO_TYPE_MANGA = rntm
    HiddenAuthors.NO_TYPE_AI = rnta
  } catch (err) {
    console.log('err: ', err)
  }
}
