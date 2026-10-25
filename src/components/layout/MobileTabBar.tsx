import { NavLink } from 'react-router'
import { Activity, Download, Gauge, Info, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTasks, selectCounts } from '@/stores/tasks'
import { cn } from '@/lib/cn'

interface TabItem {
  to: string
  end?: boolean
  icon: LucideIcon
  label: string
  /** Tiny count bubble rendered over the icon (下载 tab shows active tasks). */
  badge?: number
}

/**
 * Floating bottom tab bar for narrow screens (lg:hidden): a glassy rounded
 * pill docked to the bottom safe area. The desktop sidebar stays the primary
 * navigation on lg+; this mirrors its items for touch layouts.
 */
export function MobileTabBar() {
  const counts = useTasks(selectCounts)

  const items: TabItem[] = [
    { to: '/overview', icon: Gauge, label: '总览' },
    { to: '/', end: true, icon: Download, label: '下载', badge: counts.active },
    { to: '/status', icon: Activity, label: '状态' },
    { to: '/about', icon: Info, label: '关于' },
    { to: '/settings', icon: Settings, label: '设置' },
  ]

  return (
    <nav
      aria-label="底部导航"
      style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      className="fixed inset-x-2.5 bottom-1.5 z-40 flex items-stretch gap-1 rounded-2xl border border-border bg-card/90 p-1.5 shadow-soft backdrop-blur-md lg:hidden"
    >
      {items.map(({ to, end, icon: Icon, label, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            cn(
              'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] leading-none transition-colors outline-none',
              isActive
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
            )
          }
        >
          <span className="relative">
            <Icon className="size-[18px]" aria-hidden="true" />
            {badge !== undefined && badge > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-2.5 rounded-full bg-primary px-1 text-[9px] leading-[14px] font-semibold text-primary-foreground tabular-nums"
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          <span className="max-w-full truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
