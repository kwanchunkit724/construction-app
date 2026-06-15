import { supabase } from './supabase'
import type { PTW, PtwType, PtwStatus, PtwChecklistItem } from '../types'

// Reuses Plan 02-01's private project-si-vo bucket. RLS gates by
// project membership via storage.foldername(name)[1]::uuid = project_id,
// which works equally for PTW. Path scheme:
//   {project_id}/ptw/{ptw_id}/v{n}/ppe/{filename}
//   {project_id}/ptw/{ptw_id}/v{n}/scene/{filename}
//   {project_id}/ptw/{ptw_id}/workers/{worker_id}/photo.jpg
const BUCKET = 'project-si-vo'

function ptwBase(projectId: string, ptwId: string, versionNo: number): string {
  return `${projectId}/ptw/${ptwId}/v${versionNo}`
}

function ptwWorkerBase(projectId: string, ptwId: string, workerId: string): string {
  return `${projectId}/ptw/${ptwId}/workers/${workerId}`
}

export async function uploadPpePhotos(
  projectId: string,
  ptwId: string,
  versionNo: number,
  files: File[],
): Promise<{ paths: string[]; error: string | null }> {
  return uploadPtwImages(projectId, ptwId, versionNo, files, 'ppe')
}

export async function uploadScenePhotos(
  projectId: string,
  ptwId: string,
  versionNo: number,
  files: File[],
): Promise<{ paths: string[]; error: string | null }> {
  return uploadPtwImages(projectId, ptwId, versionNo, files, 'scene')
}

