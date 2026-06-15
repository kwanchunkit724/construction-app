import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, FileDown, User, Phone, Clock, Hash } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Spinner } from './Spinner'
import { exportSignatureProofPdf } from '../lib/export'
import { PTW_TYPE_ZH, FORM_RESULT_ZH } from '../types'
import type { PtwType, FormSignoffResult } from '../types'

// ── 簽名證明 (本人 proof certificate) — v60 non-repudiation ───────────────────
// Given a single signoff (kind + id), reads get_signature_proof(p_kind,p_id) and
// renders the 本人 proof: WHO signed (verified account + derived phone + role),
// WHICH credential backed it, WHAT was signed, WHEN, the re-auth posture, the
// hash-chain integrity status, and the zh-HK attestation sentence — plus a
// '匯出簽名證明 (PDF)' button that renders the SAME proof object to a jsPDF doc.
// Surfaced on PtwDetail (per permit_signoff) + EquipmentDetail (per form_signoff).

// Mirrors the get_signature_proof return jsonb (supabase/v60-sign-reauth.sql §7).
interface SignatureProof {
  signer: { name: string | null; phone: string | null; role: string | null }
  credential: Record<string, unknown> | null
  what_signed: {
    kind: 'ptw' | 'form'
    doc_id: string
    doc_number: string | null
    project_id: string
    project: string | null
    ptw_type?: string
    template?: string
    result?: string
  }
  signed_at: string | null
  signature_present: boolean
  reauth: { enforced: boolean; method: string }
  tamper_evidence: {
    table: string
    ledger_seq: number | null
    ledger_hash: string | null
    integrity: { intact: boolean; break_at: number | null; reason: string | null; count: number }
  }
  attestation_zh: string
}

// WHAT-line detail string: ptw → 工種 label; form → 表格名 · 結果.
function detailZh(w: SignatureProof['what_signed']): string | null {
  if (w.kind === 'ptw') {
    return w.ptw_type ? (PTW_TYPE_ZH[w.ptw_type as PtwType] ?? w.ptw_type) : null
  }
  const tmpl = w.template ?? ''
  const res = w.result ? (FORM_RESULT_ZH[w.result as FormSignoffResult] ?? w.result) : ''
  return [tmpl, res].filter(Boolean).join(' · ') || null
}

const DOC_KIND_ZH: Record<'ptw' | 'form', string> = {
  ptw: '工作許可證',
  form: '法定表格',
}

export function SignatureProofCard({ kind, signoffId }: { kind: 'ptw' | 'form'; signoffId: string }) {
  const [proof, setProof] = useState<SignatureProof | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    supabase
      .rpc('get_signature_proof', { p_kind: kind, p_id: signoffId })
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e) { setError(e.message); setLoading(false); return }
        setProof(data as SignatureProof)
        setLoading(false)
      })
    return () => { alive = false }
  }, [kind, signoffId])

  async function handleExport() {
    if (!proof) return
    setExporting(true)
    try {
      const ev = proof.tamper_evidence
      await exportSignatureProofPdf({
        kind,
        signerName: proof.signer.name,
        signerPhone: proof.signer.phone,
        signerRoleZh: proof.signer.role,
        credential: proof.credential,
        docNumber: proof.what_signed.doc_number,
        docKindZh: DOC_KIND_ZH[kind],
        projectName: proof.what_signed.project,
        detailZh: detailZh(proof.what_signed),
        signedAt: proof.signed_at,
        reauthEnforced: proof.reauth.enforced,
        reauthMethodZh: proof.reauth.method === 'password' ? '密碼重新驗證' : proof.reauth.method,
        ledgerSeq: ev.ledger_seq,
        ledgerHash: ev.ledger_hash,
        integrityIntact: ev.integrity.intact,
        integrityReason: ev.integrity.reason,
        attestationZh: proof.attestation_zh,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="card p-4 flex items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }

  if (error || !proof) {
    return (
      <div className="card p-4">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          無法載入簽名證明{error ? `：${error}` : ''}
        </p>
      </div>
    )
  }

  const intact = proof.tamper_evidence.integrity.intact
  const detail = detailZh(proof.what_signed)

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-site-900 flex items-center gap-2">
          <ShieldCheck size={16} className="text-safety-500" />
          簽名證明 (本人)
        </h3>
        <span
          className={
            'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ' +
            (intact ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600 border border-red-200')
          }
        >
          {intact ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
          {intact ? '記錄完整' : '記錄異常'}
        </span>
      </div>

      {/* Signer identity */}
      <div className="text-sm text-site-700 space-y-1">
        <p className="flex items-center gap-2">
          <User size={14} className="text-site-400 flex-shrink-0" />
          <span className="font-medium text-site-900">{proof.signer.name ?? '（未知）'}</span>
          {proof.signer.role && <span className="text-[11px] text-site-500">· {proof.signer.role}</span>}
        </p>
        <p className="flex items-center gap-2">
          <Phone size={14} className="text-site-400 flex-shrink-0" />
          <span>{proof.signer.phone ?? '未提供'}</span>
        </p>
        <p className="flex items-center gap-2">
          <Clock size={14} className="text-site-400 flex-shrink-0" />
          <span>
            {proof.signed_at
              ? `${new Date(proof.signed_at).toLocaleString('zh-HK')}（香港時間）`
              : '未知時間'}
          </span>
        </p>
      </div>

      {/* What was signed */}
      <div className="text-[11px] text-site-500 border-t border-site-100 pt-2 space-y-0.5">
        <p>
          {DOC_KIND_ZH[kind]}
          {proof.what_signed.doc_number ? ` · ${proof.what_signed.doc_number}` : ''}
          {detail ? ` · ${detail}` : ''}
        </p>
        {proof.credential && (() => {
          const c = proof.credential as Record<string, any>
          const certNo = c.cert_no ?? c.certNo ?? null
          const type = c.type ?? c.credential_type ?? null
          return (
            <p>
              合資格人士證明：{[type, certNo].filter(Boolean).join(' · ') || '已附帶'}
            </p>
          )
        })()}
        <p className="flex items-center gap-1">
          <Hash size={11} className="flex-shrink-0" />
          帳本序號 {proof.tamper_evidence.ledger_seq ?? '未記錄'}
          {proof.reauth.enforced && ' · 已通過密碼重新驗證'}
        </p>
      </div>

      {/* Attestation */}
      <p className="text-[11px] text-site-600 bg-site-50 border border-site-100 rounded-lg px-2.5 py-2 leading-relaxed">
        {proof.attestation_zh}
      </p>

      {!intact && proof.tamper_evidence.integrity.reason && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          防篡改檢查異常：{proof.tamper_evidence.integrity.reason}
        </p>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="btn-ghost w-full text-sm flex items-center justify-center gap-1.5"
      >
        {exporting ? <Spinner size={16} /> : <FileDown size={16} />}
        匯出簽名證明 (PDF)
      </button>
    </div>
  )
}
