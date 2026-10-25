const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const

const SPEED_UNITS: Record<string, number> = {
  '': 1,
  b: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
}

function toNumber(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/** Format a byte count as e.g. "1.50 GiB". Negative or invalid values yield "0 B". */
export function formatBytes(value: number | string, precision = 2): string {
  let n = toNumber(value)
  if (n < 0) n = 0
  let unit = 0
  while (n >= 1024 && unit < BYTE_UNITS.length - 1) {
    n /= 1024
    unit++
  }
  if (unit === 0) return `${Math.round(n)} B`
  return `${n.toFixed(precision)} ${BYTE_UNITS[unit]}`
}

/** Format a byte-per-second value as e.g. "1.50 MiB/s". */
export function formatSpeed(value: number | string): string {
  const n = toNumber(value)
  if (n <= 0) return '0 B/s'
  return `${formatBytes(n)}/s`
}

/** Format a remaining-time value in seconds as "45s", "3m 20s", "2h 05m" or "3d 4h". */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  const total = Math.floor(seconds)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600) % 24
  const d = Math.floor(total / 86400)
  const pad = (v: number) => String(v).padStart(2, '0')
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${pad(m)}m`
  if (m > 0) return `${m}m ${pad(s)}s`
  return `${s}s`
}

/** Percentage of completion (0..100, one decimal), 0 when total is unknown. */
export function formatPercent(completed: number, total: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return 0
  const pct = (completed / total) * 100
  return Math.round(Math.min(Math.max(pct, 0), 100) * 10) / 10
}

/** Parse a human speed limit such as "1M", "500K", "2.5 MB" or "1024" into bytes/s. */
export function parseSpeed(input: string): number {
  const text = input.trim().toLowerCase()
  if (!text) return 0
  const m = text.match(/^([\d.]+)\s*([kmgt]?i?b?)$/)
  if (!m) return 0
  const value = Number(m[1])
  const multiplier = SPEED_UNITS[m[2]]
  if (!Number.isFinite(value) || multiplier === undefined) return 0
  return Math.max(0, Math.round(value * multiplier))
}

/** Inverse of parseSpeed: compact input-friendly text, empty string for 0. */
export function formatSpeedInput(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['', 'K', 'M', 'G', 'T']
  let n = bytes
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit++
  }
  if (unit === 0) return trimZeros(n.toFixed(0))
  return `${trimZeros(n.toFixed(2))}${units[unit]}`
}

/** Local-time "YYYY-MM-DD HH:mm:ss". */
export function formatTime(ts: number): string {
  if (!Number.isFinite(ts)) return '-'
  const d = new Date(ts)
  const pad = (v: number) => String(v).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** Last path segment, handling both POSIX and Windows separators. */
export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

/** Remove the protocol from a URI for display ("http://a.com/x" -> "a.com/x"). */
export function stripScheme(uri: string): string {
  return uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^magnet:\?/i, 'magnet:')
}
