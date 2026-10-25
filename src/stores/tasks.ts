import { create } from 'zustand'
import { client, errorText } from '@/api/rpc'
import type { Aria2Status, Aria2Task, GlobalStat, TaskStatus } from '@/types/aria2'
import { getDisplayStatus } from '@/lib/task'

export type TaskFilter = 'all' | 'active' | 'waiting' | 'stopped'

/** Keys requested from aria2 — small payloads, enough for list + inspector */
export const TASK_KEYS = [
  'gid',
  'status',
  'totalLength',
  'completedLength',
  'uploadLength',
  'downloadSpeed',
  'uploadSpeed',
  'connections',
  'numSeeders',
  'seeder',
  'pieceLength',
  'numPieces',
  'bitfield',
  'dir',
  'files',
  'bittorrent',
  'errorCode',
  'errorMessage',
  'followedBy',
  'following',
  'belongsTo',
  'infoHash',
  'verifiedLength',
  'verifyIntegrityPending',
  'completedTime',
]

const STOPPED_LIMIT = 1000

const EMPTY_STAT: GlobalStat = {
  downloadSpeed: '0',
  uploadSpeed: '0',
  numActive: '0',
  numWaiting: '0',
  numStopped: '0',
  numStoppedTotal: '0',
}

interface TaskState {
  active: Aria2Task[]
  waiting: Aria2Task[]
  stopped: Aria2Task[]
  stat: GlobalStat
  filter: TaskFilter
  search: string
  selectedGid: string | null
  /** GIDs with an action in flight */
  busy: Record<string, boolean>
  lastError: string | null
  /** Set by usePolling; incremented on every successful refresh */
  pollCount: number

  setFilter: (f: TaskFilter) => void
  setSearch: (s: string) => void
  select: (gid: string | null) => void
  clearError: () => void
  clearAll: () => void

  refresh: () => Promise<void>
  pause: (gid: string) => Promise<void>
  unpause: (gid: string) => Promise<void>
  remove: (gid: string) => Promise<void>
  retry: (gid: string) => Promise<void>
  pauseAll: () => Promise<void>
  unpauseAll: () => Promise<void>
  purgeStopped: () => Promise<void>
  changeOption: (gid: string, options: Record<string, string>) => Promise<void>
  getOption: (gid: string) => Promise<Record<string, string>>
  getServers: (gid: string) => Promise<{ index: string; servers: { uri: string; currentUri: string; downloadSpeed: string }[] }[]>
  changePosition: (gid: string, pos: number, how: 'POS_SET' | 'POS_CUR' | 'POS_END') => Promise<void>
  moveTo: (gid: string, where: 'top' | 'bottom' | 'up' | 'down') => Promise<void>
  batchPause: (gids: string[]) => Promise<BatchResult>
  batchUnpause: (gids: string[]) => Promise<BatchResult>
  batchRemove: (gids: string[]) => Promise<BatchResult>
  batchRetry: (gids: string[]) => Promise<BatchResult>
}

/** Outcome of a batch operation: gids that succeeded and per-gid failures */
export interface BatchResult {
  ok: string[]
  failed: { gid: string; error: string }[]
}

let inFlight = false
let failures = 0

/** Statuses from which a task can be re-added from its original URIs */
function isRetryableStatus(status: Aria2Status): boolean {
  return status === 'error' || status === 'removed' || status === 'complete'
}

/** De-duplicated download URIs of a task, if it has any */
function extractUris(task: Aria2Task): string[] {
  return [...new Set((task.files ?? []).flatMap((f) => (f.uris ?? []).map((u) => u.uri)))].filter(Boolean)
}

/**
 * Execute one call per gid through system.multicall and map the settled
 * results back onto the gids. Never throws: transport-level failures come
 * back as a failure entry for every gid.
 */
async function runBatch(gids: string[], method: (gid: string) => { method: string; params: unknown[] }): Promise<BatchResult> {
  if (gids.length === 0) return { ok: [], failed: [] }
  const ok: string[] = []
  const failed: { gid: string; error: string }[] = []
  try {
    const settled = await Promise.allSettled(await client.multicall(gids.map((gid) => method(gid))))
    gids.forEach((gid, i) => {
      const r = settled[i]
      if (r && r.status === 'fulfilled') ok.push(gid)
      else failed.push({ gid, error: r && r.status === 'rejected' ? errorText(r.reason) : '调用失败' })
    })
  } catch (e) {
    return { ok: [], failed: gids.map((gid) => ({ gid, error: errorText(e) })) }
  }
  return { ok, failed }
}

