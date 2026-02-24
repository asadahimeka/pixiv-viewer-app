import axios from 'axios'
import nprogress from 'nprogress'
import { BASE_API_URL, UA_Header } from '@/consts'
import platform from '@/platform'
import { retry } from '@/utils'
import { localApi } from '.'

axios.defaults.baseURL = BASE_API_URL
axios.defaults.timeout = 20000
axios.defaults.headers.post['Content-Type'] = 'application/json'

if (platform.isCapacitor) {
  axios.defaults.headers.common['User-Agent'] = UA_Header['User-Agent']
  axios.defaults.headers.common.Origin = 'https://localhost'
}

axios.interceptors.request.use(config => {
  nprogress.start()
  return config
})

axios.interceptors.response.use(
  res => {
    nprogress.done()
    return res
  },
  err => {
    nprogress.done()
    return Promise.reject(err)
  }
)

export async function get(url, params = {}, config = {}) {
  console.log('=== get: ', url, params)
  try {
    const res = await retry(async () => {
      let resp
      if (localApi.APP_CONFIG.useLocalAppApi && url.startsWith('/')) {
        resp = await localApi.actionMap[url]({ query: params, ...config })
        return resp
      }
      resp = await axios.get(url, { params, ...config })
      return resp.data
    })

    console.log('=== get res: ', res)
    return res
  } catch (error) {
    console.error('=== get error: ', error)
    return { error }
  }
}
