import type { OnlineSourceId } from './types'

export const ONLINE_SOURCES: { id: OnlineSourceId; name: string; url: string }[] = [
  { id: 'biquge', name: '笔趣阁', url: 'https://www.biquge.tw/' },
  { id: 'ixdzs', name: '爱下电子书', url: 'https://ixdzs8.com/' }
]

export function onlineSourceName(source: OnlineSourceId): string {
  return ONLINE_SOURCES.find((item) => item.id === source)?.name ?? source
}

/** Only the two configured providers can be requested by the main process. */
export function onlineUrl(value: string, base?: string): URL {
  const url = new URL(value, base)
  if (url.protocol === 'http:') url.protocol = 'https:'
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('请使用支持网站的 HTTPS 书籍链接')
  }
  if (['biquge.tw', 'www.biquge.tw', 'm.biquge.tw'].includes(url.hostname)) {
    url.hostname = 'www.biquge.tw'
  } else if (['ixdzs8.com', 'www.ixdzs8.com'].includes(url.hostname)) {
    url.hostname = 'ixdzs8.com'
  } else {
    throw new Error('目前仅支持 www.biquge.tw 和 ixdzs8.com')
  }
  url.hash = ''
  return url
}

export function onlineSource(value: string): OnlineSourceId {
  return onlineUrl(value).hostname === 'www.biquge.tw' ? 'biquge' : 'ixdzs'
}

export function onlineBookUrl(value: string): string {
  const url = onlineUrl(value)
  const match = url.hostname === 'ixdzs8.com'
    ? /^\/read\/(\d+)(?:\/|$)/.exec(url.pathname)
    : /^\/book\/(\d+)(?:\.html|\/|$)/.exec(url.pathname)
  if (!match) throw new Error('请粘贴书籍详情、目录或章节页面的链接')
  url.pathname = url.hostname === 'ixdzs8.com' ? `/read/${match[1]}/` : `/book/${match[1]}.html`
  url.search = ''
  return url.href
}