function allOf(s: Pick<TaskState, 'active' | 'waiting' | 'stopped'>): Aria2Task[] {
  // Waiting comes back in queue order; newest additions should sit on top.
  return [...s.active, ...s.waiting.slice().reverse(), ...s.stopped.slice().reverse()]
}

export const useTasks = create<TaskState>((set, get) => {
  async function act(gid: string, fn: () => Promise<unknown>) {
    set((s) => ({ busy: { ...s.busy, [gid]: true } }))
    try {
      await fn()
      await get().refresh()
    } catch (e) {
      set({ lastError: errorText(e) })
    } finally {
      set((s) => {
        const next = { ...s.busy }
        delete next[gid]
        return { busy: next }
      })
    }
  }

  return {
    active: [],
    waiting: [],
    stopped: [],
    stat: EMPTY_STAT,
    filter: 'all',
    search: '',
    selectedGid: null,
    busy: {},
    lastError: null,
    pollCount: 0,

    setFilter: (filter) => set({ filter }),
    setSearch: (search) => set({ search }),
    select: (selectedGid) => set({ selectedGid }),
    clearError: () => set({ lastError: null }),
    clearAll: () => set({ active: [], waiting: [], stopped: [], stat: EMPTY_STAT }),

    refresh: async () => {
      if (inFlight || !client.ready) return
      inFlight = true
      try {
        // Each slice settles independently: a failing RPC keeps the previous
        // data for that slice instead of blocking the whole refresh.
        const [activeRes, waitingRes, stoppedRes, statRes] = await Promise.allSettled([
          client.call<Aria2Task[]>('tellActive', [TASK_KEYS]),
          client.call<Aria2Task[]>('tellWaiting', [0, STOPPED_LIMIT, TASK_KEYS]),
          client.call<Aria2Task[]>('tellStopped', [0, STOPPED_LIMIT, TASK_KEYS]),
          client.call<GlobalStat>('getGlobalStat'),
        ])
        const patch: Partial<Pick<TaskState, 'active' | 'waiting' | 'stopped' | 'stat'>> = {}
        let okCount = 0
        let firstError: unknown = null
        if (activeRes.status === 'fulfilled') {
          patch.active = activeRes.value ?? []
          okCount += 1
        } else firstError ??= activeRes.reason
        if (waitingRes.status === 'fulfilled') {
          patch.waiting = waitingRes.value ?? []
          okCount += 1
        } else firstError ??= waitingRes.reason
        if (stoppedRes.status === 'fulfilled') {
          patch.stopped = stoppedRes.value ?? []
          okCount += 1
        } else firstError ??= stoppedRes.reason
        if (statRes.status === 'fulfilled' && statRes.value) {
          patch.stat = statRes.value
          okCount += 1
        } else if (statRes.status === 'rejected') {
          firstError ??= statRes.reason
        }
        if (okCount > 0) {
          set((s) => ({ ...patch, pollCount: s.pollCount + 1 }))
          failures = 0
        } else {
          failures += 1
          // Transport problems already show in the connection log; only surface
          // repeated RPC-level failures once to avoid toast spam.
          if (failures === 3) set({ lastError: errorText(firstError) })
        }
      } finally {
        inFlight = false
      }
    },

    pause: (gid) => act(gid, () => client.call('pause', [gid])),
    unpause: (gid) => act(gid, () => client.call('unpause', [gid])),

    remove: async (gid) => {
      const task = allOf(get()).find((t) => t.gid === gid)
      const isLive = task && (task.status === 'active' || task.status === 'waiting' || task.status === 'paused')
      await act(gid, async () => {
        if (isLive) await client.call('remove', [gid])
        await client.call('removeDownloadResult', [gid])
      })
      if (get().selectedGid === gid) set({ selectedGid: null })
    },

    retry: async (gid) => {
      const task = allOf(get()).find((t) => t.gid === gid)
      if (!task) return
      const uris = extractUris(task)
      if (uris.length === 0) {
        set({ lastError: '无法重试：没有可用的下载地址' })
        return
      }
      const options: Record<string, string> = {}
      if (task.dir) options.dir = task.dir
      await act(gid, async () => {
        await client.call('addUri', [uris, options])
        await client.call('removeDownloadResult', [gid])
      })
    },

    pauseAll: async () => {
      try {
        await client.call('pauseAll')
        await get().refresh()
      } catch (e) {
        set({ lastError: errorText(e) })
      }
    },

    unpauseAll: async () => {
      try {
        await client.call('unpauseAll')
        await get().refresh()
      } catch (e) {
        set({ lastError: errorText(e) })
      }
    },

    purgeStopped: async () => {
      try {
        await client.call('purgeDownloadResult')
        await get().refresh()
      } catch (e) {
        set({ lastError: errorText(e) })
      }
    },

    changeOption: async (gid, options) => {
      try {
        await client.call('changeOption', [gid, options])
        await get().refresh()
      } catch (e) {
        set({ lastError: errorText(e) })
        throw e
      }
    },

    getOption: async (gid) => {
      try {
        return (await client.call<Record<string, string>>('getOption', [gid])) ?? {}
      } catch (e) {
        set({ lastError: errorText(e) })
        return {}
      }
    },

    getServers: async (gid) => {
      try {
        return await client.call('getServers', [gid])
      } catch {
        return []
      }
    },

    changePosition: async (gid, pos, how) => {
      try {
        await client.call('changePosition', [gid, pos, how])
        await get().refresh()
      } catch (e) {
        set({ lastError: errorText(e) })
      }
    },

    moveTo: async (gid, where) => {
      if (where === 'up') return get().changePosition(gid, -1, 'POS_CUR')
      if (where === 'down') return get().changePosition(gid, 1, 'POS_CUR')
      // POS_SET against an out-of-range position: aria2 clamps to top/bottom.
      if (where === 'bottom') return get().changePosition(gid, 100000, 'POS_SET')
      return get().changePosition(gid, 0, 'POS_SET')
    },

    batchPause: async (gids) => {
      const result = await runBatch(gids, (gid) => ({ method: 'forcePause', params: [gid] }))
      if (result.ok.length > 0) await get().refresh()
      return result
    },

    batchUnpause: async (gids) => {
      const result = await runBatch(gids, (gid) => ({ method: 'unpause', params: [gid] }))
      if (result.ok.length > 0) await get().refresh()
      return result
    },

    batchRemove: async (gids) => {
      const tasks = allOf(get())
      // Live tasks (active/waiting/paused) need forceRemove; stopped results
      // are cleared with removeDownloadResult. Unknown gids are treated as
      // stopped — the call simply fails into `failed` if the gid is bogus.
      const result = await runBatch(gids, (gid) => {
        const status = tasks.find((t) => t.gid === gid)?.status
        const isLive = status === 'active' || status === 'waiting' || status === 'paused'
        return isLive ? { method: 'forceRemove', params: [gid] } : { method: 'removeDownloadResult', params: [gid] }
      })
      if (result.ok.length > 0) await get().refresh()
      return result
    },

    batchRetry: async (gids) => {
      const tasks = allOf(get())
      const ok: string[] = []
      const failed: { gid: string; error: string }[] = []
      const eligible: { gid: string; uris: string[]; options: Record<string, string> }[] = []
      for (const gid of gids) {
        const task = tasks.find((t) => t.gid === gid)
        if (!task) {
          failed.push({ gid, error: '任务不存在或已被清理，无法重试' })
          continue
        }
        if (!isRetryableStatus(task.status)) {
          failed.push({ gid, error: '仅已停止的任务可以重试' })
          continue
        }
        if (task.bittorrent) {
          failed.push({ gid, error: 'BT 任务或无链接信息，无法重试' })
          continue
        }
        const uris = extractUris(task)
        if (uris.length === 0) {
          failed.push({ gid, error: 'BT 任务或无链接信息，无法重试' })
          continue
        }
        // Same filtering as the single retry: only the directory is carried
        // over, so no secrets (token/keys) can leak into the new task.
        const options: Record<string, string> = {}
        if (task.dir) options.dir = task.dir
        eligible.push({ gid, uris, options })
      }
      if (eligible.length === 0) return { ok, failed }

      // Re-check eligibility against fresh server state and pick up the task's
      // stored dir, probing both in one round trip per gid.
      const probeCalls = eligible.flatMap((e) => [
        { method: 'tellStatus', params: [e.gid, TASK_KEYS] },
        { method: 'getOption', params: [e.gid] },
      ])
      let probe: PromiseSettledResult<unknown>[] = []
      try {
        probe = await Promise.allSettled(await client.multicall(probeCalls))
      } catch (e) {
        return { ok, failed: [...failed, ...eligible.map((e2) => ({ gid: e2.gid, error: errorText(e) }))] }
      }
      const readds: { gid: string; uris: string[]; options: Record<string, string> }[] = []
      eligible.forEach((e, i) => {
        const statusRes = probe[2 * i]
        const optionRes = probe[2 * i + 1]
        if (!statusRes || statusRes.status !== 'fulfilled') {
          const reason = statusRes && statusRes.status === 'rejected' ? errorText(statusRes.reason) : '调用失败'
          failed.push({ gid: e.gid, error: reason })
          return
        }
        const fresh = statusRes.value as Aria2Task | null | undefined
        if (fresh && !isRetryableStatus(fresh.status)) {
          failed.push({ gid: e.gid, error: '仅已停止的任务可以重试' })
          return
        }
        const uris = fresh ? extractUris(fresh) : e.uris
        if (uris.length === 0) {
          failed.push({ gid: e.gid, error: 'BT 任务或无链接信息，无法重试' })
          return
        }
        const options = { ...e.options }
        if (optionRes && optionRes.status === 'fulfilled') {
          const stored = (optionRes.value ?? {}) as Record<string, string>
          if (typeof stored.dir === 'string' && stored.dir) options.dir = stored.dir
        }
        readds.push({ gid: e.gid, uris, options })
      })
      if (readds.length === 0) return { ok, failed }

      // Re-add from the original URIs, then clear the old result entry. The
      // removeDownloadResult outcome is best-effort and never fails the gid.
      const addCalls = readds.flatMap((e) => [
        { method: 'addUri', params: [e.uris, e.options] },
        { method: 'removeDownloadResult', params: [e.gid] },
      ])
      let addResults: PromiseSettledResult<unknown>[] = []
      try {
        addResults = await Promise.allSettled(await client.multicall(addCalls))
      } catch (e) {
        return { ok, failed: [...failed, ...readds.map((e2) => ({ gid: e2.gid, error: errorText(e) }))] }
      }
      readds.forEach((e, i) => {
        const addRes = addResults[2 * i]
        if (addRes && addRes.status === 'fulfilled') ok.push(e.gid)
        else failed.push({ gid: e.gid, error: addRes && addRes.status === 'rejected' ? errorText(addRes.reason) : '调用失败' })
      })
      if (ok.length > 0) await get().refresh()
      return { ok, failed }
    },
  }
})

