import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent, ReactNode } from 'react'
import {
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Clock,
  Download,
  FolderOpen,
  History,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { addTask, fileToBase64, parseUriList } from '@/api/tasks'
import { errorText } from '@/api/rpc'
import { formatBytes, parseSpeed } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useTasks } from '@/stores/tasks'
import { useTaskForm } from '@/stores/taskForm'
import { toast } from '@/stores/toasts'

type TabKey = 'uri' | 'torrent' | 'metalink'

type AdvancedState = {
  dir: string
  out: string
  downLimit: string
  upLimit: string
  allowOverwrite: boolean
  split: string
  maxConn: string
  maxTries: string
  minSplitSize: string
  userAgent: string
  referer: string
  header: string
  httpUser: string
  httpPasswd: string
  allProxy: string
  allProxyUser: string
  allProxyPasswd: string
  checksum: string
  seedRatio: string
  seedTime: string
  btTracker: string
}

const EMPTY_ADVANCED: AdvancedState = {
  dir: '',
  out: '',
  downLimit: '',
  upLimit: '',
  allowOverwrite: false,
  split: '',
  maxConn: '',
  maxTries: '',
  minSplitSize: '',
  userAgent: '',
  referer: '',
  header: '',
  httpUser: '',
  httpPasswd: '',
  allProxy: '',
  allProxyUser: '',
  allProxyPasswd: '',
  checksum: '',
  seedRatio: '',
  seedTime: '',
  btTracker: '',
}

const URI_RE = /^(https?|ftp|sftp|magnet):/i
const MIB = 1024 * 1024
const MIB_MAX = 1024 * MIB

/** Stable order for picking the first advanced error to surface in a toast. */
const ERROR_ORDER: (keyof AdvancedState)[] = [
  'downLimit',
  'upLimit',
  'split',
  'maxConn',
  'maxTries',
  'minSplitSize',
  'header',
  'checksum',
  'seedRatio',
  'seedTime',
]

function numberOption(value: string): string | undefined {
  const n = Number(value.trim())
  return value.trim() && Number.isFinite(n) && n >= 0 ? String(n) : undefined
}

function buildOptions(adv: AdvancedState, includeOut: boolean, pause: boolean): Record<string, string> {
  const options: Record<string, string> = {}
  const dir = adv.dir.trim()
  if (dir) options.dir = dir
  if (includeOut && adv.out.trim()) options.out = adv.out.trim()
  const down = parseSpeed(adv.downLimit)
  if (down > 0) options['max-download-limit'] = String(down)
  const up = parseSpeed(adv.upLimit)
  if (up > 0) options['max-upload-limit'] = String(up)
  if (adv.allowOverwrite) options['allow-overwrite'] = 'true'
  for (const [key, value] of [
    ['split', adv.split],
    ['max-connection-per-server', adv.maxConn],
    ['max-tries', adv.maxTries],
  ] as const) {
    const parsed = numberOption(value)
    if (parsed) options[key] = parsed
  }
  for (const [key, value] of [
    ['min-split-size', adv.minSplitSize],
    ['user-agent', adv.userAgent],
    ['referer', adv.referer],
    ['http-user', adv.httpUser],
    ['http-passwd', adv.httpPasswd],
    ['all-proxy', adv.allProxy],
    ['all-proxy-user', adv.allProxyUser],
    ['all-proxy-passwd', adv.allProxyPasswd],
    ['checksum', adv.checksum],
    ['seed-ratio', adv.seedRatio],
    ['seed-time', adv.seedTime],
  ] as const) {
    const v = value.trim()
    if (v) options[key] = v
  }
  // aria2 accepts multiple `header` values newline-separated over RPC.
  const header = adv.header
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
  if (header) options.header = header
  // bt-tracker is comma-separated in aria2; the UI accepts one per line.
  const trackers = [...new Set(adv.btTracker.split(/[\n,]/).map((t) => t.trim()).filter(Boolean))]
  if (trackers.length) options['bt-tracker'] = trackers.join(',')
  if (pause) options.pause = 'true'
  return options
}

