import { create } from 'zustand'

/**
 * Multi-selection of task gids for the batch action bar and the context menu.
 *
 * Deliberately a small standalone store instead of DownloadsPage state: rows
 * subscribe to their own gid (`selected.has(gid)` is a primitive selector) so
 * a checkbox click only re-renders the two affected rows and TaskRow's memo
 * keeps paying off. The tasks store itself stays read-only.
 */
interface TaskSelectionState {
  selected: ReadonlySet<string>
  /** Toggle one gid (row checkbox). */
  toggle: (gid: string) => void
  /** Replace the selection with a single gid (right-click a row). */
  selectOnly: (gid: string) => void
  /** Replace the selection with exactly these gids (select all visible). */
  setAll: (gids: readonly string[]) => void
  clear: () => void
}

export const useTaskSelection = create<TaskSelectionState>((set) => ({
  selected: new Set<string>(),
  toggle: (gid) =>
    set((s) => {
      const next = new Set(s.selected)
      if (next.has(gid)) next.delete(gid)
      else next.add(gid)
      return { selected: next }
    }),
  selectOnly: (gid) => set({ selected: new Set([gid]) }),
  setAll: (gids) => set({ selected: new Set(gids) }),
  clear: () => set({ selected: new Set<string>() }),
}))