// ------------------------------------------------------------------ selectors

export function selectAllTasks(s: Pick<TaskState, 'active' | 'waiting' | 'stopped'>): Aria2Task[] {
  return allOf(s)
}

function matchesFilter(status: TaskStatus, filter: TaskFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'active':
      return status === 'active'
    case 'waiting':
      return status === 'waiting' || status === 'paused'
    case 'stopped':
      return status === 'complete' || status === 'error' || status === 'removed'
  }
}

/**
 * Filtered task list. Returned from a stable cache so React sees the same
 * array reference until the underlying data actually changes.
 */
let cachedKey = ''
let cachedResult: Aria2Task[] = []

export function selectVisibleTasks(s: TaskState): Aria2Task[] {
  const all = allOf(s)
  const key = `${all.map((t) => t.gid + ':' + t.status + ':' + t.completedLength).join(',')}|${s.filter}|${s.search}`
  if (key === cachedKey) return cachedResult
  cachedKey = key
  const q = s.search.trim().toLowerCase()
  cachedResult = all.filter((task) => {
    if (!matchesFilter(getDisplayStatus(task), s.filter)) return false
    if (!q) return true
    const name = task.bittorrent?.info?.name ?? ''
    const paths = (task.files ?? []).map((f) => f.path).join(' ')
    const uris = (task.files ?? []).flatMap((f) => f.uris ?? []).map((u) => u.uri).join(' ')
    return `${name} ${paths} ${uris} ${task.gid}`.toLowerCase().includes(q)
  })
  return cachedResult
}

let countsKey = ''
let countsCache = { all: 0, active: 0, waiting: 0, stopped: 0 }

export function selectCounts(s: Pick<TaskState, 'active' | 'waiting' | 'stopped'>) {
  const key = `${s.active.length}|${s.waiting.length}|${s.stopped.length}|${s.waiting.map((t) => t.status).join('')}`
  if (key === countsKey) return countsCache
  countsKey = key
  countsCache = {
    all: s.active.length + s.waiting.length + s.stopped.length,
    active: s.active.length,
    waiting: s.waiting.length,
    stopped: s.stopped.length,
  }
  return countsCache
}

let selectedKey = ''
let selectedCache: Aria2Task | null = null

/** The selected task, or null. The payload is only deep-compared when the gid changes. */
export function selectSelectedTask(s: TaskState): Aria2Task | null {
  const gid = s.selectedGid
  if (!gid) return null
  const task = allOf(s).find((t) => t.gid === gid) ?? null
  const key = `${gid}|${task?.completedLength}|${task?.status}|${task?.files?.length}`
  if (key === selectedKey) return selectedCache
  selectedKey = key
  selectedCache = task
  return task
}
