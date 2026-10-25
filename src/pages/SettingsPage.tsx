import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  Check,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Info,
  Link2,
  Magnet,
  Network,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Type,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { Textarea } from '@/components/ui/Textarea'
import { ARIA2_OPTION_COUNT, ARIA2_OPTION_GROUPS } from '@/config/aria2Options'
import type { Aria2OptionDef, Aria2OptionGroup } from '@/config/aria2Options'
import { useConfirm } from '@/hooks/useConfirm'
import { formatSpeed, formatSpeedInput, parseSpeed } from '@/lib/format'
import { cn } from '@/lib/cn'
import type {
  Aria2ConnectionConfig,
  NotificationFrequency,
  ThemeMode,
  TransportProtocol,
} from '@/types/settings'
import { profileKey, profileName, useSettings } from '@/stores/settings'
import { useConnection } from '@/stores/connection'
import { useOptions } from '@/stores/options'
import { useTasks } from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import { ConnectionEventLog } from '@/components/ConnectionEventLog'

// ---------------------------------------------------------------------------
// aria2 option helpers: draft conversion, validation and payload building
// ---------------------------------------------------------------------------

/** Options whose Bytes value is a speed limit (rendered/parsed like speeds). */
const SPEED_KEYS = new Set([
  'max-overall-download-limit',
  'max-download-limit',
  'max-overall-upload-limit',
  'max-upload-limit',
  'lowest-speed-limit',
  'bt-request-peer-speed-limit',
])

/** Accepted shapes for a Bytes field: plain digits or digits with a K/M/G/T unit. */
const SIZE_RE = /^\d+(\.\d+)?\s*(k|m|g|t)?(i?b)?$/i

/** Convert a raw aria2 value into its editable draft representation. */
function toDraftValue(def: Aria2OptionDef, raw: string): string {
  // Plain byte counts become compact human input ("20971520" -> "20M").
  if (def.suffix === 'Bytes' && /^\d+$/.test(raw)) return formatSpeedInput(Number(raw))
  return raw
}

/** Validate a draft value; returns an error message or null when acceptable. */
function validateValue(def: Aria2OptionDef, value: string): string | null {
  const v = value.trim()
  if (!v) return null
  if (def.suffix === 'Bytes') return SIZE_RE.test(v) ? null : '格式无效，示例：10M、500K 或 1024'
  if (def.type === 'integer') {
    if (!/^-?\d+$/.test(v)) return '请输入整数'
    const n = Number(v)
    if (def.min !== undefined && n < def.min) return `不能小于 ${def.min}`
    if (def.max !== undefined && n > def.max) return `不能大于 ${def.max}`
    return null
  }
  if (def.type === 'float') {
    if (!/^-?\d+(\.\d+)?$/.test(v)) return '请输入数字'
    const n = Number(v)
    if (def.min !== undefined && n < def.min) return `不能小于 ${def.min}`
    if (def.max !== undefined && n > def.max) return `不能大于 ${def.max}`
    return null
  }
  return null
}

/** Convert a draft value into the string sent to aria2.changeGlobalOption. */
function toPayloadValue(def: Aria2OptionDef, value: string): string {
  const v = value.trim()
  // For size/speed options 0 is aria2's "none/unlimited"; empty resets to it.
  if (def.suffix === 'Bytes') return String(v ? parseSpeed(v) : 0)
  if (!v) return ''
  if (def.type === 'text' && def.separator === '\n') {
    return v
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  }
  return v
}