/** Per-field inline validation for the advanced panel; empty = valid. */
function advancedErrors(adv: AdvancedState): Partial<Record<keyof AdvancedState, string>> {
  const errors: Partial<Record<keyof AdvancedState, string>> = {}

  const split = Number(adv.split)
  if (adv.split && (!Number.isInteger(split) || split < 1 || split > 128))
    errors.split = '分段数需为 1-128 之间的整数'

  const maxConn = Number(adv.maxConn)
  if (adv.maxConn && (!Number.isInteger(maxConn) || maxConn < 1 || maxConn > 64))
    errors.maxConn = '单服务器最大连接数需为 1-64 之间的整数'

  const tries = Number(adv.maxTries)
  if (adv.maxTries && (!Number.isInteger(tries) || tries < 0)) errors.maxTries = '最大重试次数需为不小于 0 的整数'

  const minSplit = adv.minSplitSize.trim()
  if (minSplit) {
    const bytes = parseSpeed(minSplit)
    if (bytes <= 0) errors.minSplitSize = '格式如 1M、20M'
    else if (bytes < MIB) errors.minSplitSize = '最小分段大小不能小于 1M'
    else if (bytes > MIB_MAX) errors.minSplitSize = '最小分段大小不能超过 1024M'
  }

  for (const [key, raw, label] of [
    ['downLimit', adv.downLimit, '下载限速'],
    ['upLimit', adv.upLimit, '上传限速'],
  ] as const) {
    const value = raw.trim().toLowerCase()
    if (value && !/^[\d.]+\s*[kmgt]?i?b?$/.test(value)) errors[key] = `${label}格式如 1M、500K，留空不限速`
  }

  const seedRatio = Number(adv.seedRatio)
  if (adv.seedRatio && (!Number.isFinite(seedRatio) || seedRatio < 0)) errors.seedRatio = '分享率需为不小于 0 的数字'

  const seedTime = Number(adv.seedTime)
  if (adv.seedTime && (!Number.isFinite(seedTime) || seedTime < 0)) errors.seedTime = '做种时长需为不小于 0 的分钟数'

  const checksum = adv.checksum.trim()
  if (checksum && !/^[\w-]+=[0-9a-fA-F]+$/.test(checksum)) errors.checksum = '格式如 sha-256=十六进制摘要'

  if (adv.header.split('\n').some((line) => line.trim() && !line.trim().includes(':')))
    errors.header = '每行需为 "名称: 值" 格式'

  return errors
}

/* ---------------------------------------------------------------- dense rows
 * Motrix-style dense rows: `grid-cols-[5rem_1fr]`, tiny muted label, h-8 input.
 * Raw inputs keep exact size control (cn() does not dedupe conflicting classes).
 * -------------------------------------------------------------------------- */
const denseGridClass =
  'grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-1 ' +
  '[&>label]:font-normal [&>label]:text-muted-foreground [&>p]:col-start-2'

const denseInputClass =
  'h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground shadow-xs ' +
  'placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] outline-none ' +
  'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive'

const denseInvalidClass = 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25'

const denseTextareaClass =
  'max-h-28 min-h-14 w-full resize-y rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-xs leading-snug text-foreground shadow-xs ' +
  'placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] outline-none ' +
  'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

function GroupHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">{title}</h4>
      {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
    </div>
  )
}

interface DenseFieldProps {
  id: string
  label: ReactNode
  error?: string
  hint?: string
  multiline?: boolean
  children: ReactNode
}

/** Dense grid row built on Field so the shared error/hint styling is reused. */
function DenseField({ id, label, error, hint, multiline, children }: DenseFieldProps) {
  return (
    <Field
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      className={cn(denseGridClass, multiline && 'items-start [&>label]:pt-1.5')}
    >
      {children}
    </Field>
  )
}

