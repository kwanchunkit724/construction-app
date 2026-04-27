import type { ElementType } from 'react'

export interface TabDef {
  id: string
  label: string
  icon: ElementType
  badge?: number
  show?: boolean
}

interface TabBarProps {
  tabs: TabDef[]
  active: string
  onChange: (id: string) => void
  /** colour of the active indicator — default safety-orange */
  activeColor?: string
  /** wrap in a white sticky bar (default true) */
  sticky?: boolean
}

export default function TabBar({
  tabs,
  active,
  onChange,
  activeColor = 'border-orange-500 text-orange-600',
  sticky = true,
}: TabBarProps) {
  const wrapClass = sticky
    ? 'bg-white border-b border-gray-200 sticky top-14 z-40'
    : 'bg-white border-b border-gray-200'

  return (
    <div className={wrapClass}>
      <div className="grid grid-flow-col auto-cols-fr">
        {tabs.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5
                px-1 sm:px-5 py-2 sm:py-3.5 flex-1 border-b-2 transition-colors
                text-[10px] sm:text-sm font-medium min-w-0
                ${isActive ? activeColor : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="leading-tight text-center w-full">{t.label}</span>
              {!!t.badge && t.badge > 0 && (
                <span className="absolute top-1.5 right-1.5 sm:static sm:ml-0.5 bg-red-500 text-white text-[9px] font-bold
                  min-w-[14px] h-3.5 px-1 rounded-full flex items-center justify-center leading-none">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
