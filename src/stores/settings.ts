import { create } from 'zustand'
import type { Aria2ConnectionConfig, NotificationFrequency, ThemeMode, TransportProtocol } from '@/types/settings'

const STORAGE_KEY = 'ariaui.settings.v1'

/** Default document title template; the placeholders are replaced in SettingsPage. */
export const DEFAULT_TITLE_TEMPLATE = 'AriaUI — ${downspeed} ↓ / ${upspeed} ↑'

export interface SettingsProfile {
  connection: Aria2ConnectionConfig
}

interface Persisted {
  connection: Aria2ConnectionConfig
  theme: ThemeMode
  pollingInterval: number
  /** Transport preference; 'auto' = try WebSocket, fall back to HTTP */
  protocol: TransportProtocol
  /** Reconnect back-off in ms (informational until rpc.ts consumes it) */
  autoReconnectInterval: number
  /** Saved RPC endpoints */
  profiles: Aria2ConnectionConfig[]
  /** Index into `profiles`, or -1 when the current connection is unsaved */
  activeProfile: number
  titleTemplate: string
  /** How often the document title is refreshed, 0 = keep a static title */
  updateTitleInterval: number
  notifications: boolean
  notificationSound: boolean
  notificationFrequency: NotificationFrequency
}

function defaults(): Persisted {
  return {
    connection: { host: '127.0.0.1', port: 6800, secret: '', path: '/jsonrpc', secure: false },
    theme: 'system',
    pollingInterval: 1000,
    protocol: 'auto',
    autoReconnectInterval: 5000,
    profiles: [],
    activeProfile: -1,
    titleTemplate: DEFAULT_TITLE_TEMPLATE,
    updateTitleInterval: 1000,
    notifications: false,
    notificationSound: true,
    notificationFrequency: 'middle',
  }
}

function sanitizeConnection(raw: unknown, base: Aria2ConnectionConfig): Aria2ConnectionConfig {
  if (!raw || typeof raw !== 'object') return { ...base }
  return { ...base, ...(raw as Partial<Aria2ConnectionConfig>) }
}

function sanitizeProfiles(raw: unknown): Aria2ConnectionConfig[] {
  if (!Array.isArray(raw)) return []
  const base = defaults().connection
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => sanitizeConnection(p, base))
    .filter((p) => typeof p.host === 'string' && p.host.trim().length > 0)
}

function load(): Persisted {
  const base = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Persisted> | null
    if (!parsed || typeof parsed !== 'object') return base
    const poll = Number(parsed.pollingInterval)
    const reconnect = Number(parsed.autoReconnectInterval)
    const titleInterval = Number(parsed.updateTitleInterval)
    const profiles = sanitizeProfiles(parsed.profiles)
    const active = Number(parsed.activeProfile)
    return {
      connection: sanitizeConnection(parsed.connection, base.connection),
      theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : base.theme,
      pollingInterval: Number.isFinite(poll) && poll >= 250 ? poll : base.pollingInterval,
      protocol:
        parsed.protocol === 'websocket' || parsed.protocol === 'http' || parsed.protocol === 'auto'
          ? parsed.protocol
          : base.protocol,
      autoReconnectInterval:
        Number.isFinite(reconnect) && reconnect >= 0 ? reconnect : base.autoReconnectInterval,
      profiles,
      activeProfile:
        Number.isInteger(active) && active >= -1 && active < profiles.length ? active : -1,
      titleTemplate: typeof parsed.titleTemplate === 'string' ? parsed.titleTemplate : base.titleTemplate,
      updateTitleInterval:
        Number.isFinite(titleInterval) && titleInterval >= 0 && titleInterval <= 60000
          ? titleInterval
          : base.updateTitleInterval,
      notifications: typeof parsed.notifications === 'boolean' ? parsed.notifications : base.notifications,
      notificationSound: typeof parsed.notificationSound === 'boolean' ? parsed.notificationSound : base.notificationSound,
      notificationFrequency:
        parsed.notificationFrequency === 'high' ||
        parsed.notificationFrequency === 'middle' ||
        parsed.notificationFrequency === 'low'
          ? parsed.notificationFrequency
          : base.notificationFrequency,
    }
  } catch {
    return base
  }
}

