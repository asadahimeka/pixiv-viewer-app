import { Dialog } from 'vant'
import _ from '@/lib/lodash'
import dayjs from 'dayjs'
import store from '@/store'
import platform from '@/platform'
import { UA_Header } from '@/consts'
import { LocalStorage } from '@/utils/storage'
import { HiddenAuthors } from '@/utils/filter'

async function setAppNotice(notices) {
  const today = dayjs().startOf('day')
  const notice = notices.filter(e => e.pnt.length == 0 || e.pnt.includes(platform.current)).find(e =>
    today.isAfter(dayjs(e.start).startOf('day') - 1) &&
    today.isBefore(dayjs(e.end).endOf('day'))
  )
  console.log('notice: ', notice)
  if (!notice) return
  if (!notice.alert) {
    store.commit('setAppNotice', notice)
  } else if (localStorage.PXV_NOTICE_READ_REC != notice.id) {
    Dialog.alert({
      width: '8rem',
      title: notice.title,
      message: notice.text,
    }).then(() => {
      localStorage.PXV_NOTICE_READ_REC = notice.id
    })
  }
  if (notice.style) {
    document.head.insertAdjacentHTML('beforeend', `<style>${notice.style}</style>`)
  }
  if (notice.addClass) {
    document.documentElement.className += notice.addClass
  }
  if (Array.isArray(notice.randomClass) && notice.randomClass.length) {
    document.documentElement.classList.add(_.sample(notice.randomClass))
  }
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
      LocalStorage.set('PXV_NOTICES', res, 3600)
    }
    const { notices = [], effects = [], buids = [], rntm = [], rnta = [] } = res
    setAppNotice(notices)
    setSeasonEffects(effects)
    store.commit('addBlockUids', buids)
    HiddenAuthors.NO_TYPE_MANGA = rntm
    HiddenAuthors.NO_TYPE_AI = rnta
  } catch (err) {
    console.log('err: ', err)
  }
}
