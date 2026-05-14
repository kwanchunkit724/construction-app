import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { SiProvider } from '../contexts/SiContext'
import { DrawingsProvider } from '../contexts/DrawingsContext'
import { SiList } from '../components/si/SiList'
import { SiSubmitForm } from '../components/si/SiSubmitForm'

function SiListInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  return (
    <>
      <SiList
        onOpen={siId => navigate(`/project/${projectId}/si/${siId}`)}
        onNew={() => setCreating(true)}
      />
      {creating && (
        <SiSubmitForm
          projectId={projectId}
          onSubmitted={siId => {
            setCreating(false)
            navigate(`/project/${projectId}/si/${siId}`)
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  )
}

export default function SiListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return (
      <AppLayout title="工地指令">
        <p className="text-site-500">缺少項目編號</p>
      </AppLayout>
    )
  }
  return (
    <AppLayout title="工地指令">
      <DrawingsProvider projectId={id}>
        <SiProvider projectId={id}>
          <SiListInner projectId={id} />
        </SiProvider>
      </DrawingsProvider>
    </AppLayout>
  )
}