async function uploadPtwImages(
  projectId: string,
  ptwId: string,
  versionNo: number,
  files: File[],
  subfolder: 'ppe' | 'scene',
): Promise<{ paths: string[]; error: string | null }> {
  const out: string[] = []
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      return { paths: out, error: '相片大過 10 MB，請壓縮後再上載' }
    }
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const path = `${ptwBase(projectId, ptwId, versionNo)}/${subfolder}/${safe}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, f, { cacheControl: '3600', upsert: false, contentType: f.type })
    if (error) return { paths: out, error: error.message }
    out.push(path)
  }
  return { paths: out, error: null }
}

export async function uploadWorkerPhoto(
  projectId: string,
  ptwId: string,
  workerId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  if (file.size > 5 * 1024 * 1024) {
    return { path: null, error: '工人相片大過 5 MB，請壓縮後再上載' }
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${ptwWorkerBase(projectId, ptwId, workerId)}/photo.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function signedUrlFor(path: string, ttlSeconds = 900): Promise<string | null> {
  // PTW photos use shorter TTL (15min) than SI/VO (1h). RESEARCH §"Phase 3 — PTW"
  // mandates 15min for PTW photos.
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export function validatePtwPath(projectId: string, path: string): boolean {
  return path.startsWith(`${projectId}/ptw/`)
}

// ── Checklist templates per PTW type (zh-HK) ──────────────
// Source: HK Labour Department CoP excerpts + RESEARCH ARCHITECTURE.md
// notes. Operator-editable in admin UI in a future plan; v1 is hard-coded.
export function checklistTemplate(ptwType: PtwType): PtwChecklistItem[] {
  switch (ptwType) {
    case 'hot_work':
      return [
        { key: 'fire_extinguisher', label_zh: '滅火器就位 (4.5 kg ABC 級或以上)', required: true, value: null },
        { key: 'fire_watcher', label_zh: '指定火警監察員在場', required: true, value: null },
        { key: 'combustibles_cleared', label_zh: '工作範圍 11 米內無可燃物', required: true, value: null },
        { key: 'shielding', label_zh: '火花擋板/防火氈鋪設妥當', required: true, value: null },
        { key: 'ventilation', label_zh: '通風良好 / 排氣設備運作', required: true, value: null },
        { key: 'gas_test', label_zh: '可燃氣體濃度測試合格 (< 10% LEL)', required: false, value: null },
      ]
    case 'work_at_height':
      return [
        { key: 'fall_arrest', label_zh: '個人防墮裝置 (全身式安全帶 + 雙鈎索)', required: true, value: null },
        { key: 'anchor_point', label_zh: '掛鈎點認可 (承重 ≥ 22 kN)', required: true, value: null },
        { key: 'edge_protection', label_zh: '工作面有防墮欄杆/網', required: true, value: null },
        { key: 'wind_speed', label_zh: '風速 < 10 m/s (棚架/吊籃)', required: true, value: null },
        { key: 'weather', label_zh: '天氣許可 (無雷暴/黃黑雨警告)', required: true, value: null },
        { key: 'access', label_zh: '上落通道 (梯/棚架) 認可', required: true, value: null },
      ]
    case 'lifting':
      return [
        { key: 'lifting_plan', label_zh: '吊運計劃書 (LAW Form 1 等) 已批准', required: true, value: null },
        { key: 'crane_cert', label_zh: '吊機定期檢驗證書有效 (CHIT/CN1)', required: true, value: null },
        { key: 'lifting_gear', label_zh: '吊具/索具有效檢驗', required: true, value: null },
        { key: 'rigger_cert', label_zh: '掛索工人持有效證書 (CE-Rigger)', required: true, value: null },
        { key: 'load_zone', label_zh: '吊運範圍下方無無關人員', required: true, value: null },
        { key: 'signaller', label_zh: '指定信號員 (Banksman) 在場', required: true, value: null },
        { key: 'wind_check', label_zh: '風速核實 (< 9.7 m/s/塔吊製造商上限)', required: true, value: null },
      ]
    case 'confined_space':
      return [
        { key: 'gas_test', label_zh: '氣體測試合格 (O2 19.5–23%、H2S、CO、LEL <10%)', required: true, value: null },
        { key: 'continuous_ventilation', label_zh: '連續強制通風運作中', required: true, value: null },
        { key: 'tripod_rescue', label_zh: '三腳架 + 救生繩 + 絞盤就位', required: true, value: null },
        { key: 'standby_man', label_zh: '坑外監察員 (standby man) 在場', required: true, value: null },
        { key: 'permit_gas_record', label_zh: '進入許可證 + 氣體記錄表備妥', required: true, value: null },
        { key: 'emergency_rescue', label_zh: '緊急救援安排已部署', required: true, value: null },
        { key: 'entry_log', label_zh: '進出人數登記制度', required: true, value: null },
      ]
    case 'excavation':
      return [
        { key: 'utility_detection', label_zh: '地下管線探測 (電/水/氣/電訊)', required: true, value: null },
        { key: 'shoring', label_zh: '護土板/斜坡支撐 (深 > 1.2 米)', required: true, value: null },
        { key: 'edge_clear', label_zh: '坑邊 1 米內不堆放物料', required: true, value: null },
        { key: 'access_ladder', label_zh: '上落梯級妥當', required: true, value: null },
        { key: 'banksman', label_zh: '人車分隔 + 指揮員在場', required: true, value: null },
        { key: 'dewatering', label_zh: '積水/排水安排妥當', required: true, value: null },
        { key: 'slope_monitoring', label_zh: '邊坡監測安排', required: true, value: null },
      ]
    // Stubs — picker shows these types with '敬請期待' label.
    case 'electrical':
    case 'scaffold':
      return []
    default:
      return []
  }
}

// ── Client-side derived expiry ─────────────────────────────
// No cron flips an over-time 'active' permit to 'expired'. Until one
// exists, derive expiry on the client so an expired permit never reads
// 生效中 with a valid QR (a real safety hole). Display-only — the stored
// status column is left untouched.
export function isPtwExpired(p: PTW): boolean {
  if (p.status !== 'active' || !p.expires_at) return false
  return Date.parse(p.expires_at) < Date.now()
}

// Status to display: 'expired' when an active permit is past expiry,
// otherwise the stored status verbatim.
export function effectivePtwStatus(p: PTW): PtwStatus {
  return isPtwExpired(p) ? 'expired' : p.status
}

// ── Helpers for status transitions ──
export function canSubmitPtw(p: PTW): boolean {
  return p.status === 'draft' || p.status === 'revision_requested'
}

export function canCloseOutPtw(p: PTW): boolean {
  return p.status === 'active'
}

export function hotWorkFireWatchEligible(p: PTW): boolean {
  if (p.ptw_type !== 'hot_work') return true
  if (!p.fire_watch_started_at) return false
  const startedMs = Date.parse(p.fire_watch_started_at)
  return Date.now() - startedMs >= 30 * 60 * 1000
}

export function remainingFireWatchSeconds(p: PTW): number {
  if (p.ptw_type !== 'hot_work' || !p.fire_watch_started_at) return -1
  const startedMs = Date.parse(p.fire_watch_started_at)
  const elapsed = (Date.now() - startedMs) / 1000
  const remaining = 30 * 60 - elapsed
  return Math.max(0, Math.floor(remaining))
}
