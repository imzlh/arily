import { useState } from 'react'
import { NavLink } from 'react-router'
import { Download, Info, Moon, PanelLeft, Settings, Sun, Gauge, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { useSettings, resolveTheme } from '@/stores/settings'
import { useConnection } from '@/stores/connection'
import { useTasks, selectCounts } from '@/stores/tasks'
import { cn } from '@/lib/cn'

/** 24px app mark: primary rounded square with a white download glyph. */
function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path
        d="M16 7.5v10.2m0 0 4.2-4.2M16 17.7l-4.2-4.2"
        stroke="var(--primary-foreground)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M9.5 22.5h13" stroke="var(--primary-foreground)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

const DOT_CLASS: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  disconnected: 'bg-muted-foreground/40',
  idle: 'bg-muted-foreground/40',
}

const STATE_LABEL: Record<string, string> = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '已断开',
  idle: '未连接',
}

// SidebarMenuButton from Motrix's ui/sidebar.tsx: h-8, gap-2, px-2, rounded-md, text-sm.
// Active state is a soft neutral overlay (never a colored pill) plus a subtle
// left accent bar, so color stays reserved for data.
const MENU_BUTTON =
  'relative flex h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'

const ACTIVE_ACCENT = 'absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-foreground/40'

function formatBadgeCount(value: number): string {
  return value > 99 ? '99+' : String(value)
}

interface NavItemProps {
  to: string
  end?: boolean
  icon: LucideIcon
  label: string
  /** Primary count (e.g. active tasks) */
  badge?: number
  /** Secondary, quieter count (e.g. finished tasks) */
  secondaryBadge?: number
  collapsed: boolean
}

function NavItem({ to, end, icon: Icon, label, badge, secondaryBadge, collapsed }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(MENU_BUTTON, isActive && 'bg-sidebar-active font-medium text-foreground')
      }
    >
      {({ isActive }) => {
        const showPrimary = !collapsed && badge !== undefined && badge > 0
        const showSecondary = !collapsed && secondaryBadge !== undefined && secondaryBadge > 0
        const content = (
          <>
            {isActive && <span className={ACTIVE_ACCENT} aria-hidden="true" />}
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && (showPrimary || showSecondary) && (
              <span className="ms-auto flex shrink-0 items-center gap-1.5 tabular-nums">
                {showPrimary && (
                  <span
                    className="text-xs font-medium text-foreground/70"
                    title="进行中"
                  >
                    {formatBadgeCount(badge ?? 0)}
                  </span>
                )}
                {showSecondary && (
                  <span
                    className="text-xs text-muted-foreground/55"
                    title="已完成"
                  >
                    {formatBadgeCount(secondaryBadge ?? 0)}
                  </span>
                )}
              </span>
            )}
          </>
        )
        return collapsed ? <Tooltip content={label} side="right">{content}</Tooltip> : content
      }}
    </NavLink>
  )
}

/**
 * Motrix-style sidebar: 200px tinted rail with the main content floating as an
 * inset card next to it. Navigation on top, connection state + settings +
 * theme pinned in the footer. Hidden entirely below lg — narrow screens
 * navigate with the floating MobileTabBar instead; on lg+ the header toggle
 * collapses it to a 52px icon rail with tooltips.
 */
export function Sidebar() {
  const [collapsedPref, setCollapsed] = useState(false)
  const counts = useTasks(selectCounts)
  const connectionState = useConnection((s) => s.state)
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)

  const isDark = resolveTheme(theme) === 'dark'
  const themeNext = isDark ? 'light' : 'dark'
  const themeLabel = themeNext === 'light' ? '切换到浅色主题' : '切换到深色主题'
  const ThemeIcon = isDark ? Moon : Sun

  // Rail state only applies on lg+; below that the sidebar is hidden.
  const compact = collapsedPref

  const themeButton = (
    <button
      type="button"
      aria-label={themeLabel}
      onClick={() => setTheme(themeNext)}
      className={cn(MENU_BUTTON, 'text-start')}
    >
      <ThemeIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn('truncate', compact && 'lg:hidden')}>{themeLabel}</span>
    </button>
  )

  return (
    <aside
      data-collapsed={compact ? 'true' : 'false'}
      className={cn(
        'hidden h-full w-[200px] shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
        compact && 'lg:w-[52px]',
      )}
    >
      {/* Header: 45px expanded (Motrix SidebarHeader). Collapsed, the narrow
          rail can't fit logo + toggle side by side, so the toggle drops below. */}
      <div
        className={cn(
          'flex shrink-0 items-center',
          compact ? 'h-[80px] flex-col justify-center gap-1.5' : 'h-[45px]',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <Logo className="size-6 shrink-0" />
          <span
            className={cn(
              'truncate text-sm font-semibold tracking-tight text-foreground',
              compact && 'lg:hidden',
            )}
          >
            AriaUI
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={compact ? '展开侧边栏' : '收起侧边栏'}
          aria-expanded={!compact}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
            compact ? 'mx-0' : 'me-2',
          )}
        >
          <PanelLeft
            className={cn('size-4 transition-transform', compact && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Navigation + footer share 12px horizontal padding (p-3 of the 200px rail) */}
      <div className="flex min-h-0 flex-1 flex-col px-3">
        <nav className="flex flex-col gap-0.5">
          <NavItem to="/overview" icon={Gauge} label="总览" collapsed={compact} />
          <NavItem
            to="/"
            end
            icon={Download}
            label="下载"
            badge={counts.active}
            secondaryBadge={counts.stopped}
            collapsed={compact}
          />
          <NavItem to="/status" icon={Activity} label="状态" collapsed={compact} />
        </nav>

        <div className="mt-auto flex flex-col gap-1 pb-3">
          {/* Engine badge, like Motrix's connection status row */}
          {compact ? (
            <Tooltip content={STATE_LABEL[connectionState] ?? STATE_LABEL.idle} side="right">
              <div className="flex h-7 items-center justify-center" role="status" aria-label={STATE_LABEL[connectionState] ?? STATE_LABEL.idle}>
                <span className={cn('size-2 rounded-full', DOT_CLASS[connectionState] ?? DOT_CLASS.idle)} />
              </div>
            </Tooltip>
          ) : (
            <div className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground" role="status">
              <span className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[connectionState] ?? DOT_CLASS.idle)} />
              <span className="truncate">{STATE_LABEL[connectionState] ?? STATE_LABEL.idle}</span>
            </div>
          )}

          <div className="mx-2 h-px bg-border" aria-hidden="true" />

          <NavItem to="/about" icon={Info} label="关于" collapsed={compact} />
          <NavItem to="/settings" icon={Settings} label="设置" collapsed={compact} />

          {compact ? (
            <Tooltip content={themeLabel} side="right">
              {themeButton}
            </Tooltip>
          ) : (
            themeButton
          )}
        </div>
      </div>
    </aside>
  )
}