export function NewTaskDialog() {
  const open = useTaskForm((s) => s.open)
  const closeForm = useTaskForm((s) => s.closeForm)
  const dirHistory = useTaskForm((s) => s.dirHistory)

  const [tab, setTab] = useState<TabKey>('uri')
  const [text, setText] = useState('')
  const [torrents, setTorrents] = useState<File[]>([])
  const [metalinks, setMetalinks] = useState<File[]>([])
  const [advanced, setAdvanced] = useState(false)
  const [adv, setAdv] = useState<AdvancedState>(EMPTY_ADVANCED)
  const [submitting, setSubmitting] = useState(false)
  const [pausePending, setPausePending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [prefillKey, setPrefillKey] = useState(0)
  const [dirOpen, setDirOpen] = useState(false)

  const uris = parseUriList(text)
  const files = tab === 'torrent' ? torrents : tab === 'metalink' ? metalinks : []
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirWrapRef = useRef<HTMLDivElement>(null)
  // Always submit the latest tab/inputs, even if Ctrl+Enter fires within the same tick.
  const latest = useRef({ tab, uris, files, adv })
  latest.current = { tab, uris, files, adv }

  // Live link validation for the URI tab (mirrors parseUriList semantics).
  // Valid URIs are counted per whitespace token (mirrors may share one line),
  // but unrecognized input is reported per line so prose isn't split into words.
  const tokens = text.split(/[\s\n\r]+/).filter(Boolean)
  const validCount = new Set(tokens.filter((t) => URI_RE.test(t))).size
  const invalidLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.split(/\s+/).some((t) => URI_RE.test(t)))

  const advErrors = advancedErrors(adv)
  const advErrorCount = Object.keys(advErrors).length

  /** After a successful submit: keep sticky prefs (dir, limits, …) and clear per-task secrets/proxy. */
  function resetAfterSubmit() {
    setTab('uri')
    setText('')
    setTorrents([])
    setMetalinks([])
    setAdvanced(false)
    setDirOpen(false)
    setAdv((prev) => ({
      ...prev,
      httpUser: '',
      httpPasswd: '',
      allProxy: '',
      allProxyUser: '',
      allProxyPasswd: '',
    }))
  }

  // Pick up drops that arrive while the dialog is already open.
  useEffect(() => {
    const unsub = useTaskForm.subscribe((s, prev) => {
      if (s.prefill && s.prefill !== prev.prefill) setPrefillKey((k) => k + 1)
    })
    return unsub
  }, [])

  // Apply prefill whenever the dialog opens or new files/links are dropped on it.
  useEffect(() => {
    if (!open) return
    const prefill = useTaskForm.getState().consumePrefill()
    if (!prefill) return
    const uris = prefill.uris ?? []
    if (uris.length) {
      setTab('uri')
      setText((prev) => [prev, uris.join('\n')].filter(Boolean).join('\n'))
    }
    if (prefill.torrents?.length) {
      setTab('torrent')
      setTorrents(prefill.torrents)
    }
    if (prefill.metalinks?.length) {
      setTab('metalink')
      setMetalinks(prefill.metalinks)
    }
    if (prefill.dir) setAdv((prev) => ({ ...prev, dir: prefill.dir ?? '' }))
  }, [open, prefillKey])

  useEffect(() => {
    if (open) setSubmitting(false)
  }, [open])

  // Close the dir-history popover on outside clicks.
  useEffect(() => {
    if (!dirOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!dirWrapRef.current?.contains(e.target as Node)) setDirOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [dirOpen])

  function addFiles(next: File[]) {
    if (!next.length) return
    if (tab === 'torrent')
      setTorrents((prev) => [...prev, ...next.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))])
    else if (tab === 'metalink')
      setMetalinks((prev) => [...prev, ...next.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))])
  }

  function removeFile(name: string, size: number) {
    const drop = (list: File[]) => list.filter((f) => !(f.name === name && f.size === size))
    if (tab === 'torrent') setTorrents(drop)
    else setMetalinks(drop)
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (tab === 'uri') return
    addFiles(Array.from(e.dataTransfer.files ?? []))
  }

  function patch(key: keyof AdvancedState, value: string | boolean) {
    setAdv((prev) => ({ ...prev, [key]: value }))
  }

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText()
      const value = clip.trim()
      if (!value) {
        toast.info('剪贴板为空')
        return
      }
      setText((prev) => [prev, value].filter(Boolean).join('\n'))
    } catch {
      toast.error('无法读取剪贴板，请检查浏览器权限')
    }
  }

  async function submit(pause: boolean) {
    if (submitting) return
    const { tab, uris, files, adv } = latest.current
    if ((tab === 'uri' ? uris.length : files.length) === 0) return
    const errors = advancedErrors(adv)
    const firstError = ERROR_ORDER.map((key) => errors[key]).find(Boolean)
    if (firstError) {
      toast.error(`高级选项有误：${firstError}`)
      return
    }
    setSubmitting(true)
    setPausePending(pause)
    let ok = 0
    let lastError: string | null = null
    try {
      if (tab === 'uri') {
        const multi = uris.length > 1
        for (const uri of uris) {
          try {
            await addTask({ kind: 'uri', uris: [uri], options: buildOptions(adv, !multi, pause) })
            ok++
          } catch (e) {
            lastError = errorText(e)
          }
        }
      } else {
        const kind = tab
        const options = buildOptions(adv, false, pause)
        for (const file of files) {
          try {
            const content = await fileToBase64(file)
            if (kind === 'torrent') await addTask({ kind: 'torrent', torrent: content, options })
            else await addTask({ kind: 'metalink', metalink: content, options })
            ok++
          } catch (e) {
            lastError = errorText(e)
          }
        }
      }

      if (lastError) {
        toast.error(`添加失败：${lastError}`)
        await useTasks.getState().refresh()
        return
      }

      if (adv.dir.trim()) useTaskForm.getState().addDirHistory(adv.dir)
      toast.success(`已添加 ${ok} 个任务`)
      resetAfterSubmit()
      closeForm()
      await useTasks.getState().refresh()
    } finally {
      setSubmitting(false)
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void submit(false)
    }
  }

  const tabs = [
    { key: 'uri', label: '链接' },
    { key: 'torrent', label: '种子文件' },
    { key: 'metalink', label: 'Metalink' },
  ]

  const accept = tab === 'torrent' ? '.torrent' : '.metalink,.meta4'
  const count = tab === 'uri' ? uris.length : files.length

  return (
    <Modal
      open={open}
      onClose={closeForm}
      title="新建任务"
      busy={submitting}
      size="lg"
      className="max-w-[640px]!"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">
            {count > 0 && `待添加 ${count} 项`}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={submitting}>
              取消
            </Button>
            <Button
              variant="secondary"
              onClick={() => void submit(true)}
              loading={submitting && pausePending}
              disabled={count === 0 || submitting}
            >
              <Clock className="size-4" aria-hidden="true" />
              稍后下载
            </Button>
            <Button
              variant="primary"
              onClick={() => void submit(false)}
              loading={submitting && !pausePending}
              disabled={count === 0 || submitting}
            >
              <Download className="size-4" aria-hidden="true" />
              立即下载
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" onKeyDown={onKeyDown}>
        <Tabs items={tabs} value={tab} onChange={(v) => setTab(v as TabKey)} variant="segmented" />

        {tab === 'uri' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">下载链接</span>
              <Button variant="ghost" size="sm" className="-me-1" onClick={() => void pasteFromClipboard()}>
                <ClipboardPaste className="size-3.5" aria-hidden="true" />
                粘贴
              </Button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="每行一个链接，支持 http / ftp / magnet"
              spellCheck={false}
              aria-label="下载链接"
              className="min-h-[120px] w-full resize-none rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            {tokens.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {validCount > 0 && (
                    <Badge variant="success" className="tabular-nums">
                      {validCount} 个有效
                    </Badge>
                  )}
                  {invalidLines.length > 0 && (
                    <Badge variant="danger" className="tabular-nums">
                      {invalidLines.length} 行无法识别
                    </Badge>
                  )}
                  {validCount > 0 && <span className="text-xs text-muted-foreground">将创建 {uris.length} 个任务</span>}
                </div>
                {invalidLines.length > 0 && (
                  <ul className="space-y-0.5">
                    {invalidLines.slice(0, 3).map((line) => (
                      <li key={line} className="flex items-center gap-1.5 text-xs text-destructive">
                        <CircleAlert className="size-3 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 truncate font-mono">{line}</span>
                      </li>
                    ))}
                    {invalidLines.length > 3 && (
                      <li className="ps-[18px] text-xs text-muted-foreground">
                        还有 {invalidLines.length - 3} 行无法识别
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              每行链接会作为一个独立任务添加；同一资源的多个镜像地址请用空格分隔写在同一行。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/30 hover:border-primary hover:bg-muted/50',
              )}
            >
              <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">
                {tab === 'torrent' ? '拖入 .torrent 文件，或点击选择' : '拖入 .metalink / .meta4 文件，或点击选择'}
              </span>
              <span className="text-xs text-muted-foreground">
                {tab === 'torrent' ? '支持多选，每个种子会作为一个独立任务添加' : '支持多选，每个 Metalink 文件会作为独立任务添加'}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={accept}
              className="hidden"
              onChange={onPick}
            />
            {files.length > 0 && (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {files.map((file) => (
                  <li
                    key={`${file.name}:${file.size}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{file.name}</span>
                    <Badge variant="muted">{formatBytes(file.size)}</Badge>
                    <button
                      type="button"
                      onClick={() => removeFile(file.name, file.size)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      aria-label="关闭"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ------------------------------------------------ 保存到（带历史） */}
        <div className="space-y-1.5">
          <label htmlFor="nt-dir" className="text-xs font-medium text-foreground">
            保存到
          </label>
          <div className="relative" ref={dirWrapRef}>
            <Input
              id="nt-dir"
              className="pe-9"
              value={adv.dir}
              onChange={(e) => patch('dir', e.target.value)}
              placeholder="留空使用 aria2 默认目录"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setDirOpen((v) => !v)}
              disabled={dirHistory.length === 0}
              aria-expanded={dirOpen}
              aria-label="历史目录"
              title="历史目录"
              className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <History className="size-4" aria-hidden="true" />
            </button>
            {dirOpen && dirHistory.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1.5 animate-pop-in overflow-hidden rounded-lg border border-border bg-card shadow-soft">
                <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">最近使用</span>
                  <button
                    type="button"
                    onClick={() => {
                      useTaskForm.getState().clearDirHistory()
                      setDirOpen(false)
                    }}
                    className="text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                  >
                    清空历史
                  </button>
                </div>
                <ul className="max-h-48 overflow-y-auto p-1">
                  {dirHistory.map((dir) => (
                    <li key={dir}>
                      <button
                        type="button"
                        onClick={() => {
                          patch('dir', dir)
                          setDirOpen(false)
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent"
                      >
                        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 truncate font-mono">{dir}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------- 高级选项 */}
        <div>
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            className="-ms-2 inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform duration-150', advanced && 'rotate-90')}
              aria-hidden="true"
            />
            高级选项
            {advErrorCount > 0 && <Badge variant="danger">{advErrorCount} 项有误</Badge>}
          </button>
          {advanced && (
            <div className="mt-2 ms-1.5 space-y-4 border-s-2 border-border ps-3">
              {/* 通用 */}
              <section className="space-y-2.5">
                <GroupHeader title="通用" />
                {tab === 'uri' && (
                  <DenseField id="nt-out" label="文件名" hint="仅对单个链接任务生效">
                    <input
                      id="nt-out"
                      className={denseInputClass}
                      value={adv.out}
                      onChange={(e) => patch('out', e.target.value)}
                      placeholder="留空使用原始文件名"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </DenseField>
                )}
                <DenseField id="nt-down" label="下载限速" error={advErrors.downLimit}>
                  <input
                    id="nt-down"
                    className={cn(denseInputClass, advErrors.downLimit && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.downLimit)}
                    value={adv.downLimit}
                    onChange={(e) => patch('downLimit', e.target.value)}
                    placeholder="无限制"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-up" label="上传限速" error={advErrors.upLimit}>
                  <input
                    id="nt-up"
                    className={cn(denseInputClass, advErrors.upLimit && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.upLimit)}
                    value={adv.upLimit}
                    onChange={(e) => patch('upLimit', e.target.value)}
                    placeholder="无限制"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </DenseField>
                <div className="grid grid-cols-[5rem_1fr] items-center gap-x-3">
                  <span className="text-xs font-normal text-muted-foreground">允许覆盖</span>
                  <Switch
                    checked={adv.allowOverwrite}
                    onChange={(v) => patch('allowOverwrite', v)}
                    label={<span className="text-xs text-muted-foreground">已存在同名文件时直接覆盖</span>}
                  />
                </div>
              </section>

              {/* 分段与连接 */}
              <section className="space-y-2.5">
                <GroupHeader title="分段与连接" />
                <DenseField id="nt-split" label="分段数" error={advErrors.split}>
                  <input
                    id="nt-split"
                    className={cn(denseInputClass, advErrors.split && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.split)}
                    value={adv.split}
                    onChange={(e) => patch('split', e.target.value.replace(/\D/g, ''))}
                    placeholder="默认 5"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-maxconn" label="单服务器最大连接数" error={advErrors.maxConn}>
                  <input
                    id="nt-maxconn"
                    className={cn(denseInputClass, advErrors.maxConn && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.maxConn)}
                    value={adv.maxConn}
                    onChange={(e) => patch('maxConn', e.target.value.replace(/\D/g, ''))}
                    placeholder="默认 1"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-minsplit" label="最小分段大小" error={advErrors.minSplitSize}>
                  <input
                    id="nt-minsplit"
                    className={cn(denseInputClass, advErrors.minSplitSize && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.minSplitSize)}
                    value={adv.minSplitSize}
                    onChange={(e) => patch('minSplitSize', e.target.value)}
                    placeholder="如 1M"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-tries" label="最大重试次数" error={advErrors.maxTries}>
                  <input
                    id="nt-tries"
                    className={cn(denseInputClass, advErrors.maxTries && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.maxTries)}
                    value={adv.maxTries}
                    onChange={(e) => patch('maxTries', e.target.value.replace(/\D/g, ''))}
                    placeholder="默认 5"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </DenseField>
              </section>

              {/* HTTP */}
              <section className="space-y-2.5">
                <GroupHeader title="HTTP" />
                <DenseField id="nt-ua" label="User-Agent">
                  <input
                    id="nt-ua"
                    className={denseInputClass}
                    value={adv.userAgent}
                    onChange={(e) => patch('userAgent', e.target.value)}
                    placeholder="留空使用 aria2 默认"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-referer" label="Referer">
                  <input
                    id="nt-referer"
                    className={denseInputClass}
                    value={adv.referer}
                    onChange={(e) => patch('referer', e.target.value)}
                    placeholder="留空不设置"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-header" label="额外请求头" error={advErrors.header} multiline>
                  <textarea
                    id="nt-header"
                    className={cn(denseTextareaClass, advErrors.header && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.header)}
                    value={adv.header}
                    onChange={(e) => patch('header', e.target.value)}
                    placeholder={'每行一条，格式：名称: 值'}
                    rows={2}
                    spellCheck={false}
                  />
                </DenseField>
                <DenseField id="nt-http-user" label="HTTP 认证用户名">
                  <input
                    id="nt-http-user"
                    className={denseInputClass}
                    value={adv.httpUser}
                    onChange={(e) => patch('httpUser', e.target.value)}
                    placeholder="留空不设置"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </DenseField>
                <DenseField id="nt-http-passwd" label="HTTP 认证密码">
                  <input
                    id="nt-http-passwd"
                    type="password"
                    className={denseInputClass}
                    value={adv.httpPasswd}
                    onChange={(e) => patch('httpPasswd', e.target.value)}
                    placeholder="留空不设置"
                    autoComplete="new-password"
                  />
                </DenseField>
                <DenseField id="nt-proxy" label="代理服务器">
                  <input
                    id="nt-proxy"
                    className={denseInputClass}
                    value={adv.allProxy}
                    onChange={(e) => patch('allProxy', e.target.value)}
                    placeholder="[http://][用户名:密码@]主机[:端口]"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-proxy-user" label="代理用户名">
                  <input
                    id="nt-proxy-user"
                    className={denseInputClass}
                    value={adv.allProxyUser}
                    onChange={(e) => patch('allProxyUser', e.target.value)}
                    placeholder="留空不设置"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </DenseField>
                <DenseField id="nt-proxy-passwd" label="代理密码">
                  <input
                    id="nt-proxy-passwd"
                    type="password"
                    className={denseInputClass}
                    value={adv.allProxyPasswd}
                    onChange={(e) => patch('allProxyPasswd', e.target.value)}
                    placeholder="留空不设置"
                    autoComplete="new-password"
                  />
                </DenseField>
                <DenseField id="nt-checksum" label="校验和" error={advErrors.checksum}>
                  <input
                    id="nt-checksum"
                    className={cn(denseInputClass, advErrors.checksum && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.checksum)}
                    value={adv.checksum}
                    onChange={(e) => patch('checksum', e.target.value)}
                    placeholder="如 sha-256=十六进制摘要"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </DenseField>
              </section>

              {/* BitTorrent */}
              <section className="space-y-2.5">
                <GroupHeader title="BitTorrent" hint="仅对 BT / 磁力任务生效" />
                <DenseField id="nt-ratio" label="分享率" error={advErrors.seedRatio}>
                  <input
                    id="nt-ratio"
                    className={cn(denseInputClass, advErrors.seedRatio && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.seedRatio)}
                    value={adv.seedRatio}
                    onChange={(e) => patch('seedRatio', e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="无限制"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-seedtime" label="做种时长（分钟）" error={advErrors.seedTime}>
                  <input
                    id="nt-seedtime"
                    className={cn(denseInputClass, advErrors.seedTime && denseInvalidClass)}
                    aria-invalid={Boolean(advErrors.seedTime)}
                    value={adv.seedTime}
                    onChange={(e) => patch('seedTime', e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="无限制"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </DenseField>
                <DenseField id="nt-tracker" label="追加 Tracker" multiline>
                  <textarea
                    id="nt-tracker"
                    className={denseTextareaClass}
                    value={adv.btTracker}
                    onChange={(e) => patch('btTracker', e.target.value)}
                    placeholder="每行一个 tracker 地址"
                    rows={2}
                    spellCheck={false}
                  />
                </DenseField>
              </section>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
