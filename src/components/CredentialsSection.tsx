import { useEffect, useState } from 'react'
import { Award, Plus, BadgeCheck, Clock, Paperclip, FileCheck, X } from 'lucide-react'
import { Spinner } from './Spinner'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchMyCredentials, addMyCredential, uploadCredentialDoc, signCredentialDoc,
  isCredentialValid, CREDENTIAL_TYPE_ZH,
} from '../lib/credentials'
import type { UserCredential } from '../types'

// 合資格人士證明 (qualified-person credentials) on the PERSON, valid across sites
// — mirrors the GreenCardSection precedent on Profile. Owner uploads own
// credentials here; a verified, in-date row matching a form template's
// required_credential is what unlocks the 簽署 button (record_form_signoff
// re-checks server-side). Verification itself is done by admin / PM /
// safety_officer (verify_user_credential RPC) — see VerifyCredentialButton,
// surfaced on the member-management surface, not here.

const CRED_TYPES = Object.keys(CREDENTIAL_TYPE_ZH)

export function CredentialsSection() {
  const { profile } = useAuth()
  const [creds, setCreds] = useState<UserCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  // Add-form state
  const [credType, setCredType] = useState(CRED_TYPES[0])
  const [certName, setCertName] = useState('')
  const [certNo, setCertNo] = useState('')
  const [issuer, setIssuer] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [docPath, setDocPath] = useState<string | null>(null)
  const [docName, setDocName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!profile) return
    setLoading(true)
    setCreds(await fetchMyCredentials(profile.id))
    setLoading(false)
  }

  useEffect(() => { load() }, [profile])

  async function pickDoc(file: File | undefined) {
    if (!file || !profile) return
    setError('')
    setUploading(true)
    const { path, error: e } = await uploadCredentialDoc(file, profile.id)
    setUploading(false)
    if (e || !path) { setError(e || '上載失敗'); return }
    setDocPath(path)
    setDocName(file.name)
  }

  async function submit() {
    if (!profile) return
    setError('')
    setSaving(true)
    const { error: e } = await addMyCredential({
      user_id: profile.id,
      credential_type: credType,
      cert_name_zh: certName,
      cert_no: certNo,
      issuer,
      valid_until: validUntil || null,
      doc_path: docPath,
    })
    setSaving(false)
    if (e) { setError(e); return }
    setCertName(''); setCertNo(''); setIssuer(''); setValidUntil('')
    setDocPath(null); setDocName('')
    setShowAdd(false)
    await load()
  }

  if (!profile) return null

  return (
    <div className="card mt-3 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Award size={16} className="text-site-500" />
        <span className="text-sm font-semibold text-site-900">合資格人士證明</span>
      </div>
      <p className="text-xs text-site-500 mb-3 leading-relaxed">
        上載你的合資格人士證書（如合資格人員 / 驗機師）。由管理員 / PM / 安全主任核實後，你便可在手機簽署相應法定表格。
      </p>

      {loading ? (
        <div className="py-4 flex justify-center"><Spinner size={20} /></div>
      ) : (
        <>
          {creds.length === 0 ? (
            <p className="text-xs text-site-400 bg-site-50 rounded-lg px-3 py-2">未有登記證書</p>
          ) : (
            <div className="space-y-1.5">
              {creds.map(c => {
                const valid = isCredentialValid(c)
                return (
                  <div key={c.id} className="bg-site-50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-site-900 truncate">{c.cert_name_zh}</p>
                      {c.verified_at ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${
                          valid ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
                        }`}>
                          <BadgeCheck size={11} /> {valid ? '已核實' : '已過期'}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                          <Clock size={11} /> 待核實
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-site-500 mt-0.5">
                      {CREDENTIAL_TYPE_ZH[c.credential_type] ?? c.credential_type}
                      {c.cert_no && ` · ${c.cert_no}`}
                      {c.valid_until && ` · 有效至 ${c.valid_until}`}
                    </p>
                    {c.doc_path && <CredentialDocBadge path={c.doc_path} />}
                  </div>
                )
              })}
            </div>
          )}

          {!showAdd ? (
            <button
              onClick={() => { setShowAdd(true); setError('') }}
              className="mt-2 w-full text-sm border border-site-200 text-site-700 hover:bg-site-50 rounded-lg py-2 flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> 上載證書
            </button>
          ) : (
            <div className="mt-2 border border-site-200 rounded-xl p-3 space-y-2">
              <div>
                <label className="text-[11px] font-semibold text-site-500 block mb-1">證書類別</label>
                <select value={credType} onChange={e => setCredType(e.target.value)} className="input">
                  {CRED_TYPES.map(t => (
                    <option key={t} value={t}>{CREDENTIAL_TYPE_ZH[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-site-500 block mb-1">證書名稱 *</label>
                <input value={certName} onChange={e => setCertName(e.target.value)} placeholder="例如：合資格人員證書" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-site-500 block mb-1">證書編號</label>
                  <input value={certNo} onChange={e => setCertNo(e.target.value)} placeholder="(可選)" className="input" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-site-500 block mb-1">到期日</label>
                  <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="input" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-site-500 block mb-1">發證機構</label>
                <input value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="(可選)" className="input" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-site-500 block mb-1">證書檔案（相片 / PDF，可選）</label>
                {docPath ? (
                  <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-lg px-3 py-2 text-xs">
                    <FileCheck size={14} className="shrink-0" />
                    <span className="truncate flex-1">已上載：{docName}</span>
                    <button
                      type="button"
                      onClick={() => { setDocPath(null); setDocName('') }}
                      className="shrink-0 text-site-400 hover:text-site-700"
                      aria-label="移除檔案"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-1.5 text-sm border border-site-200 text-site-700 rounded-lg py-2 cursor-pointer ${
                    uploading ? 'opacity-60 pointer-events-none' : 'hover:bg-site-50'
                  }`}>
                    {uploading ? <Spinner size={14} /> : <Paperclip size={14} />}
                    {uploading ? '上載中…' : '選擇檔案'}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => { pickDoc(e.target.files?.[0]); e.target.value = '' }}
                    />
                  </label>
                )}
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{error}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowAdd(false); setError('') }}
                  className="flex-1 text-sm border border-site-200 text-site-700 hover:bg-site-50 rounded-lg py-2"
                >
                  取消
                </button>
                <button
                  onClick={submit}
                  disabled={saving || uploading}
                  className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5"
                >
                  {saving ? <Spinner size={14} className="text-white" /> : null}
                  上載
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// "已上載證明" indicator for a stored credential doc. Resolves the storage path
// to a short-lived signed URL; shows a thumbnail for images, a link for PDFs.
function CredentialDocBadge({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const isPdf = /\.pdf$/i.test(path)

  useEffect(() => {
    let alive = true
    signCredentialDoc(path).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path])

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 inline-flex items-center gap-1">
        <FileCheck size={11} /> 已上載證明
      </span>
      {url && !isPdf && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="證明" className="h-9 w-9 rounded object-cover border border-site-200" />
        </a>
      )}
      {url && isPdf && (
        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700 underline inline-flex items-center gap-1">
          <Paperclip size={11} /> 查看 PDF
        </a>
      )}
    </div>
  )
}
