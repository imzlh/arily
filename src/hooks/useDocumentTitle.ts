import { useEffect } from 'react'
import { useSettings } from '@/stores/settings'
import { useTasks } from '@/stores/tasks'
import { formatSpeed } from '@/lib/format'

/** Fill the document title template with live values (ported from SettingsPage). */
export function renderTitle(template: string, downspeed: string, upspeed: string): string {
  return template
    .replace(/\$\{downspeed\}|\{downspeed\}/g, downspeed)
    .replace(/\$\{upspeed\}|\{upspeed\}/g, upspeed)
    .replace(/\$\{downcount\}|\{downcount\}/g, String(useTasks.getState().active.length))
    .replace(/\$\{waiting\}|\{waiting\}/g, useTasks.getState().stat.numWaiting ?? '0')
}

/**
 * Keeps `document.title` in sync with the user's title template and the live
 * task speeds. Mount once in the app shell.
 *
 * Semantics (mirrors the previous SettingsPage effect):
 * - `updateTitleInterval <= 0` renders one static title with "0 B/s" speeds.
 * - Otherwise the title refreshes on an interval (minimum 250ms) and, as an
 *   extra, immediately after every successful poll (tasks store stat change).
 *
 * The template placeholders are `${downspeed}`, `${upspeed}`, `${downcount}`
 * and `${waiting}`; braces without the dollar sign work too.
 */
export function useDocumentTitle() {
  const titleTemplate = useSettings((s) => s.titleTemplate)
  const updateTitleInterval = useSettings((s) => s.updateTitleInterval)

  useEffect(() => {
    if (updateTitleInterval <= 0) {
      document.title = renderTitle(titleTemplate, '0 B/s', '0 B/s')
      return
    }
    const apply = () => {
      const stat = useTasks.getState().stat
      document.title = renderTitle(titleTemplate, formatSpeed(stat.downloadSpeed), formatSpeed(stat.uploadSpeed))
    }
    apply()
    const id = window.setInterval(apply, Math.max(updateTitleInterval, 250))
    // Refresh immediately on each poll so the title never lags a full interval behind.
    const unsubscribe = useTasks.subscribe((s, prev) => {
      if (s.stat !== prev.stat) apply()
    })
    return () => {
      window.clearInterval(id)
      unsubscribe()
    }
  }, [titleTemplate, updateTitleInterval])
}