/** Secondary hint rendered under a control (unit or separator syntax). */
function unitHint(def: Aria2OptionDef): string | null {
  if (def.type === 'text') return def.separator === '\n' ? '每行一项' : '多个值用英文逗号分隔'
  if (def.suffix === 'Bytes') return SPEED_KEYS.has(def.key) ? '如 10M、500K，0 为不限制' : '如 10M、500K'
  if (def.suffix === 'Seconds') return '单位：秒'
  if (def.suffix === 'Minutes') return '单位：分钟'
  if (def.suffix === 'Hours') return '单位：小时'
  if (def.suffix === 'Milliseconds') return '单位：毫秒'
  return null
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

interface NavItem {
  id: string
  label: string
  icon?: LucideIcon
  /** Non-clickable sidebar section caption. */
  header?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'connection', label: '连接', icon: Server },
  { id: 'nav-aria2', label: 'aria2 设置', header: true },
  { id: 'basic', label: '基本', icon: SlidersHorizontal },
  { id: 'httpFtpSftp', label: 'HTTP/FTP/SFTP', icon: Globe },
  { id: 'http', label: 'HTTP', icon: Network },
  { id: 'ftpSftp', label: 'FTP/SFTP', icon: HardDrive },
  { id: 'bt', label: 'BitTorrent', icon: Magnet },
  { id: 'metalink', label: 'Metalink', icon: Link2 },
  { id: 'rpc', label: 'RPC', icon: Plug },
  { id: 'advanced', label: '高级', icon: Wrench },
  { id: 'appearance', label: '界面', icon: Palette },
  { id: 'about', label: '关于', icon: Info },
]

const SCROLLABLE_IDS = NAV_ITEMS.filter((item) => !item.header).map((item) => item.id)

const GROUP_ICONS: Record<string, LucideIcon> = {
  basic: SlidersHorizontal,
  httpFtpSftp: Globe,
  http: Network,
  ftpSftp: HardDrive,
  bt: Magnet,
  metalink: Link2,
  rpc: Plug,
  advanced: Wrench,
}

const CONNECTION_LABEL: Record<string, string> = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '已断开',
  idle: '未连接',
}

const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window

/** Fill the document title template with live values (preview only; the
 * actual updater lives in an app-level hook). */
function renderTitle(template: string, downspeed: string, upspeed: string): string {
  return template
    .replace(/\$\{downspeed\}|\{downspeed\}/g, downspeed)
    .replace(/\$\{upspeed\}|\{upspeed\}/g, upspeed)
    .replace(/\$\{downcount\}|\{downcount\}/g, String(useTasks.getState().active.length))
    .replace(/\$\{waiting\}|\{waiting\}/g, useTasks.getState().stat.numWaiting ?? '0')
}

// ---------------------------------------------------------------------------

