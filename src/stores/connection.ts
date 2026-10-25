import { create } from 'zustand'
import { client } from '@/api/rpc'
import type { RpcState } from '@/api/rpc'
import type { Aria2ConnectionConfig, ConnectionEvent } from '@/types/settings'
import { useSettings } from './settings'
import { useTasks } from './tasks'

const MAX_EVENTS = 200

/** Collapse notification bursts into one refresh after this quiet period */
const REFRESH_DEBOUNCE_MS = 300
/** Never refresh due to notifications more often than this */
const REFRESH_MIN_INTERVAL_MS = 500

let subscribed = false
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let lastNotificationRefresh = 0

/** Chinese log lines for the notifications aria2 pushes over WebSocket */
const NOTIFICATION_LABELS: Record<string, string> = {
  'aria2.onDownloadStart': '开始下载',
  'aria2.onDownloadPause': '已暂停',
  'aria2.onDownloadStop': '已停止',
  'aria2.onDownloadComplete': '下载完成',
  'aria2.onDownloadError': '下载出错',
  'aria2.onBtDownloadComplete': 'BT 下载完成',
}

/**
 * Debounced + throttled task refresh triggered by aria2 notifications:
 * waits 300ms for a burst to settle, and keeps at least 500ms between runs.
 */
function scheduleNotificationRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    const run = () => {
      lastNotificationRefresh = Date.now()
      void useTasks.getState().refresh()
    }
    const wait = REFRESH_MIN_INTERVAL_MS - (Date.now() - lastNotificationRefresh)
    if (wait > 0) setTimeout(run, wait)
    else run()
  }, REFRESH_DEBOUNCE_MS)
}

interface ConnectionState {
  state: RpcState
  version: string
  enabledFeatures: string[]
  sessionId: string
  /** Active transport is HTTP rather than WebSocket */
  useHttp: boolean
  /** Newest first */
  events: ConnectionEvent[]
  connect: () => void
  disconnect: () => void
  reconnect: () => void
  applyConnection: (partial: Partial<Aria2ConnectionConfig>) => void
  clearEvents: () => void
}

export const useConnection = create<ConnectionState>((set, get) => {
  async function loadServerInfo() {
    try {
      const info = await client.call<{ version: string; enabledFeatures: string[] }>('getVersion')
      set({ version: info?.version ?? '', enabledFeatures: Array.isArray(info?.enabledFeatures) ? info.enabledFeatures : [] })
    } catch {
      set({ version: '', enabledFeatures: [] })
    }
    try {
      const session = await client.call<{ sessionId: string }>('getSessionInfo')
      set({ sessionId: session?.sessionId ?? '' })
    } catch {
      set({ sessionId: '' })
    }
  }

  function subscribe() {
    if (subscribed) return
    subscribed = true
    client.onState((next) => {
      set({ state: next, useHttp: client.useHttp })
      if (next === 'connected') void loadServerInfo()
      else if (next === 'idle' || next === 'disconnected') set({ version: '', enabledFeatures: [], sessionId: '' })
    })
    client.onEvent((event) => {
      set({ events: [event, ...get().events].slice(0, MAX_EVENTS) })
    })
    client.onNotification((method, gid) => {
      const label = NOTIFICATION_LABELS[method]
      client.note('info', label ? `任务 ${gid} ${label}` : `收到通知 ${method}（任务 ${gid}）`)
      scheduleNotificationRefresh()
    })
  }

  return {
    state: client.state,
    version: '',
    enabledFeatures: [],
    sessionId: '',
    useHttp: client.useHttp,
    events: [...client.events].reverse(),
    connect: () => {
      subscribe()
      const s = useSettings.getState()
      client.connect(s.connection, { protocol: s.protocol, autoReconnectInterval: s.autoReconnectInterval })
      set({ state: client.state, useHttp: client.useHttp })
    },
    disconnect: () => {
      client.disconnect()
      set({ state: client.state, version: '', enabledFeatures: [], sessionId: '' })
    },
    reconnect: () => {
      subscribe()
      client.disconnect()
      const s = useSettings.getState()
      client.connect(s.connection, { protocol: s.protocol, autoReconnectInterval: s.autoReconnectInterval })
      set({ state: client.state, useHttp: client.useHttp })
    },
    applyConnection: (partial: Partial<Aria2ConnectionConfig>) => {
      useSettings.getState().updateConnection(partial)
      get().reconnect()
    },
    clearEvents: () => set({ events: [] }),
  }
})
