import { useEffect, useRef, useState } from 'react'
import { Bot, Send, User, Loader2, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// 助理 (AI 站長) chat panel.
// Phase 1: read-only Q&A (streams from the ai-assistant Edge Function over SSE).
// Phase 2: mutate tools land as a confirm card — the function PROPOSES a write
// (proposed_action) and stops; the user taps 確認 and we round-trip back with
// {action_id, tool_use_id, args_hash} so the function executes it as the user
// (RLS-bounded) and streams the reply. Args are stored server-side, so the
// confirm can only run the exact action shown on the card.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`

type ChatMsg = { role: 'user' | 'assistant'; text: string }
type ApiMsg = { role: 'user' | 'assistant'; content: any }
type Pending = { action_id: string; tool_use_id: string; args_hash: string; summary: string; risk: string; assistant_content: any }

const TOOL_ZH: Record<string, string> = {
  get_progress_tree: '查緊進度表…', get_timetable_window: '睇緊時間表…', list_materials: '查緊物料…',
  list_open_issues: '查緊問題…', search_documents: '搵緊文件…', get_document_link: '攞緊文件連結…',
  list_pending_reviews: '查緊待審批…', list_contacts: '查緊聯絡人…', get_dailies: '查緊施工日誌…',
}

const RISK_BADGE: Record<string, { cls: string; label: string }> = {
  low: { cls: 'bg-site-100 text-site-600', label: '一般' },
  medium: { cls: 'bg-blue-50 text-blue-700', label: '需要確認' },
  high: { cls: 'bg-amber-100 text-amber-700', label: '需要確認' },
  destructive: { cls: 'bg-red-50 text-red-600', label: '不可還原' },
}

export function AssistantPanel({ projectId }: { projectId: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const api = useRef<ApiMsg[]>([])           // authoritative API history (incl. assistant tool_use turns)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, status, pending])

  // Run one request/response stream. Returns the assistant text streamed this turn,
  // and whether a mutate action was proposed (so the caller knows not to commit
  // the assistant turn to api history yet).
  async function runStream(body: object): Promise<{ text: string; proposed: boolean }> {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) throw new Error('未登入')
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) {
      const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(e.error || `HTTP ${res.status}`)
    }
    let text = ''
    let proposed = false
    setMsgs(cur => [...cur, { role: 'assistant', text: '' }])   // fresh bubble for this turn
    await readSse(res.body, (event, data) => {
      if (event === 'text') {
        text += data.delta ?? ''
        setMsgs(cur => { const n = [...cur]; const last = n[n.length - 1]; if (last?.role === 'assistant') last.text = text; return n })
        setStatus(null)
      } else if (event === 'tool') {
        setStatus(TOOL_ZH[data.name] ?? (data.status === 'executing' ? '執行緊…' : '處理緊…'))
      } else if (event === 'proposed_action') {
        proposed = true
        setPending({ action_id: data.action_id, tool_use_id: data.tool_use_id, args_hash: data.args_hash, summary: data.summary, risk: data.risk, assistant_content: data.assistant_content })
        setStatus(null)
      } else if (event === 'action_result') {
        if (!data.ok) setError('動作執行失敗：' + (data.result?.error ?? ''))
      } else if (event === 'error') {
        setError(data.message || '出錯')
      }
    })
    // drop an empty trailing assistant bubble (e.g. a pure-proposal turn with no lead-in text)
    setMsgs(cur => (cur[cur.length - 1]?.role === 'assistant' && !cur[cur.length - 1].text ? cur.slice(0, -1) : cur))
    return { text, proposed }
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput(''); setError(null); setPending(null)
    setMsgs(cur => [...cur, { role: 'user', text }])
    api.current.push({ role: 'user', content: text })
    setBusy(true); setStatus(null)
    try {
      const { text: out, proposed } = await runStream({ project_id: projectId, messages: api.current })
      if (!proposed && out) api.current.push({ role: 'assistant', content: out })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMsgs(cur => (cur[cur.length - 1]?.role === 'assistant' && !cur[cur.length - 1].text ? cur.slice(0, -1) : cur))
    } finally { setBusy(false); setStatus(null) }
  }

  async function confirmAction() {
    if (!pending || busy) return
    const p = pending
    setPending(null); setBusy(true); setError(null)
    // replay the assistant turn that carried the tool_use, then ask the function to execute it
    api.current.push({ role: 'assistant', content: p.assistant_content })
    try {
      const { text: out, proposed } = await runStream({
        project_id: projectId, messages: api.current,
        confirm: { action_id: p.action_id, tool_use_id: p.tool_use_id, args_hash: p.args_hash },
      })
      if (!proposed && out) api.current.push({ role: 'assistant', content: out })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false); setStatus(null) }
  }

  function cancelAction() {
    setPending(null)
    setMsgs(cur => [...cur, { role: 'assistant', text: '好，唔做住。' }])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] md:h-[calc(100vh-12rem)]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {msgs.length === 0 && (
          <div className="card p-6 text-center">
            <Bot size={32} className="mx-auto text-safety-500 mb-2" />
            <p className="text-sm font-semibold text-site-900">AI 站長</p>
            <p className="text-xs text-site-500 mt-1">問我或者叫我做嘢，例如「邊啲工序落後?」「俾我天面最新嘅圖紙」「聽朝 9 點加個地盤巡查」「落單叫 50 包英泥」。</p>
            <p className="text-[10px] text-site-400 mt-2">只會見到/做到你有權嘅嘢。改動會先彈確認卡。</p>
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
        {pending && (
          <div className="ml-9 card p-3 border-safety-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-site-700">確認動作</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${(RISK_BADGE[pending.risk] ?? RISK_BADGE.medium).cls}`}>{(RISK_BADGE[pending.risk] ?? RISK_BADGE.medium).label}</span>
            </div>
            <p className="text-sm text-site-900 mb-2.5">{pending.summary}</p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 py-2 text-sm" onClick={confirmAction} disabled={busy}><Check size={16} className="inline mr-1" />確認</button>
              <button className="btn-ghost flex-1 py-2 text-sm" onClick={cancelAction} disabled={busy}><X size={16} className="inline mr-1" />取消</button>
            </div>
          </div>
        )}
        {status && <div className="text-xs text-site-400 pl-9 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />{status}</div>}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠ {error}</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-site-200 pt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder={pending ? '請先確認或取消上面嘅動作' : '問 AI 站長…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={busy || !!pending}
        />
        <button className="btn-primary px-4" onClick={send} disabled={busy || !!pending || !input.trim()} aria-label="傳送">
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
