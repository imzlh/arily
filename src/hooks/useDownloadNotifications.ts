import { useEffect, useState } from 'react'
import type { NotificationFrequency } from '@/types/settings'
import { useSettings } from '@/stores/settings'
import { useTasks } from '@/stores/tasks'

/** Frequency -> minimum gap in ms between notifications (ported from SettingsPage). */
const NOTIFICATION_GAP: Record<NotificationFrequency, number> = {
  high: 0,
  middle: 5000,
  low: 30000,
}

export const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window

// ---------------------------------------------------------------- permission
// Module-level so every consumer of the hook sees the same permission state.

let currentPermission: NotificationPermission = notificationsSupported ? Notification.permission : 'denied'
const permissionListeners = new Set<(p: NotificationPermission) => void>()

function setPermission(next: NotificationPermission) {
  currentPermission = next
  for (const listener of permissionListeners) listener(next)
}

async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported) return 'denied'
  try {
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  } catch {
    setPermission('denied')
    return 'denied'
  }
}

// ------------------------------------------------------------- engine state
// Module-level singletons so the hook can be mounted from several components
// (app shell + a settings UI) without double notifications.

/** GIDs already announced; grows for the session lifetime like the original. */
const notified = new Set<string>()
/** First stopped-list snapshot after (re)enabling; null = take a new baseline. */
let initialStopped: string[] | null = null
let lastNotify = 0

export interface DownloadNotifications {
  /** Current browser notification permission. */
  permission: NotificationPermission
  /** Whether the Web Notification API exists at all. */
  supported: boolean
  /** Ask the user for permission; enables the setting on success. */
  requestPermission: () => Promise<void>
}

/**
 * Desktop completion-notification engine (ported from SettingsPage).
 * Mount once in the app shell; the settings UI can call the same hook for
 * `permission` / `requestPermission` — the diffing state is shared, so
 * notifications never fire twice.
 *
 * Semantics: while the `notifications` setting is on and permission is
 * granted, the stopped-task list is diffed on every store update; new gids
 * fire a notification, throttled by `notificationFrequency`
 * (实时 0ms / 普通 5s / 低频 30s). Re-enabling re-baselines, so history is
 * never announced.
 */
export function useDownloadNotifications(): DownloadNotifications {
  const notifications = useSettings((s) => s.notifications)
  const notificationSound = useSettings((s) => s.notificationSound)
  const notificationFrequency = useSettings((s) => s.notificationFrequency)
  const [permission, setPermissionState] = useState<NotificationPermission>(currentPermission)

  useEffect(() => {
    permissionListeners.add(setPermissionState)
    return () => {
      permissionListeners.delete(setPermissionState)
    }
  }, [])

  const request = async () => {
    const result = await requestPermission()
    if (result === 'granted') useSettings.getState().setNotifications(true)
  }

  // If the setting is switched on while permission was never asked, ask now.
  // With the original settings UI this never triggers (the switch is disabled
  // until granted); it keeps the engine self-sufficient for other callers.
  useEffect(() => {
    if (notifications && notificationsSupported && currentPermission === 'default') {
      void requestPermission().then((result) => {
        if (result === 'granted') useSettings.getState().setNotifications(true)
      })
    }
  }, [notifications])

  useEffect(() => {
    if (!notificationsSupported || !notifications || permission !== 'granted') return
    const fire = (gid: string) => {
      const task = useTasks.getState().stopped.find((x) => x.gid === gid)
      const name = task?.bittorrent?.info?.name ?? task?.files?.[0]?.path?.split(/[\\/]/).pop() ?? gid
      try {
        const n = new Notification(`下载完成：${name}`, {
          icon: '/favicon.ico',
          tag: `ariaui-complete-${gid}`,
          silent: !notificationSound,
        })
        n.onclick = () => window.focus()
      } catch {
        // Some browsers (e.g. Android) only allow notifications from a service worker.
      }
    }
    const handleStopped = (stopped: { gid: string }[]) => {
      const gids = stopped.map((task) => task.gid)
      // First snapshot after (re)enabling: remember it, don't notify for history.
      if (initialStopped === null) {
        initialStopped = gids
        return
      }
      const previous = new Set(initialStopped)
      const fresh = gids.filter((gid) => !previous.has(gid) && !notified.has(gid))
      initialStopped = gids
      const gap = NOTIFICATION_GAP[notificationFrequency]
      for (const gid of fresh) {
        notified.add(gid)
        const now = Date.now()
        if (now - lastNotify < gap) continue
        lastNotify = now
        fire(gid)
      }
    }
    initialStopped = null
    handleStopped(useTasks.getState().stopped)
    return useTasks.subscribe((s, prev) => {
      if (s.stopped === prev.stopped) return
      handleStopped(s.stopped)
    })
  }, [notifications, permission, notificationSound, notificationFrequency])

  return { permission, supported: notificationsSupported, requestPermission: request }
}
