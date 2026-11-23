import { useEffect, useRef, useState } from 'react'
import { BookOpen, ExternalLink, Globe, LoaderCircle, Search } from 'lucide-react'
import type { OnlineBookPreview, OnlineSourceId } from '@shared/types'
import { ONLINE_SOURCES } from '@shared/online'

interface Props { onOpen: (bookId: string) => void; onLibraryChanged: () => Promise<unknown> }
export function OnlineLibraryView({ onOpen, onLibraryChanged }: Props): React.JSX.Element {
  const [source, setSource] = useState<OnlineSourceId>('biquge')
  const [query, setQuery] = useState('')
  const [books, setBooks] = useState<OnlineBookPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef(0)
  const provider = ONLINE_SOURCES.find((s) => s.id === source)!

  const discover = async (selected: OnlineSourceId, search = ''): Promise<void> => {
    const ticket = ++request.current
    setLoading(true); setError(''); setNotice(''); setBooks([])
    try {
      const results = await window.readex.online.discover(selected, search)
      if (request.current === ticket) { setBooks(results.books); setNotice(results.notice ?? '') }
    } catch (e) { if (request.current === ticket) setError(e instanceof Error ? e.message : '在线书库加载失败') }
    finally { if (request.current === ticket) setLoading(false) }
  }

  useEffect(() => {
    void discover(source)
    return () => { request.current++ }
  }, [source])

  const open = async (url: string): Promise<void> => {
    if (opening) return
    setOpening(url); setError('')
    try {
      const book = await window.readex.online.add(url.trim())
      await onLibraryChanged()
      onOpen(book.id)
    } catch (e) { setError(e instanceof Error ? e.message : '书籍加载失败') }
    finally { setOpening(null) }
  }
  const submit = (): void => {
    if (/^https?:\/\//i.test(query.trim())) void open(query)
    else void discover(source, query)
  }

  return <main className="library-view online-library">
    <header className="library-header">
      <div><p className="eyebrow">在线阅读</p><h1>在线书库</h1>
        <p className="library-subtitle">选择书源，搜索书名或作者，也可以直接粘贴书籍链接。读过的章节会保存在本机。</p></div>
      <button className="secondary-button" type="button" onClick={() => void window.readex.system.openExternal(provider.url)}><ExternalLink size={16} />打开原站</button>
    </header>
    <div className="online-source-tabs" role="group" aria-label="选择在线书源">
      {ONLINE_SOURCES.map((p) => <button className={`secondary-button ${p.id === source ? 'active' : ''}`} type="button" key={p.id} onClick={() => { setQuery(''); setSource(p.id) }}><Globe size={16}/>{p.name}</button>)}
    </div>
    <form className="online-search" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label className="search-field"><Search size={17}/><input aria-label="搜索在线书籍或粘贴链接" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`在${provider.name}搜索，或粘贴书籍链接`} maxLength={200}/></label>
      <button className="primary-button" type="submit" disabled={loading || !!opening}>{opening ? '正在读取目录…' : '搜索 / 打开'}</button>
    </form>
    {notice && <p className="online-notice" role="status">{notice}</p>}
    {error && <div className="online-error" role="alert"><p>{error}</p><button className="secondary-button" type="button" onClick={submit} disabled={loading || !!opening}>重试</button></div>}
    {loading ? <div className="online-empty" role="status"><LoaderCircle size={24} className="spin"/><p>正在连接{provider.name}…</p></div> : <>
      <div className="online-list-heading"><h2>{query ? '搜索结果' : '网站推荐'}</h2><span>{books.length} 本</span></div>
      {!books.length && !error && <div className="online-empty"><BookOpen size={30}/><p>暂时没有找到书籍，换个关键词或粘贴书籍链接试试。</p></div>}
      <div className="online-book-grid">{books.map((book) => <article className="online-book-card" key={book.url}>
        <div className="online-book-mark"><BookOpen size={24}/></div>
        <div><h2>{book.title}</h2><p className="online-author">{book.author || provider.name}</p>{book.description && <p className="online-description">{book.description}</p>}</div>
        <button className="secondary-button" type="button" disabled={!!opening} onClick={() => void open(book.url)}>{opening === book.url ? '读取完整目录…' : '加入书库并阅读'}</button>
      </article>)}</div>
    </>}
  </main>
}
