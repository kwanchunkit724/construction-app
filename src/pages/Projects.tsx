import { AppLayout } from '../components/AppLayout'
import { Building2 } from 'lucide-react'

export default function Projects() {
  return (
    <AppLayout title="工地">
      <div className="card p-8 text-center">
        <Building2 size={40} className="mx-auto text-site-300 mb-3" />
        <p className="text-sm text-site-500">
          工地申請功能將在 Phase 2 加入
        </p>
      </div>
    </AppLayout>
  )
}
