import type { Aria2Task, TaskStatus } from '@/types/aria2'
import { basename, formatPercent } from './format'

/** Best-effort display name for a task. */
export function getTaskName(task: Aria2Task): string {
  const torrentName = task.bittorrent?.info?.name
  if (torrentName) return torrentName
  const filePath = task.files?.find((f) => f.path)?.path
  if (filePath) return basename(filePath)
  for (const file of task.files ?? []) {
    const uri = file.uris?.find((u) => u.uri)?.uri
    if (!uri) continue
    try {
      const url = new URL(uri)
      const name = decodeURIComponent(basename(url.pathname))
      if (name) return name
    } catch {
      const name = basename(uri)
      if (name) return name
    }
  }
  return '未知任务'
}

export function getTaskTotalSize(task: Aria2Task): number {
  const n = Number(task.totalLength)
  return Number.isFinite(n) ? n : 0
}

export function getTaskDownloaded(task: Aria2Task): number {
  const n = Number(task.completedLength)
  return Number.isFinite(n) ? n : 0
}

/** Completion percentage 0..100 with 2 decimals. */
export function getTaskProgress(task: Aria2Task): number {
  const total = getTaskTotalSize(task)
  if (total <= 0) return 0
  const pct = formatPercent(getTaskDownloaded(task), total)
  return Math.round(pct * 100) / 100
}

/** Map the aria2 status onto the UI status set. */
export function getDisplayStatus(task: Aria2Task): TaskStatus {
  switch (task.status) {
    case 'active':
    case 'waiting':
    case 'paused':
    case 'error':
    case 'complete':
    case 'removed':
      return task.status
    default:
      return 'removed'
  }
}

export function isTorrent(task: Aria2Task): boolean {
  return Boolean(task.bittorrent || task.infoHash)
}

/** Estimated remaining seconds; Infinity when speed is zero or unknown. */
export function getTaskEta(task: Aria2Task): number {
  const speed = Number(task.downloadSpeed)
  if (!Number.isFinite(speed) || speed <= 0) return Infinity
  const remaining = getTaskTotalSize(task) - getTaskDownloaded(task)
  if (remaining <= 0) return 0
  return Math.ceil(remaining / speed)
}

/** De-duplicated download URIs of a task, if it has any. */
export function getTaskUris(task: Aria2Task): string[] {
  return [...new Set((task.files ?? []).flatMap((f) => (f.uris ?? []).map((u) => u.uri)))].filter(Boolean)
}

/** The first download URI of a task, or null when it has none (e.g. BT/metalink-only). */
export function getTaskSingleUri(task: Aria2Task): string | null {
  return getTaskUris(task)[0] ?? null
}

/** Magnet URI for a BT task with an info hash, or null. */
export function getTaskMagnetUri(task: Aria2Task): string | null {
  if (!task.infoHash) return null
  return `magnet:?xt=urn:btih:${task.infoHash}`
}

/**
 * Split the trailing file extension off a display name (Motrix rule: only a
 * short, non-leading dot counts). Returns '' when there is none.
 */
export function getTaskExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 && name.length - idx <= 16 ? name.slice(idx) : ''
}

/** A seeding task: an active BT download whose payload is complete. */
export function isSeeding(task: Aria2Task): boolean {
  return task.status === 'active' && task.seeder === 'true'
}

/** Pause applies to running downloads. */
export function canPauseTask(task: Aria2Task): boolean {
  return task.status === 'active'
}

/** Resume applies to paused tasks and queued ones (shown as 等待中). */
export function canResumeTask(task: Aria2Task): boolean {
  return task.status === 'waiting' || task.status === 'paused'
}

/** Retry re-adds the original URIs: stopped tasks only, no BT, URIs required. */
export function canRetryTask(task: Aria2Task): boolean {
  const status = task.status
  if (status !== 'error' && status !== 'removed' && status !== 'complete') return false
  if (task.bittorrent) return false
  return getTaskUris(task).length > 0
}