export function SettingsPage() {
  const confirm = useConfirm()

  const storeConnection = useSettings((s) => s.connection)
  const theme = useSettings((s) => s.theme)
  const pollingInterval = useSettings((s) => s.pollingInterval)
  const protocol = useSettings((s) => s.protocol)
  const autoReconnectInterval = useSettings((s) => s.autoReconnectInterval)
  const profiles = useSettings((s) => s.profiles)
  const activeProfile = useSettings((s) => s.activeProfile)
  const titleTemplate = useSettings((s) => s.titleTemplate)
  const updateTitleInterval = useSettings((s) => s.updateTitleInterval)
  const notifications = useSettings((s) => s.notifications)
  const notificationSound = useSettings((s) => s.notificationSound)
  const notificationFrequency = useSettings((s) => s.notificationFrequency)

  const state = useConnection((s) => s.state)
  const useHttp = useConnection((s) => s.useHttp)
  const version = useConnection((s) => s.version)
  const sessionId = useConnection((s) => s.sessionId)
  const features = useConnection((s) => s.enabledFeatures)
  const events = useConnection((s) => s.events)

  const globalOptions = useOptions((s) => s.globalOptions)

  const connected = state === 'connected'

  // ---- sub navigation (two-pane, scroll-spy)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef(new Map<string, HTMLElement>())
  const [active, setActive] = useState('connection')

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const base = el.getBoundingClientRect()
      let current = SCROLLABLE_IDS[0]
      for (const id of SCROLLABLE_IDS) {
        const node = sectionRefs.current.get(id)
        if (node && node.getBoundingClientRect().top - base.top <= 96) current = id
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
        current = SCROLLABLE_IDS[SCROLLABLE_IDS.length - 1]
      }
      setActive(current)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function scrollTo(id: string) {
    setActive(id)
    const container = scrollRef.current
    const node = sectionRefs.current.get(id)
    if (!container || !node) return
    // scrollIntoView({behavior:'smooth'}) is a no-op under prefers-reduced-motion,
    // so compute the offset and scroll the container directly.
    const top =
      node.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      56
    container.scrollTo({ top, behavior: 'auto' })
  }

  function registerSection(id: string) {
    return (el: HTMLElement | null) => {
      if (el) sectionRefs.current.set(id, el)
      else sectionRefs.current.delete(id)
    }
  }

  // ---- connection draft
  const [conn, setConn] = useState<Aria2ConnectionConfig>(storeConnection)
  const [showSecret, setShowSecret] = useState(false)
  const connDirty = useRef(false)
  const lastStoreConn = useRef(storeConnection)
  const echoConn = useRef<Aria2ConnectionConfig | null>(null)

  useEffect(() => {
    if (storeConnection === lastStoreConn.current) return
    if (echoConn.current === storeConnection) {
      echoConn.current = null
      lastStoreConn.current = storeConnection
      return
    }
    lastStoreConn.current = storeConnection
    // External change (e.g. reset elsewhere): mirror it unless the user is editing.
    if (!connDirty.current) setConn(storeConnection)
  }, [storeConnection])

  function patchConn(partial: Partial<Aria2ConnectionConfig>) {
    connDirty.current = true
    setConn((prev) => ({ ...prev, ...partial }))
  }

  function applyConnectionToStore(next: Aria2ConnectionConfig) {
    echoConn.current = next
    connDirty.current = false
    setConn(next)
    useConnection.getState().applyConnection(next)
  }

  function saveConnection() {
    applyConnectionToStore(conn)
    // An unsaved endpoint no longer matches any profile.
    const idx = profiles.findIndex((p) => profileKey(p) === profileKey(conn))
    useSettings.getState().setActiveProfile(idx)
    toast.success('已保存')
  }

  function addCurrentProfile() {
    const next = { ...conn }
    const index = useSettings.getState().addProfile(next)
    useSettings.getState().updateProfile(index, next)
    toast.success('服务器已保存')
  }

  function switchProfile(index: number) {
    const target = useSettings.getState().profiles[index]
    if (!target) return
    const next = { ...target }
    applyConnectionToStore(next)
    useSettings.getState().setActiveProfile(index)
    toast.success(`已切换到 ${profileName(next)}`)
  }

  async function deleteProfile(index: number) {
    const target = useSettings.getState().profiles[index]
    if (!target) return
    const ok = await confirm({
      title: '删除',
      description: `确定要从列表中删除“${profileName(target)}”吗？`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    useSettings.getState().deleteProfile(index)
    toast.success('服务器已删除')
  }

  // ---- aria2 global options drafts
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null)
  const loadedRef = useRef<Record<string, string | undefined>>({})

  useEffect(() => {
    if (state === 'connected') void useOptions.getState().loadGlobal()
  }, [state])

  useEffect(() => {
    const prevLoaded = loadedRef.current
    setDraft((prevDraft) => {
      const next: Record<string, string> = {}
      for (const group of ARIA2_OPTION_GROUPS) {
        for (const def of group.options) {
          const base = toDraftValue(def, globalOptions[def.key] ?? '')
          const oldBase = toDraftValue(def, prevLoaded[def.key] ?? '')
          // Keep unsaved edits from other groups across reloads.
          next[def.key] = prevDraft[def.key] !== undefined && prevDraft[def.key] !== oldBase ? prevDraft[def.key] : base
        }
      }
      return next
    })
    loadedRef.current = globalOptions
  }, [globalOptions])

  async function saveGroup(group: Aria2OptionGroup, payload: Record<string, string>, count: number) {
    if (savingGroupId || count === 0) return
    setSavingGroupId(group.id)
    try {
      const ok = await useOptions.getState().saveGlobal(payload)
      if (ok) toast.success(`${group.label}设置已保存（${count} 项修改）`)
      else toast.error(`保存失败：${useOptions.getState().lastError ?? '未知错误'}`)
    } finally {
      setSavingGroupId(null)
    }
  }

  // ---- appearance: notifications (permission only; the engine is app-level)
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    notificationsSupported ? Notification.permission : 'denied',
  )

  async function requestNotificationPermission() {
    if (!notificationsSupported) return
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') useSettings.getState().setNotifications(true)
    } catch {
      setPermission('denied')
    }
  }

  // ---- factory reset
  async function resetAll() {
    const ok = await confirm({
      title: '恢复默认设置',
      description: '将清除所有本地设置（连接、外观、通知等）并恢复默认值，确定继续吗？',
      confirmText: '恢复默认设置',
      danger: true,
    })
    if (!ok) return
    useSettings.getState().reset()
    echoConn.current = useSettings.getState().connection
    lastStoreConn.current = useSettings.getState().connection
    connDirty.current = false
    setConn(useSettings.getState().connection)
    toast.success('已保存')
  }

  // ---- render helpers
  function infoRow(label: string, value: React.ReactNode) {
    return (
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="min-w-0 truncate text-right font-medium text-foreground">{value}</span>
      </div>
    )
  }

  const titlePreview = renderTitle(
    titleTemplate,
    formatSpeed(useTasks.getState().stat.downloadSpeed),
    formatSpeed(useTasks.getState().stat.uploadSpeed),
  )

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      {/* ------------------------------------------------ mobile chip navigation */}
      <div className="sticky top-0 z-20 border-b border-border bg-sidebar-inset/90 backdrop-blur lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2">
          {SCROLLABLE_IDS.map((id) => {
            const item = NAV_ITEMS.find((n) => n.id === id)
            if (!item) return null
            return (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  active === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 sm:px-6">
        {/* ------------------------------------------------ desktop sub navigation */}
        <nav className="sticky top-0 hidden w-52 shrink-0 self-start py-6 lg:block">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) =>
              item.header ? (
                <li key={item.id} className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-wider text-muted-foreground/80">
                  {item.label}
                </li>
              ) : (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(item.id)}
                    aria-current={active === item.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                      active === item.id
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    {item.icon && <item.icon className="size-4 shrink-0" aria-hidden="true" />}
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </nav>

        {/* ------------------------------------------------ content */}
        <main className="min-w-0 flex-1 space-y-5 py-6">
          {/* ================================================ CONNECTION */}
          <section id="connection" ref={registerSection('connection')} className="scroll-mt-14 space-y-5">
            <Card>
              <CardHeader icon={Server} title="aria2 连接" description="支持 IP、域名或完整地址，例如 http://192.168.1.2:6800/jsonrpc" />
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="主机地址" htmlFor="st-host">
                    <Input
                      id="st-host"
                      value={conn.host}
                      onChange={(e) => patchConn({ host: e.target.value })}
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="端口" htmlFor="st-port">
                    <Input
                      id="st-port"
                      type="number"
                      value={conn.port || ''}
                      onChange={(e) => patchConn({ port: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="接口路径" htmlFor="st-path">
                    <Input
                      id="st-path"
                      value={conn.path}
                      onChange={(e) => patchConn({ path: e.target.value })}
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="RPC 秘钥" hint="对应 aria2 的 --rpc-secret">
                    <div className="relative">
                      <Input
                        id="st-secret"
                        type={showSecret ? 'text' : 'password'}
                        className="pr-9"
                        value={conn.secret}
                        onChange={(e) => patchConn({ secret: e.target.value })}
                        placeholder="对应 aria2 的 --rpc-secret"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
                        aria-label={showSecret ? '隐藏 RPC 秘钥' : '显示 RPC 秘钥'}
                      >
                        {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="传输协议" hint="自动模式下优先使用 WebSocket，失败时回退到 HTTP">
                    <Select
                      aria-label="传输协议"
                      value={protocol}
                      onChange={(e) => useSettings.getState().setProtocol(e.target.value as TransportProtocol)}
                      options={[
                        { value: 'auto', label: '自动（优先 WebSocket）' },
                        { value: 'websocket', label: 'WebSocket' },
                        { value: 'http', label: 'HTTP' },
                      ]}
                    />
                  </Field>
                  <Field label="自动重连间隔" hint="连接断开后按此间隔重试">
                    <div
                      className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground"
                      aria-readonly="true"
                    >
                      {`${autoReconnectInterval} 毫秒`}
                    </div>
                  </Field>
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          state === 'connected'
                            ? 'bg-emerald-500'
                            : state === 'connecting'
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-muted-foreground/40',
                        )}
                        aria-hidden="true"
                      />
                      {CONNECTION_LABEL[state] ?? state}
                    </span>
                    <span className="text-muted-foreground">
                      当前传输:{' '}
                      <span className="font-medium text-foreground">{useHttp ? 'HTTP' : 'WebSocket'}</span>
                    </span>
                    <span className="text-muted-foreground">
                      aria2 版本: <span className="font-mono text-foreground">{version || '-'}</span>
                    </span>
                    <span className="min-w-0 text-muted-foreground">
                      会话 ID:{' '}
                      <span className="font-mono text-foreground" title={sessionId || undefined}>
                        {sessionId ? sessionId.slice(0, 16) : '-'}
                      </span>
                    </span>
                  </div>
                  {features.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-muted-foreground">启用特性:</span>
                      {features.map((f) => (
                        <Badge key={f} variant="muted">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Checkbox
                  checked={conn.secure}
                  onChange={(e) => patchConn({ secure: e.target.checked })}
                  label={<span className="text-[13px]">使用 HTTPS / WSS</span>}
                />
                <Button variant="primary" size="sm" onClick={saveConnection}>
                  <RefreshCw className="size-4" />
                  保存并重连
                </Button>
              </CardFooter>
            </Card>

            {/* ---------------------------------------------- profiles */}
            <Card>
              <CardHeader
                icon={Link2}
                title="RPC 服务器"
                description="保存多个 aria2 端点，随时一键切换"
                actions={
                  <Button variant="secondary" size="sm" onClick={addCurrentProfile}>
                    <Plus className="size-4" />
                    添加当前
                  </Button>
                }
              />
              <CardContent>
                {profiles.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    暂无已保存的服务器，填写连接信息后点击“添加”
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {profiles.map((p, index) => {
                      const activeProfileItem = index === activeProfile
                      return (
                        <li
                          key={`${profileKey(p)}-${index}`}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 text-[13px] transition-colors',
                            activeProfileItem ? 'bg-primary/5' : 'hover:bg-muted/40',
                          )}
                        >
                          <span
                            className={cn('size-2 shrink-0 rounded-full', activeProfileItem ? 'bg-emerald-500' : 'bg-muted-foreground/30')}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-foreground">{profileName(p)}</span>
                              {p.secure && <Badge variant="muted">HTTPS</Badge>}
                              {activeProfileItem && <Badge variant="default">当前</Badge>}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {p.path}
                              {p.secret ? ' · RPC 秘钥 ***' : ''}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => switchProfile(index)}
                              disabled={activeProfileItem}
                              title="切换"
                            >
                              {activeProfileItem ? <Check className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                              {activeProfileItem ? '当前' : '切换'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => void deleteProfile(index)}
                              title="删除"
                              aria-label="删除"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* ---------------------------------------------- log */}
            <ConnectionEventLog
              events={events}
              onClear={() => useConnection.getState().clearEvents()}
            />
          </section>

          {/* ================================================ ARIA2 SETTINGS */}
          <section id="basic" ref={registerSection('basic')} className="scroll-mt-14 space-y-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  修改立即生效（部分选项需重启 aria2 才完全生效），共 {ARIA2_OPTION_COUNT} 项。
                </span>
              </div>
              {!connected && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>未连接 aria2，无法读取或修改下载选项</span>
                </div>
              )}
            </div>
            <Aria2GroupCard
              group={ARIA2_OPTION_GROUPS[0]}
              draft={draft}
              loaded={globalOptions}
              connected={connected}
              saving={savingGroupId === ARIA2_OPTION_GROUPS[0].id}
              onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
              onSave={(g, payload, count) => void saveGroup(g, payload, count)}
            />
          </section>

          {ARIA2_OPTION_GROUPS.slice(1).map((group) => (
            <section key={group.id} id={group.id} ref={registerSection(group.id)} className="scroll-mt-14">
              <Aria2GroupCard
                group={group}
                draft={draft}
                loaded={globalOptions}
                connected={connected}
                saving={savingGroupId === group.id}
                onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
                onSave={(g, payload, count) => void saveGroup(g, payload, count)}
              />
            </section>
          ))}

          {/* ================================================ APPEARANCE */}
          <section id="appearance" ref={registerSection('appearance')} className="scroll-mt-14 space-y-5">
            <Card>
              <CardHeader icon={Palette} title="外观" description="主题与任务列表刷新频率" />
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="主题" className="md:col-span-2">
                    <Tabs
                      variant="segmented"
                      value={theme}
                      onChange={(v) => useSettings.getState().setTheme(v as ThemeMode)}
                      items={[
                        { key: 'system', label: '跟随系统' },
                        { key: 'light', label: '浅色' },
                        { key: 'dark', label: '深色' },
                      ]}
                    />
                  </Field>
                  <Field label="刷新间隔（毫秒）" htmlFor="st-polling" hint="任务列表的刷新频率，最小 250 毫秒">
                    <Input
                      id="st-polling"
                      type="number"
                      min={250}
                      step={250}
                      value={pollingInterval}
                      onChange={(e) => useSettings.getState().setPollingInterval(Number(e.target.value))}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            {/* ---------------------------------------------- title */}
            <Card>
              <CardHeader icon={Type} title="页面标题模板" description="用下方占位符自定义浏览器标签页标题" />
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="页面标题模板" htmlFor="st-title" className="md:col-span-2">
                    <Input
                      id="st-title"
                      className="font-mono text-xs"
                      value={titleTemplate}
                      onChange={(e) => useSettings.getState().setTitleTemplate(e.target.value)}
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="标题刷新间隔（毫秒）" htmlFor="st-title-interval" hint="填 0 表示不刷新标题">
                    <Input
                      id="st-title-interval"
                      type="number"
                      min={0}
                      step={250}
                      value={updateTitleInterval}
                      onChange={(e) => useSettings.getState().setUpdateTitleInterval(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="效果预览">
                    <div className="flex h-9 items-center truncate rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                      <span className="truncate" title={titlePreview}>
                        {titlePreview}
                      </span>
                    </div>
                  </Field>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Info className="size-3" aria-hidden="true" />
                    可用占位符：
                  </span>{' '}
                  <code className="font-mono text-foreground">{'${downspeed}'}</code>{' '}
                  <code className="font-mono text-foreground">{'${upspeed}'}</code>{' '}
                  <code className="font-mono text-foreground">{'${downcount}'}</code>{' '}
                  <code className="font-mono text-foreground">{'${waiting}'}</code>
                </div>
              </CardContent>
            </Card>

            {/* ---------------------------------------------- notifications */}
            <Card>
              <CardHeader icon={Bell} title="桌面通知" description="下载完成时通过浏览器通知提醒" />
              <CardContent className="space-y-4">
                {!notificationsSupported ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    当前浏览器不支持桌面通知
                  </div>
                ) : permission !== 'granted' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
                    <span className="text-muted-foreground">
                      {permission === 'denied' ? '通知权限已被拒绝，请在浏览器站点设置中允许通知' : '尚未授予通知权限'}
                    </span>
                    {permission !== 'denied' && (
                      <Button variant="secondary" size="sm" onClick={() => void requestNotificationPermission()}>
                        允许通知
                      </Button>
                    )}
                  </div>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <Switch
                    checked={notifications && permission === 'granted'}
                    onChange={(v) => useSettings.getState().setNotifications(v)}
                    disabled={!notificationsSupported || permission !== 'granted'}
                    label="桌面通知"
                    description="下载完成时通过浏览器通知提醒"
                  />
                  <Switch
                    checked={notificationSound}
                    onChange={(v) => useSettings.getState().setNotificationSound(v)}
                    disabled={!notifications}
                    label="通知提示音"
                  />
                  <Field label="通知频率" className="md:col-span-2">
                    <Tabs
                      variant="segmented"
                      value={notificationFrequency}
                      onChange={(v) => useSettings.getState().setNotificationFrequency(v as NotificationFrequency)}
                      items={[
                        { key: 'high', label: '高频' },
                        { key: 'middle', label: '中频' },
                        { key: 'low', label: '低频' },
                      ]}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ================================================ ABOUT / RESET */}
          <section id="about" ref={registerSection('about')} className="scroll-mt-14 space-y-5">
            <Card>
              <CardHeader icon={Info} title="关于 / 数据" description="版本信息与恢复默认设置" />
              <CardContent className="space-y-4">
                <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  {infoRow('关于 AriaUI', 'AriaUI')}
                  {infoRow('基于 aria2 JSON-RPC 驱动', 'aria2 RPC')}
                  {infoRow('aria2 版本', version || '-')}
                  {infoRow('存储位置', '本地浏览器存储（不上传）')}
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => void resetAll()}>
                  <RotateCcw className="size-4" />
                  恢复默认设置
                </Button>
              </CardFooter>
            </Card>
          </section>
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// aria2 option group card
// ---------------------------------------------------------------------------

interface Aria2GroupCardProps {
  group: Aria2OptionGroup
  draft: Record<string, string>
  loaded: Record<string, string | undefined>
  connected: boolean
  saving: boolean
  onChange: (key: string, value: string) => void
  onSave: (group: Aria2OptionGroup, payload: Record<string, string>, count: number) => void
}

function Aria2GroupCard({ group, draft, loaded, connected, saving, onChange, onSave }: Aria2GroupCardProps) {
  const payload: Record<string, string> = {}
  let dirtyCount = 0
  let invalidCount = 0

  const rows = group.options.map((def) => {
    const value = draft[def.key] ?? ''
    if (def.readonly) return { def, value, error: null as string | null, dirty: false }
    const error = validateValue(def, value)
    const dirty = value.trim() !== toDraftValue(def, loaded[def.key] ?? '').trim()
    if (dirty) {
      if (error) {
        invalidCount++
      } else {
        dirtyCount++
        const v = toPayloadValue(def, value)
        if (v) payload[def.key] = v
      }
    }
    return { def, value, error, dirty }
  })

  const Icon = GROUP_ICONS[group.id]

  return (
    <Card>
      <CardHeader
        icon={Icon}
        title={group.label}
        description={`${group.options.length} 项选项`}
        actions={
          dirtyCount > 0 ? (
            <Badge variant="info">{`${dirtyCount} 项修改`}</Badge>
          ) : (
            invalidCount > 0 && <Badge variant="danger">{`${invalidCount} 项无效`}</Badge>
          )
        }
      />
      <CardContent>
        <div className="divide-y divide-border">
          {rows.map(({ def, value, error, dirty }) => (
            <OptionRow
              key={def.key}
              def={def}
              value={value}
              error={error}
              dirty={dirty}
              connected={connected}
              onChange={onChange}
            />
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <span className="text-xs text-muted-foreground">
          {invalidCount > 0
            ? `${invalidCount} 项取值无效，已暂停保存`
            : dirtyCount > 0
              ? `${dirtyCount} 项待保存`
              : '无修改'}
        </span>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!connected || dirtyCount === 0 || invalidCount > 0}
          onClick={() => onSave(group, payload, dirtyCount)}
        >
          保存修改
        </Button>
      </CardFooter>
    </Card>
  )
}

interface OptionRowProps {
  def: Aria2OptionDef
  value: string
  error: string | null
  dirty: boolean
  connected: boolean
  onChange: (key: string, value: string) => void
}

function OptionRow({ def, value, error, dirty, connected, onChange }: OptionRowProps) {
  const disabled = def.readonly || !connected
  const hint = unitHint(def)

  const header = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[13px] font-medium text-foreground">{def.label}</span>
      {def.readonly && <Badge variant="muted">只读</Badge>}
      {def.since && <Badge variant="outline">{`${def.since}+`}</Badge>}
      {dirty && !error && <Badge variant="info">已修改</Badge>}
      {error && <Badge variant="danger">无效</Badge>}
    </div>
  )

  const description = def.description ? (
    <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground">{def.description}</p>
  ) : null

  // Multi-value text options get a full-width textarea below the label.
  if (def.type === 'text') {
    return (
      <div className="space-y-1.5 py-3">
        {header}
        {description}
        <Textarea
          rows={3}
          className="min-h-16 font-mono text-[13px]"
          value={value}
          disabled={disabled}
          invalid={!!error}
          onChange={(e) => onChange(def.key, e.target.value)}
          placeholder={def.defaultValue}
          spellCheck={false}
        />
        {error ? (
          <p className="text-[11px] text-destructive">{error}</p>
        ) : (
          hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>
        )}
      </div>
    )
  }

  let control: React.ReactNode
  if (def.type === 'boolean') {
    const choices = [
      { value: 'true', label: '开' },
      { value: 'false', label: '关' },
    ]
    const options = choices.some((o) => o.value === value) ? choices : [{ value: '', label: '-' }, ...choices]
    control = (
      <Select
        options={options}
        value={value}
        disabled={disabled}
        invalid={!!error}
        aria-label={def.label}
        onChange={(e) => onChange(def.key, e.target.value)}
      />
    )
  } else if (def.type === 'option') {
    const choices = def.options ?? []
    const options = value && choices.some((o) => o.value === value) ? choices : [{ value: '', label: '-' }, ...choices]
    control = (
      <Select
        options={options}
        value={value}
        disabled={disabled}
        invalid={!!error}
        aria-label={def.label}
        onChange={(e) => onChange(def.key, e.target.value)}
      />
    )
  } else {
    control = (
      <Input
        value={value}
        disabled={disabled}
        invalid={!!error}
        inputMode={def.type === 'integer' ? 'numeric' : def.type === 'float' ? 'decimal' : undefined}
        placeholder={def.defaultValue}
        aria-label={def.label}
        onChange={(e) => onChange(def.key, e.target.value)}
        spellCheck={false}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0">
        {header}
        {description}
      </div>
      <div className="w-full shrink-0 space-y-1 sm:w-64">
        {control}
        {error ? (
          <p className="text-[11px] text-destructive">{error}</p>
        ) : (
          hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>
        )}
      </div>
    </div>
  )
}

/** Card footer: right-aligned actions, separated from the body by a border. */
function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 [&>*:last-child]:ml-auto [&:only-child]:justify-end">
      {children}
    </div>
  )
}