function persist(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable (private mode, quota) — keep running in memory
  }
}

interface SettingsState extends Persisted {
  updateConnection: (partial: Partial<Aria2ConnectionConfig>) => void
  setTheme: (theme: ThemeMode) => void
  setPollingInterval: (ms: number) => void
  setProtocol: (protocol: TransportProtocol) => void
  setAutoReconnectInterval: (ms: number) => void
  /** Append a profile (deduped by host:port:secure) and select it. Returns its index. */
  addProfile: (connection: Aria2ConnectionConfig) => number
  /** Replace the profile with `index` and make it active. */
  updateProfile: (index: number, connection: Aria2ConnectionConfig) => void
  deleteProfile: (index: number) => void
  setActiveProfile: (index: number) => void
  setTitleTemplate: (template: string) => void
  setUpdateTitleInterval: (ms: number) => void
  setNotifications: (enabled: boolean) => void
  setNotificationSound: (enabled: boolean) => void
  setNotificationFrequency: (frequency: NotificationFrequency) => void
  reset: () => void
}

/** Stable identity for a RPC endpoint, used to dedupe profiles. */
export function profileKey(c: Aria2ConnectionConfig): string {
  return `${c.secure ? 'https' : 'http'}://${c.host}:${c.port}${c.path}`
}

/** Human readable name for a profile: host:port */
export function profileName(c: Aria2ConnectionConfig): string {
  return `${c.host}:${c.port}`
}

export const useSettings = create<SettingsState>((set, get) => {
  const initial = load()
  return {
    ...initial,
    updateConnection: (partial) => {
      set({ connection: { ...get().connection, ...partial } })
      persist(get())
    },
    setTheme: (theme) => {
      set({ theme })
      persist(get())
    },
    setPollingInterval: (ms) => {
      if (!Number.isFinite(ms) || ms < 250) return
      set({ pollingInterval: ms })
      persist(get())
    },
    setProtocol: (protocol) => {
      set({ protocol })
      persist(get())
    },
    setAutoReconnectInterval: (ms) => {
      if (!Number.isFinite(ms) || ms < 0) return
      set({ autoReconnectInterval: ms })
      persist(get())
    },
    addProfile: (connection) => {
      const key = profileKey(connection)
      const profiles = get().profiles
      const existing = profiles.findIndex((p) => profileKey(p) === key)
      if (existing >= 0) {
        const next = profiles.slice()
        next[existing] = { ...connection }
        set({ profiles: next, activeProfile: existing })
      } else {
        set({ profiles: [...profiles, { ...connection }], activeProfile: profiles.length })
      }
      persist(get())
      return get().activeProfile
    },
    updateProfile: (index, connection) => {
      const profiles = get().profiles
      if (index < 0 || index >= profiles.length) return
      const next = profiles.slice()
      next[index] = { ...connection }
      set({ profiles: next, activeProfile: index })
      persist(get())
    },
    deleteProfile: (index) => {
      const profiles = get().profiles
      if (index < 0 || index >= profiles.length) return
      const active = get().activeProfile
      let nextActive = active
      if (active === index) nextActive = -1
      else if (active > index) nextActive = active - 1
      set({ profiles: profiles.filter((_, i) => i !== index), activeProfile: nextActive })
      persist(get())
    },
    setActiveProfile: (index) => {
      if (index < -1 || index >= get().profiles.length) return
      set({ activeProfile: index })
      persist(get())
    },
    setTitleTemplate: (template) => {
      set({ titleTemplate: template })
      persist(get())
    },
    setUpdateTitleInterval: (ms) => {
      if (!Number.isFinite(ms) || ms < 0 || ms > 60000) return
      set({ updateTitleInterval: ms })
      persist(get())
    },
    setNotifications: (enabled) => {
      set({ notifications: enabled })
      persist(get())
    },
    setNotificationSound: (enabled) => {
      set({ notificationSound: enabled })
      persist(get())
    },
    setNotificationFrequency: (frequency) => {
      set({ notificationFrequency: frequency })
      persist(get())
    },
    reset: () => {
      const next = defaults()
      set(next)
      persist(get())
    },
  }
})

/** Resolve the effective theme, consulting the OS preference for 'system'. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