/** Short "MM-DD HH:mm" (with year when not current) stamp for finished tasks. */
export function formatCompletedTime(task: Aria2Task): string {
  const seconds = Number(task.completedTime)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const d = new Date(seconds * 1000)
  const now = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const date = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return d.getFullYear() === now.getFullYear() ? `${date} ${hm}` : `${d.getFullYear()}-${date} ${hm}`
}

// ---------------------------------------------------------------------- sorting

export type TaskSortKey = 'default' | 'name' | 'size' | 'progress' | 'eta' | 'downSpeed' | 'upSpeed'
export type TaskSortDir = 'asc' | 'desc'

/** active → waiting/paused → stopped, matching the aria2 queue order. */
function segmentOf(task: Aria2Task): number {
  if (task.status === 'active') return 0
  if (task.status === 'waiting' || task.status === 'paused') return 1
  return 2
}

function compareByKey(a: Aria2Task, b: Aria2Task, key: TaskSortKey): number {
  switch (key) {
    case 'name':
      return getTaskName(a).localeCompare(getTaskName(b), 'zh-Hans-CN', { numeric: true })
    case 'size':
      return getTaskTotalSize(a) - getTaskTotalSize(b)
    case 'progress':
      return getTaskProgress(a) - getTaskProgress(b)
    case 'eta': {
      // Unknown ETA (no speed) always sorts last, regardless of direction.
      const ea = getTaskEta(a)
      const eb = getTaskEta(b)
      const fa = Number.isFinite(ea)
      const fb = Number.isFinite(eb)
      if (fa && fb) return ea - eb
      if (fa) return -1
      if (fb) return 1
      return 0
    }
    case 'downSpeed':
      return (Number(a.downloadSpeed) || 0) - (Number(b.downloadSpeed) || 0)
    case 'upSpeed':
      return (Number(a.uploadSpeed) || 0) - (Number(b.uploadSpeed) || 0)
    default:
      return 0
  }
}

/**
 * Client-side sort of the visible task list. When `group` is set (filter =
 * 全部) the active/waiting/stopped segments stay in aria2 order and the key
 * sorts within each segment. The sort is stable: ties keep the aria2 order.
 */
export function sortVisibleTasks(
  tasks: readonly Aria2Task[],
  key: TaskSortKey,
  dir: TaskSortDir,
  group = true,
): Aria2Task[] {
  const copy = [...tasks]
  if (key === 'default') return copy
  const sign = dir === 'asc' ? 1 : -1
  copy.sort((a, b) => {
    if (group) {
      const seg = segmentOf(a) - segmentOf(b)
      if (seg !== 0) return seg
    }
    return compareByKey(a, b, key) * sign
  })
  return copy
}

const ERROR_MESSAGES: Record<number, string> = {
  1: 'Unknown error',
  2: 'Timeout',
  3: 'Resource not found',
  4: 'Max file not found',
  5: 'Too slow download speed',
  6: 'Network problem',
  7: 'Unfinished downloads in progress',
  8: 'Remote server does not support resume',
  9: 'Not enough disk space',
  10: 'Piece length differs between two torrent files',
  11: 'Same file is already downloading',
  12: 'Same info hash torrent is already downloading',
  13: 'File already exists',
  14: 'Renaming file failed',
  15: 'Unable to open existing file',
  16: 'Unable to create or truncate file',
  17: 'Filesystem error',
  18: 'Unable to create directory',
  19: 'Name resolution failed',
  20: 'Could not parse Metalink document',
  21: 'FTP command failed',
  22: 'HTTP response header was bad or unexpected',
  23: 'Too many redirects occurred',
  24: 'HTTP authorization failed',
  25: 'Could not parse bencoded file',
  26: 'Torrent file is corrupted or missing info',
  27: 'Malformed magnet URI',
  28: 'Bad or unrecognized option',
  29: 'Remote server was unable to handle the request temporarily',
  30: 'Could not parse JSON-RPC request',
  31: 'Reserved (not used)',
  32: 'Checksum validation failed',
}

/** Human-readable message for an aria2 exit / error code. */
export function getErrorsMessage(code: string): string {
  const n = Number(code)
  if (!Number.isFinite(n) || n === 0) return 'Success'
  return ERROR_MESSAGES[n] ?? `Unknown error (code ${code})`
}
