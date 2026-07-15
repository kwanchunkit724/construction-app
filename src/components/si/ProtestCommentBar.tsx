import { useState } from 'react'
import { Send } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useSi } from '../../contexts/SiContext'
import { Spinner } from '../Spinner'
import type { SI, ProtestComment, UserProfile } from '../../types'

export interface ProtestCommentBarProps {
  si: SI
  comments: ProtestComment[]
  usersById?: Record<string, UserProfile>
}

function relativeTime(iso: string): string {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diff < 60) return `${diff} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 日前`
  return new Date(iso).toLocaleDateString('zh-HK')
}

export function ProtestCommentBar({ si, comments, usersById = {} }: ProtestCommentBarProps) {
  const { profile } = useAuth()
  const { addProtest } = useSi()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only render when SI is locked (D-14 — protest is post-lock recourse).
  if (si.status !== 'locked') return null

  async function onSend() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const { error: e } = await addProtest(si.id, text)
      if (e) {
        setError(e)
        return
      }
      setBody('')
    } finally {
      setBusy(false)
    }
  }

  const sorted = comments
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs">
        此工地指令已鎖定。如有異議，可在此提交抗議意見 (僅作紀錄)。
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-site-500 py-2 text-center">尚未有抗議意見</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map(c => {
            const author = usersById[c.author_id]
            return (
              <li key={c.id} className="card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-site-900">
                    {author?.name || '未知用戶'}
                  </span>
                  <span className="text-[11px] text-site-400">
                    {relativeTime(c.created_at)}
                  </span>
                </div>
                <p className="text-sm text-site-700 whitespace-pre-wrap break-words">
                  {c.body}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {profile && (
        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="輸入你的抗議意見…"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!body.trim() || busy}
            className="btn-primary inline-flex items-center gap-1 px-3"
            aria-label="提交抗議"
          >
            {busy ? <Spinner size={14} className="text-white" /> : <Send size={16} />}
            <span className="hidden sm:inline">提交</span>
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1">
          {error}
        </p>
      )}
    </div>
  )
}

export default ProtestCommentBar
