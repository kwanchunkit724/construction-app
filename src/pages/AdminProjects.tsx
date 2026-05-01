import { AppLayout } from '../components/AppLayout'
import { Shield } from 'lucide-react'

export default function AdminProjects() {
  return (
    <AppLayout title="管理">
      <div className="card p-8 text-center">
        <Shield size={40} className="mx-auto text-site-300 mb-3" />
        <p className="text-sm text-site-500">
          項目創建及 PM 指派功能將在 Phase 2 加入
        </p>
      </div>
    </AppLayout>
  )
}
