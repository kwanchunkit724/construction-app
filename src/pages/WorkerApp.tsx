import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, Camera, AlertTriangle, ChevronLeft,
  MapPin, Clock, HardHat, Phone, Mic, LogOut, Plus, Shield, Loader2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIssues } from '../context/IssueContext'
import { useProgress } from '../context/ProgressContext'
import { useSafety } from '../context/SafetyContext'
import { uploadFile, issuePhotoPath } from '../lib/storage'

const todayTask = {
  zone: 'Zone C — 主樓結構',
  floor: '28–30/F A區',
  work: '樓板鋼筋綁紮',
  detail: '按圖則 STR-C-28-001 Rev.C 綁紮樓板鋼筋，間距 150mm，注意轉角加密區。',
  supervisor: '陳工頭',
  supervisorPhone: '9876 5432',
  startTime: '07:30',
  endTime: '18:00',
  safetyNotes: ['必須佩戴安全帽及安全帶', '作業前確認模板已固定', '未持 PTW 不得進行高空作業'],
}

type Screen = 'main' | 'checkin' | 'task' | 'report' | 'sos'

const STATUS_ZH: Record<string, string> = {
  open: '待處理', 'in-progress': '處理中', resolved: '已解決', closed: '已關閉',
}
const STATUS_STYLE: Record<string, string> = {
  open:          'badge-blue',
  'in-progress': 'badge-orange',
  resolved:      'badge-green',
  closed:        'badge-slate',
}

