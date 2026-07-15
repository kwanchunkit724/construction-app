import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { VoProvider } from '../contexts/VoContext'
import { SiProvider, useSi } from '../contexts/SiContext'
import { ProgressProvider, useProgress } from '../contexts/ProgressContext'
import { VoList } from '../components/vo/VoList'
import { VoSubmitForm } from '../components/vo/VoSubmitForm'
import { VoConfirmationScreen } from '../components/vo/VoConfirmationScreen'
import { useVo } from '../contexts/VoContext'

interface PostSubmitInfo {
  voId: string
  serverTotal: number
  voNumber: string
}

function VoListInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { sis } = useSi()
  const { items: progressItems } = useProgress()
  const { vos } = useVo()
  const [picking, setPicking] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [parentSiId, setParentSiId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<PostSubmitInfo | null>(null)

  // A VO can stand alone or cite ANY locked SI (many VOs per SI are allowed).
  const lockedSis = sis.filter(s => s.status === 'locked')
  const parentSi = parentSiId ? sis.find(s => s.id === parentSiId) ?? null : null

  return (
    <>
      <VoList
        sis={sis}
        onOpen={voId => navigate(`/project/${projectId}/vo/${voId}`)}
        onNew={() => setPicking(true)}
      />

      {/* New-VO picker: stand alone, or cite a locked SI (optional). */}
      {picking && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4">
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="px-5 py-3 border-b border-site-100">
              <h3 className="font-bold text-site-900">新增變更指令</h3>
              <p className="text-[11px] text-site-500 mt-0.5">
                變更指令係對合約的<strong>變更估價</strong>，可獨立提出，亦可引用一張已鎖定的工地指令。
              </p>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-1">
              <button
                type="button"
                onClick={() => { setParentSiId(null); setPicking(false); setFormOpen(true) }}
                className="w-full text-left text-sm px-3 py-2.5 rounded-lg bg-safety-50 hover:bg-safety-100 text-safety-700 font-semibold"
              >
                ＋ 獨立變更指令（不引用工地指令）
              </button>
              {lockedSis.length > 0 && (
                <p className="text-[11px] text-site-400 px-1 pt-2">或引用一張已鎖定工地指令：</p>
              )}
              {lockedSis.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setParentSiId(s.id); setPicking(false); setFormOpen(true) }}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-site-50 flex items-center gap-2"
                >
                  <span className="font-mono text-xs text-site-500">{s.number}</span>
                  {vos.some(v => v.si_id === s.id) && (
                    <span className="text-[10px] text-site-400">· 已有變更指令</span>
                  )}
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-site-100">
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="btn-ghost w-full"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <VoSubmitForm
          projectId={projectId}
          parentSi={parentSi ?? undefined}
          progressItems={progressItems}
          onSubmitted={(voId, serverTotal) => {
            const fresh = vos.find(v => v.id === voId)
            setConfirmation({
              voId,
              serverTotal,
              voNumber: fresh?.number ?? '',
            })
            setFormOpen(false)
            setParentSiId(null)
          }}
          onCancel={() => { setFormOpen(false); setParentSiId(null) }}
        />
      )}

      {confirmation && (
        <VoConfirmationScreen
          voId={confirmation.voId}
          serverTotal={confirmation.serverTotal}
          voNumber={confirmation.voNumber}
          onClose={() => setConfirmation(null)}
          onViewDetail={voId => {
            setConfirmation(null)
            navigate(`/project/${projectId}/vo/${voId}`)
          }}
        />
      )}
    </>
  )
}

export default function VoListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return (
      <AppLayout title="變更指令">
        <p className="text-site-500">缺少項目編號</p>
      </AppLayout>
    )
  }
  return (
    <AppLayout title="變更指令">
      <SiProvider projectId={id}>
        <ProgressProvider projectId={id}>
          <VoProvider projectId={id}>
            <VoListInner projectId={id} />
          </VoProvider>
        </ProgressProvider>
      </SiProvider>
    </AppLayout>
  )
}
