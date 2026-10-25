import { create } from 'zustand'

export interface TaskFormPrefill {
  uris?: string[]
  torrents?: File[]
  metalinks?: File[]
  dir?: string
}

/** localStorage key for the persisted "保存到" directory history */
const DIR_HISTORY_KEY = 'ariaui.dir-history.v1'
const DIR_HISTORY_LIMIT = 10

/** Normalize a directory for storage/dedupe: trim + strip trailing separators. */
function normalizeDir(dir: string): string {
  return dir.trim().replace(/[\\/]+$/, '')
}

function loadDirHistory(): string[] {
  try {
    const raw = localStorage.getItem(DIR_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string') continue
      const dir = normalizeDir(item)
      if (!dir || seen.has(dir)) continue
      seen.add(dir)
      out.push(dir)
    }
    return out.slice(0, DIR_HISTORY_LIMIT)
  } catch {
    return []
  }
}

function saveDirHistory(dirs: string[]) {
  try {
    localStorage.setItem(DIR_HISTORY_KEY, JSON.stringify(dirs))
  } catch {
    // storage unavailable (private mode, quota) — keep running in memory
  }
}

interface TaskFormState {
  open: boolean
  prefill: TaskFormPrefill | null
  /** Recently used download directories, most recent first (persisted, max 10) */
  dirHistory: string[]
  openForm: (prefill?: TaskFormPrefill) => void
  closeForm: () => void
  consumePrefill: () => TaskFormPrefill | null
  /** Push a directory into the history (deduped, capped at 10, persisted) */
  addDirHistory: (dir: string) => void
  clearDirHistory: () => void
}

/** Opens the new-task dialog, optionally pre-filled (toolbar button, drag & drop). */
export const useTaskForm = create<TaskFormState>((set, get) => ({
  open: false,
  prefill: null,
  dirHistory: loadDirHistory(),
  openForm: (prefill) => set({ open: true, prefill: prefill ?? null }),
  closeForm: () => set({ open: false }),
  consumePrefill: () => {
    const current = get().prefill
    if (current) set({ prefill: null })
    return current
  },
  addDirHistory: (dir) => {
    const value = normalizeDir(dir)
    if (!value) return
    const next = [value, ...get().dirHistory.filter((d) => d !== value)].slice(0, DIR_HISTORY_LIMIT)
    saveDirHistory(next)
    set({ dirHistory: next })
  },
  clearDirHistory: () => {
    saveDirHistory([])
    set({ dirHistory: [] })
  },
}))