export default function WorkerApp() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { submitIssue, issues } = useIssues()
  const { currentProjectId } = useProgress()
  const { ptwRequests } = useSafety()

  const activePTWs = ptwRequests.filter(p => p.status === 'active' || p.status === 'approved')

  const [screen, setScreen]       = useState<Screen>('main')
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkInTime, setCheckInTime] = useState('')
  const [reportDone, setReportDone]   = useState(false)
  const [sosSent, setSosSent]         = useState(false)

  const [issueCategory, setIssueCategory] = useState('質量問題')
  const [issueSeverity, setIssueSeverity] = useState<'normal' | 'serious' | 'urgent'>('normal')
  const [issueLocation, setIssueLocation] = useState('Zone C — 主樓結構')
  const [issueDescription, setIssueDescription] = useState('')
  const [issuePhotos, setIssuePhotos] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const myIssues = issues.filter(i => i.submittedBy === user?.id)

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }) }

  const workerProfile = {
    name:    user?.name    ?? '陳大文',
    trade:   user?.roleZh  ?? '鋼筋工',
    company: user?.company ?? '金輝紮鐵',
    id:      user?.id      ?? 'W001',
  }

  const doCheckIn = () => {
    setCheckedIn(true)
    setCheckInTime('07:12')
    setTimeout(() => setScreen('main'), 1500)
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setPhotoUploading(true)
    const urls = await Promise.all(
      files.map(file => uploadFile(file, issuePhotoPath(currentProjectId, file.name)))
    )
    const valid = urls.filter(Boolean) as string[]
    setIssuePhotos(prev => [...prev, ...valid])
    setPhotoUploading(false)
    e.target.value = ''
  }

  const handleSubmitIssue = () => {
    if (!issueDescription.trim() && issuePhotos.length === 0) return
    submitIssue({
      projectId: currentProjectId,
      category: issueCategory,
      severity: issueSeverity,
      location: issueLocation,
      drawingRef: '',
      description: issueDescription.trim() || `【${issueCategory}】現場照片記錄`,
      submittedBy: user?.id ?? '',
      submittedByName: user?.name ?? '',
      submittedByRole: 'worker',
      notifyIds: [],
      photos: issuePhotos,
    })
    setIssueDescription('')
    setIssuePhotos([])
    setReportDone(true)
  }

  // ===== SOS Screen =====
  if (screen === 'sos') {
    return (
      <div className="min-h-screen bg-red-600 flex flex-col items-center justify-center px-6 text-white">
        {!sosSent ? (
          <>
            <div className="w-28 h-28 rounded-full bg-red-800/60 border-4 border-red-300 flex items-center justify-center mb-8 animate-pulse">
              <AlertTriangle size={52} />
            </div>
            <h1 className="font-heading font-black text-4xl mb-2">緊急求助</h1>
            <p className="text-red-200 text-center mb-10 text-base leading-relaxed">
              按下按鈕立即通知安全主任、工頭及工程師
            </p>
            <button
              onClick={() => setSosSent(true)}
              className="w-56 h-56 rounded-full bg-white text-red-600 text-3xl font-black shadow-2xl border-8 border-red-200 hover:bg-red-50 active:scale-95 transition-all"
            >
              SOS<br />求救
            </button>
            <button onClick={() => setScreen('main')} className="mt-10 text-red-200 hover:text-white text-sm py-3 px-6">
              取消，返回
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={48} className="text-red-600" />
            </div>
            <h2 className="font-heading font-black text-3xl mb-2">求助已發出！</h2>
            <p className="text-red-100 text-lg mb-3">緊急通知已發送至：</p>
            <div className="space-y-2 mb-8">
              {['陳安全主任', '陳工頭', '張工程師'].map(p => (
                <p key={p} className="bg-red-700/60 rounded-xl py-2.5 px-6 font-semibold">{p}</p>
              ))}
            </div>
            <p className="text-red-200 text-sm mb-6">請保持冷靜，留在原地等候救援</p>
            <a href="tel:999"
              className="flex items-center justify-center gap-2 bg-white text-red-600 font-black text-xl px-8 py-4 rounded-2xl shadow-lg hover:bg-red-50 transition-colors"
            >
              <Phone size={24} /> 致電 999
            </a>
            <button onClick={() => { setSosSent(false); setScreen('main') }} className="mt-6 text-red-200 hover:text-white text-sm py-3 px-6">
              返回主頁
            </button>
          </div>
        )}
      </div>
    )
  }

  // ===== Check-in Screen =====
  if (screen === 'checkin') {
    return (
      <div className="min-h-screen bg-site-900 flex flex-col items-center justify-center px-6 text-white">
        {!checkedIn ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-safety-500 flex items-center justify-center mb-6">
              <HardHat size={32} className="text-white" />
            </div>
            <h1 className="font-heading font-black text-3xl mb-1">今日打卡</h1>
            <p className="text-site-300 mb-1">{workerProfile.name} — {workerProfile.trade}</p>
            <p className="text-site-400 text-sm mb-10">2026年4月17日 (星期五)</p>
            <div className="bg-white/8 border border-white/12 rounded-2xl p-6 w-full max-w-xs mb-10 text-center">
              <p className="text-site-400 text-xs mb-1.5 uppercase tracking-wider">作業地點</p>
              <p className="font-heading font-bold text-xl">{todayTask.zone}</p>
              <p className="text-site-300 mt-0.5">{todayTask.floor}</p>
            </div>
            <button
              onClick={doCheckIn}
              className="w-48 h-48 rounded-full bg-green-500 hover:bg-green-400 text-white text-2xl font-black shadow-2xl border-4 border-green-300 active:scale-95 transition-all"
            >
              ✓ 打卡
            </button>
            <button onClick={() => setScreen('main')} className="mt-10 text-site-400 hover:text-white text-sm py-3 px-6">
              ← 返回
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={48} className="text-white" />
            </div>
            <h2 className="font-heading font-black text-3xl mb-2">打卡成功！</h2>
            <p className="text-green-400 text-2xl font-bold">{checkInTime}</p>
            <p className="text-site-400 text-sm mt-2">正在返回主頁...</p>
          </div>
        )}
      </div>
    )
  }

  // ===== Task Detail Screen =====
  if (screen === 'task') {
    return (
      <div className="min-h-screen bg-site-50">
        <div className="bg-site-900 text-white p-5 pb-8">
          <button onClick={() => setScreen('main')} className="flex items-center gap-1.5 text-site-400 hover:text-white mb-5 text-sm min-h-[44px]">
            <ChevronLeft size={18} /> 返回
          </button>
          <h1 className="font-heading font-bold text-2xl">今日工作詳情</h1>
          <p className="text-site-400 mt-1 text-sm">{todayTask.work}</p>
        </div>
        <div className="px-4 -mt-3 pb-8 space-y-3">
          <div className="card p-4">
            <p className="text-site-400 text-xs flex items-center gap-1.5 mb-2"><MapPin size={13} /> 作業地點</p>
            <p className="font-heading font-bold text-site-900 text-lg">{todayTask.zone}</p>
            <p className="text-site-600 mt-0.5">{todayTask.floor}</p>
          </div>
          <div className="card p-4">
            <p className="text-site-400 text-xs flex items-center gap-1.5 mb-2"><Clock size={13} /> 工作時間</p>
            <p className="font-heading font-bold text-site-900 text-lg">{todayTask.startTime} — {todayTask.endTime}</p>
          </div>
          <div className="card p-4">
            <p className="text-site-400 text-xs mb-2">工作說明</p>
            <p className="text-site-700 leading-relaxed text-sm">{todayTask.detail}</p>
          </div>
          <div className="bg-safety-50 rounded-xl border border-safety-100 p-4">
            <p className="text-safety-700 font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle size={15} /> 安全注意事項
            </p>
            <div className="space-y-2">
              {todayTask.safetyNotes.map((note, i) => (
                <div key={i} className="flex items-start gap-2 text-safety-700 text-sm">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-safety-500 flex-shrink-0" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <p className="text-site-400 text-xs mb-3">負責工頭</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-safety-500 flex items-center justify-center text-white font-bold text-lg">
                  {todayTask.supervisor.slice(0, 1)}
                </div>
                <p className="font-heading font-semibold text-site-900">{todayTask.supervisor}</p>
              </div>
              <a href={`tel:${todayTask.supervisorPhone.replace(' ', '')}`}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                <Phone size={14} /> 致電
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== Report Screen =====
  if (screen === 'report') {
    return (
      <div className="min-h-screen bg-site-50">
        <div className="bg-site-900 text-white p-5 pb-8">
          <button onClick={() => setScreen('main')} className="flex items-center gap-1.5 text-site-400 hover:text-white mb-5 text-sm min-h-[44px]">
            <ChevronLeft size={18} /> 返回
          </button>
          <h1 className="font-heading font-bold text-2xl">上報問題</h1>
          <p className="text-site-400 mt-1 text-sm">拍照或描述問題，判頭打理會即時收到通知</p>
        </div>

        <div className="px-4 -mt-3 pb-8 space-y-4">
          {reportDone ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={44} className="text-green-600" />
              </div>
              <h2 className="font-heading font-black text-2xl text-site-900">問題已成功上報！</h2>
              <p className="text-site-500 mt-2">判頭打理已收到通知，會跟進處理</p>
              <button
                onClick={() => { setReportDone(false); setIssueSeverity('normal'); setIssueCategory('質量問題') }}
                className="mt-5 flex items-center gap-1.5 mx-auto text-safety-600 text-sm font-medium hover:underline py-2 px-4"
              >
                <Plus size={14} /> 再次上報
              </button>
              <button
                onClick={() => { setReportDone(false); setScreen('main') }}
                className="mt-2 btn-primary mx-auto w-48"
              >
                返回主頁
              </button>
            </div>
          ) : (
            <>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />

              {/* Photo capture */}
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                className="w-full bg-white border-2 border-dashed border-site-200 hover:border-safety-400 hover:bg-safety-50 rounded-2xl p-8 text-center transition-colors disabled:opacity-60"
              >
                {photoUploading
                  ? <Loader2 size={44} className="mx-auto mb-3 text-safety-500 animate-spin" />
                  : <Camera size={44} className="mx-auto mb-3 text-safety-500" />}
                <p className="text-site-800 font-bold text-lg">拍照記錄問題</p>
                <p className="text-site-400 text-sm mt-1">
                  {photoUploading ? '上傳中…' : issuePhotos.length > 0 ? `已上傳 ${issuePhotos.length} 張照片` : '按此開啟相機或相冊'}
                </p>
              </button>

              {issuePhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {issuePhotos.map((src, idx) => (
                    <div key={idx} className="relative aspect-square">
                      <img src={src} alt={`photo-${idx + 1}`} className="w-full h-full object-cover rounded-xl border border-site-200" />
                      <button
                        onClick={() => setIssuePhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-7 h-7 bg-red-500 text-white rounded-full text-sm flex items-center justify-center hover:bg-red-600"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Severity */}
              <div>
                <p className="text-site-700 font-semibold mb-2.5 text-sm">嚴重程度</p>
                <div className="grid grid-cols-3 gap-2">
                  {([['normal', '一般', 'border-site-300 bg-site-50 text-site-700'], ['serious', '較嚴重', 'border-safety-500 bg-safety-50 text-safety-700'], ['urgent', '緊急', 'border-red-500 bg-red-50 text-red-700']] as const).map(([v, l, active]) => (
                    <button
                      key={v}
                      onClick={() => setIssueSeverity(v)}
                      className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                        issueSeverity === v ? active : 'border-site-200 text-site-400 hover:border-site-300'
                      }`}
                    >{l}</button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <p className="text-site-700 font-semibold mb-2.5 text-sm">問題類別</p>
                <div className="grid grid-cols-3 gap-2">
                  {['質量問題', '安全隱患', '物料不足', '圖則不符', '機械故障', '其他'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setIssueCategory(cat)}
                      className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                        issueCategory === cat
                          ? 'border-safety-500 bg-safety-50 text-safety-700'
                          : 'bg-white border-site-200 text-site-700 hover:border-safety-300 hover:bg-safety-50'
                      }`}
                    >{cat}</button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <p className="text-site-700 font-semibold mb-2.5 text-sm">發生地點</p>
                <select
                  value={issueLocation}
                  onChange={e => setIssueLocation(e.target.value)}
                  className="w-full bg-white border border-site-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-safety-400 focus:ring-2 focus:ring-safety-200 text-site-700"
                >
                  {['Zone C — 主樓結構', 'Zone B — 核心筒', 'Zone C 1-20/F', 'Zone C 21-30/F', 'Zone C 31/F+', '其他'].map(o => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>

              {/* Voice */}
              <button className="w-full bg-white border-2 border-site-200 rounded-2xl p-5 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <Mic size={36} className="mx-auto mb-2 text-blue-500" />
                <p className="text-site-800 font-bold">語音描述</p>
                <p className="text-site-400 text-sm mt-0.5">按住說話，鬆開發送</p>
              </button>

              {/* Description */}
              <textarea
                value={issueDescription}
                onChange={e => setIssueDescription(e.target.value)}
                placeholder="補充描述問題 (可選，有照片已足夠)"
                rows={3}
                className="w-full bg-white border border-site-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-safety-400 focus:ring-2 focus:ring-safety-200 text-site-700"
              />

              <button
                onClick={handleSubmitIssue}
                disabled={(!issueDescription.trim() && issuePhotos.length === 0) || photoUploading}
                className="w-full bg-safety-500 hover:bg-safety-600 disabled:bg-site-200 disabled:text-site-400 text-white py-4 rounded-2xl text-xl font-black transition-colors"
              >
                發送上報
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ===== MAIN Screen =====
  return (
    <div className="min-h-screen bg-site-50">
      {/* Header */}
      <div className="bg-site-900 text-white px-5 pt-5 pb-10">
        <div className="flex items-center justify-between mb-5">
          <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center text-site-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors" title="登出">
            <LogOut size={20} />
          </button>
          <div className="text-center">
            <p className="font-heading font-bold text-lg leading-tight">{workerProfile.name}</p>
            <p className="text-site-400 text-xs mt-0.5">{workerProfile.trade} · {workerProfile.company}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-safety-500 flex items-center justify-center font-bold text-lg">
            {workerProfile.name.slice(0, 1)}
          </div>
        </div>

        <div className="text-center">
          <p className="text-site-400 text-xs">2026年4月17日 (星期五)</p>
          {checkedIn ? (
            <div className="inline-flex items-center gap-2 mt-2 bg-green-600/30 border border-green-500/40 px-4 py-1.5 rounded-full">
              <CheckCircle size={15} className="text-green-400" />
              <span className="font-semibold text-green-300 text-sm">已打卡 {checkInTime}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 mt-2 bg-red-500/25 border border-red-400/30 px-4 py-1.5 rounded-full">
              <Clock size={15} className="text-red-300" />
              <span className="font-semibold text-red-200 text-sm">未打卡</span>
            </div>
          )}
        </div>
      </div>

      {/* Active PTW status */}
      {activePTWs.length > 0 && (
        <div className="px-4 mt-4">
          <div className="bg-green-900/30 border border-green-500/40 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Shield size={18} className="text-green-400 flex-shrink-0" />
            <div>
              <p className="text-green-300 text-sm font-semibold">地盤現有 {activePTWs.length} 個有效 PTW</p>
              <p className="text-green-400 text-xs mt-0.5">{activePTWs.map(p => p.workType).join('、')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Today's task card */}
      <div className={`px-4 ${activePTWs.length > 0 ? 'mt-3' : '-mt-5'}`}>
        <button
          onClick={() => setScreen('task')}
          className="w-full card-md p-5 text-left hover:shadow-lg transition-shadow"
        >
          <p className="text-site-400 text-xs mb-2 flex items-center gap-1.5">
            <Clock size={12} /> 今日工作
          </p>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-heading font-bold text-site-900 text-xl leading-tight">{todayTask.work}</p>
              <div className="flex items-center gap-1.5 mt-1.5 text-site-500 text-sm">
                <MapPin size={13} className="flex-shrink-0" />
                <span className="truncate">{todayTask.zone}</span>
              </div>
              <p className="text-site-400 text-sm mt-0.5">{todayTask.floor}</p>
            </div>
            <span className="badge-blue flex-shrink-0 mt-1">詳情 →</span>
          </div>
          <div className="mt-3 pt-3 border-t border-site-100 flex gap-4 text-xs text-site-400">
            <span className="flex items-center gap-1"><Clock size={11} /> {todayTask.startTime}–{todayTask.endTime}</span>
            <span className="flex items-center gap-1"><HardHat size={11} /> {todayTask.supervisor}</span>
          </div>
        </button>
      </div>

      {/* Action buttons */}
      <div className="px-4 mt-4 space-y-3">
        {!checkedIn ? (
          <button
            onClick={() => setScreen('checkin')}
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-2xl py-5 flex items-center justify-center gap-3 shadow-lg transition-colors"
          >
            <CheckCircle size={26} />
            <span className="font-heading font-black text-2xl">今日打卡</span>
          </button>
        ) : (
          <div className="w-full bg-green-50 border-2 border-green-200 text-green-700 rounded-2xl py-4 flex items-center justify-center gap-3">
            <CheckCircle size={22} />
            <span className="font-heading font-bold text-xl">已打卡 {checkInTime} ✓</span>
          </div>
        )}

        <button
          onClick={() => setScreen('report')}
          className="w-full bg-safety-500 hover:bg-safety-600 active:bg-safety-700 text-white rounded-2xl py-5 flex items-center justify-center gap-3 shadow-lg transition-colors"
        >
          <Camera size={26} />
          <span className="font-heading font-black text-2xl">上報問題</span>
        </button>

        <button
          onClick={() => setScreen('sos')}
          className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-2xl py-6 flex items-center justify-center gap-3 shadow-xl transition-colors border-4 border-red-400"
        >
          <AlertTriangle size={30} />
          <span className="font-heading font-black text-3xl">緊急求助 SOS</span>
        </button>
      </div>

      {/* My issue reports */}
      {myIssues.length > 0 && (
        <div className="mx-4 mt-4 card p-4">
          <p className="text-sm font-semibold text-site-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-safety-500" /> 我的上報記錄
          </p>
          <div className="space-y-2">
            {myIssues.slice(0, 3).map(i => (
              <div key={i.id} className="flex items-center gap-2 text-xs">
                <span className={`${STATUS_STYLE[i.status]} flex-shrink-0`}>{STATUS_ZH[i.status]}</span>
                <span className="text-site-600 truncate">{i.category} — {i.location}</span>
                {i.comments.length > 0 && (
                  <span className="text-site-400 flex-shrink-0">{i.comments.length} 則回覆</span>
                )}
              </div>
            ))}
            {myIssues.length > 3 && (
              <p className="text-xs text-site-400 text-right">共 {myIssues.length} 項</p>
            )}
          </div>
        </div>
      )}

      {/* Safety reminder */}
      <div className="mx-4 mt-4 bg-safety-50 border border-safety-100 rounded-2xl p-4">
        <p className="text-safety-700 font-semibold text-sm mb-1.5 flex items-center gap-2">
          <AlertTriangle size={14} /> 今日安全提示
        </p>
        <p className="text-safety-600 text-sm leading-relaxed">{todayTask.safetyNotes[0]}</p>
      </div>

      <p className="text-center text-site-400 text-xs mt-6 mb-8">
        工程 ID: {workerProfile.id} · 如有問題請聯絡工頭
      </p>
    </div>
  )
}
