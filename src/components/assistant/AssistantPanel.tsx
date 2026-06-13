import { useEffect, useRef, useState } from 'react'
import { Bot, Send, User, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// 助理 (AI 站長) chat panel — Phase 1 (read-only). Streams from the
// `ai-assistant` Edge Function over SSE (raw fetch + ReadableStream, NOT
// supabase.functions.invoke which buffers). The function runs the tool loop
// as the user, so answers are RLS-bounded to what they may see.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`

type ChatMsg = { role: 'user' | 'assistant'; text: string; tools?: string[] }

const TOOL_ZH: Record<string, string> = {
  get_progress_tree: '查緊進度表…', get_timetable_window: '睇緊時間表…', list_materials: '查緊物料…',
  list_open_issues: '查緊問題…', search_documents: '搵緊文件…', get_document_link: '攞緊文件連結…',
  list_pending_reviews: '查緊待審批…', list_contacts: '查緊聯絡人…', get_dailies: '查緊施工日誌…',
}

export function AssistantPanel({ projectId }: { projectId: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, status])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setError(null)
    const history = [...msgs, { role: 'user' as const, text }]
    setMsgs([...history, { role: 'assistant', text: '' }])
    setBusy(true)
    setStatus(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) throw new Error('未登入')
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          messages: history.map(m => ({ role: m.role, content: m.text })),
        }),
      })
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(e.error || `HTTP ${res.status}`)
      }
      await readSse(res.body, (event, data) => {
        if (event === 'text') {
          setMsgs(cur => {
            const next = [...cur]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') last.text += data.delta ?? ''
            return next
          })
          setStatus(null)
        } else if (event === 'tool') {
          setStatus(TOOL_ZH[data.name] ?? '處理緊…')
        } else if (event === 'error') {
          setError(data.message || '出錯')
        } else if (event === 'done') {
          setStatus(null)
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // drop the empty assistant bubble on hard failure
      setMsgs(cur => (cur[cur.length - 1]?.role === 'assistant' && !cur[cur.length - 1].text ? cur.slice(0, -1) : cur))
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] md:h-[calc(100vh-12rem)]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {msgs.length === 0 && (
          <div className="card p-6 text-center">
            <Bot size={32} className="mx-auto text-safety-500 mb-2" />
            <p className="text-sm font-semibold text-site-900">AI 站長</p>
            <p className="text-xs text-site-500 mt-1">問我地盤嘅嘢，例如「邊啲工序落後?」「有咩料未到?」「俾我天面最新嘅圖紙」。</p>
            <p className="text-[10px] text-site-400 mt-2">只會見到你有權睇嘅資料。Phase 1：暫時淨係讀取。</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-safety-500 text-white flex items-center justify-center flex-shrink-0"><Bot size={15} /></div>}
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-safety-500 text-white' : 'bg-white border border-site-200 text-site-900'}`}>
              {m.text || (busy && i === msgs.length - 1 ? <Loader2 size={15} className="animate-spin text-site-400" /> : '')}
            </div>
            {m.role === 'user' && <div className="w-7 h-7 rounded-full bg-site-200 text-site-600 flex items-center justify-center flex-shrink-0"><User size={15} /></div>}
          </div>
        ))}
        {status && <div className="text-xs text-site-400 pl-9 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />{status}</div>}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠ {error}</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-site-200 pt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder="問 AI 站長…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={busy}
        />
        <button className="btn-primary px-4" onClick={send} disabled={busy || !input.trim()} aria-label="傳送">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}

async function readSse(body: ReadableStream<Uint8Array>, on: (event: string, data: any) => void) {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let event = 'message'
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim()
        if (raw) { try { on(event, JSON.parse(raw)) } catch { /* keepalive */ } }
      } else if (line === '') event = 'message'
    }
  }
}
