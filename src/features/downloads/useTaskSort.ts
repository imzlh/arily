import { create } from 'zustand'
import type { TaskSortDir, TaskSortKey } from '@/lib/task'

const STORAGE_KEY = 'ariaui.task-sort.v1'

const KEYS: readonly TaskSortKey[] = ['default', 'name', 'size', 'progress', 'eta', 'downSpeed', 'upSpeed']

export interface TaskSort {
  key: TaskSortKey
  dir: TaskSortDir
}

const FALLBACK: TaskSort = { key: 'default', dir: 'asc' }

/** Accept only known keys/directions; anything else falls back to aria2 order. */
function sanitize(raw: unknown): TaskSort {
  if (!raw || typeof raw !== 'object') return FALLBACK
  const o = raw as { key?: unknown; dir?: unknown }
  const key = KEYS.includes(o.key as TaskSortKey) ? (o.key as TaskSortKey) : 'default'
  const dir: TaskSortDir = o.dir === 'desc' ? 'desc' : 'asc'
  return { key, dir: key === 'default' ? 'asc' : dir }
}

function load(): TaskSort {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return FALLBACK
    return sanitize(JSON.parse(text))
  } catch {
    return FALLBACK
  }
}

interface TaskSortState {
  sort: TaskSort
  setSort: (sort: TaskSort) => void
}

/** List sort preference, shared by the toolbar control and the list itself. */
export const useTaskSortStore = create<TaskSortState>((set) => ({
  sort: load(),
  setSort: (sort) => {
    const next = sanitize(sort)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Private mode / storage disabled: sorting still works for the session.
    }
    set({ sort: next })
  },
}))
