import {
  LogIn, UserPlus, ClipboardCheck, Building2, ListChecks, CalendarClock,
  FileDown, AlertTriangle, ArrowUp, CheckCircle2, ClipboardList, FileText,
  Package, Calendar, Contact, UserCog, LayoutDashboard, Bell, WifiOff,
  Rocket, UserX, GitBranch,
  HelpCircle, Eye, Users, Footprints, Lightbulb,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tutorial } from '../../lib/tutorials'
import { WorkflowDiagram, RoleBadge } from './WorkflowDiagram'

const ICONS: Record<string, LucideIcon> = {
  LogIn, UserPlus, ClipboardCheck, Building2, ListChecks, CalendarClock,
  FileDown, AlertTriangle, ArrowUp, CheckCircle2, ClipboardList, FileText,
  Package, Calendar, Contact, UserCog, LayoutDashboard, Bell, WifiOff,
  Rocket, UserX, GitBranch,
}
export function tutorialIcon(name: string): LucideIcon {
  return ICONS[name] ?? HelpCircle
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-site-900 mb-2">
        <Icon size={15} className="text-safety-600" /> {title}
      </h3>
      {children}
    </div>
  )
}

export function TutorialView({ tutorial }: { tutorial: Tutorial }) {
  const Icon = tutorialIcon(tutorial.icon)
  return (
    <div>
      {/* Title + summary */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-safety-50 text-safety-600 grid place-items-center flex-shrink-0">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-site-900 leading-tight">{tutorial.title}</h2>
          <p className="text-sm text-site-600 mt-0.5">{tutorial.summary}</p>
        </div>
      </div>

      {/* Who uses it */}
      <Section icon={Users} title="邊個用・做到啲咩">
        <div className="space-y-1.5">
          {tutorial.roles.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <RoleBadge label={r.role} className="flex-shrink-0 mt-0.5" />
              <span className="text-sm text-site-700">{r.can}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* How-to steps */}
      <Section icon={Footprints} title="點用（步驟）">
        <ol className="space-y-2">
          {tutorial.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-site-200 text-site-700 grid place-items-center text-[11px] font-bold mt-0.5">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm text-site-900"><RoleBadge label={s.actor} className="mr-1.5" />{s.action}</p>
                <p className="text-xs text-site-500 mt-0.5">→ {s.result}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Workflow diagram (presentation-ready) */}
      <Section icon={ListChecks} title="流程圖（邊個做・邊個睇到）">
        <WorkflowDiagram flow={tutorial.flow} />
      </Section>

      {/* Visibility */}
      <Section icon={Eye} title="邊個睇到結果">
        <p className="text-sm text-site-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 leading-relaxed">
          {tutorial.visibility}
        </p>
      </Section>

      {/* Common confusions */}
      {tutorial.confusions.length > 0 && (
        <Section icon={Lightbulb} title="常見疑問">
          <ul className="space-y-1.5">
            {tutorial.confusions.map((c, i) => (
              <li key={i} className="text-sm text-site-700 flex gap-2">
                <span className="text-amber-500 flex-shrink-0">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
