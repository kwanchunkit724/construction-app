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
  const [parentSiId, setParentSiId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<PostSubmitInfo | null>(null)

  const lockedSis = sis.filter(s => s.status === 'locked')
  const siWithoutVo = lockedSis.filter(s => !vos.some(v => v.si_id === s.id))
  const parentSi = parentSiId ? sis.find(s => s.id === parentSiId) ?? null : null

  return (
    <>
      <VoList
        sis={sis}
        onOpen={voId => navigate(`/project/${projectId}/vo/${voId}`)}
        onNew={() => setPicking(true)}
      />

      {/* Parent-SI picker: VO must reference a locked SI without an existing VO. */}
      {picking && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4">
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="px-5 py-3 border-b border-site-100">
              <h3 className="font-bold text-site-900">選擇來源工地指令</h3>
              <p className="text-[11px] text-site-500 mt-0.5">
                只可基於 <strong>已鎖定</strong> 而 <strong>未有變更指令</strong> 的工地指令提出。
              </p>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-1">
              {siWithoutVo.length === 0 ? (
                <p className="text-sm text-site-500 text-center py-6">
                  目前未有符合條件的工地指令
                </p>
              ) : (
                siWithoutVo.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setParentSiId(s.id)
                      setPicking(false)
                    }}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-site-50 flex items-center gap-2"
                  >
                    <span className="font-mono text-xs text-site-500">{s.number}</span>
                  </button>
                ))
              )}
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

      {parentSi && (
        <VoSubmitForm
          projectId={projectId}
          parentSi={parentSi}
          progressItems={progressItems}
          onSubmitted={(voId, serverTotal) => {
            const fresh = vos.find(v => v.id === voId)
            setConfirmation({
              voId,
              serverTotal,
              voNumber: fresh?.number ?? '',
            })
            setParentSiId(null)
          }}
          onCancel={() => setParentSiId(null)}
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
