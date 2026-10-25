import { useMemo, useState } from 'react'
import { ChevronRight, FileIcon, Folder, FolderOpen } from 'lucide-react'
import { errorText } from '@/api/rpc'
import { useTasks } from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import type { Aria2File, Aria2Task } from '@/types/aria2'
import { basename, formatBytes, formatPercent } from '@/lib/format'
import { getDisplayStatus } from '@/lib/task'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Progress } from '@/components/ui/Progress'

/**
 * File listing with per-file selection (aria2 changeOption select-file).
 *
 * Selection is only editable while the task is waiting/paused — the statuses
 * aria2 accepts select-file changes for. Multi-file tasks render as a
 * directory tree with indeterminate parent checkboxes; single-file tasks stay
 * read-only because there is nothing to select.
 */

type FileNode =
  | { kind: 'dir'; name: string; key: string; children: FileNode[] }
  | { kind: 'file'; name: string; file: Aria2File }

type DirNode = Extract<FileNode, { kind: 'dir' }>

function splitSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean)
}

/** Longest directory prefix shared by every path (dirname segments only). */
function commonDirPrefix(paths: string[]): string[] {
  let prefix: string[] | null = null
  for (const path of paths) {
    const segs = splitSegments(path)
    segs.pop()
    if (!prefix) {
      prefix = segs
      continue
    }
    let i = 0
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++
    prefix = prefix.slice(0, i)
    if (prefix.length === 0) return []
  }
  return prefix ?? []
}

function buildTree(files: Aria2File[]): FileNode[] {
  const prefix = commonDirPrefix(files.map((f) => f.path))
  const root: DirNode = { kind: 'dir', name: '', key: '', children: [] }
  for (const file of files) {
    const segs = splitSegments(file.path).slice(prefix.length)
    let node = root
    for (let i = 0; i < segs.length - 1; i++) {
      const name = segs[i] ?? ''
      let next = node.children.find((c): c is DirNode => c.kind === 'dir' && c.name === name)
      if (!next) {
        next = { kind: 'dir', name, key: `${node.key}/${name}`, children: [] }
        node.children.push(next)
      }
      node = next
    }
    const name = segs[segs.length - 1] ?? (basename(file.path) || `文件 #${file.index}`)
    node.children.push({ kind: 'file', name, file })
  }
  const sortRec = (nodes: FileNode[]): FileNode[] => {
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
    for (const n of nodes) if (n.kind === 'dir') sortRec(n.children)
    return nodes
  }
  return sortRec(root.children)
}

function collectFiles(node: FileNode): Aria2File[] {
  if (node.kind === 'file') return [node.file]
  return node.children.flatMap(collectFiles)
}

function dirKeysOf(nodes: FileNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.kind === 'dir') {
      out.push(n.key)
      dirKeysOf(n.children, out)
    }
  }
  return out
}

function FileCheckbox({
  checked,
  indeterminate,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean
  indeterminate: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <Checkbox
      ref={(el) => {
        if (el) el.indeterminate = indeterminate
      }}
      checked={checked}
      disabled={disabled}
      onChange={onToggle}
      aria-label={label}
      className="indeterminate:border-primary indeterminate:bg-primary indeterminate:before:scale-100"
    />
  )
}

function TreeItems({
  nodes,
  depth,
  selected,
  expanded,
  editable,
  onFileToggle,
  onDirToggle,
  onExpand,
}: {
  nodes: FileNode[]
  depth: number
  selected: Set<string>
  expanded: Set<string>
  editable: boolean
  onFileToggle: (file: Aria2File) => void
  onDirToggle: (node: DirNode) => void
  onExpand: (key: string) => void
}) {
  return (
    <ul className={cn('space-y-0.5', depth > 0 && 'ml-3.5 border-l border-border/60 pl-1.5')}>
      {nodes.map((node) => {
        if (node.kind === 'file') {
          const file = node.file
          const length = Number(file.length) || 0
          const done = Number(file.completedLength) || 0
          const pct = formatPercent(done, length)
          const checked = selected.has(file.index)
          return (
            <li
              key={file.index}
              className={cn('rounded-md px-1.5 py-1 transition-colors hover:bg-muted/50', !checked && 'opacity-50')}
              title={file.path}
            >
              <div className="flex items-center gap-2">
                <FileCheckbox
                  checked={checked}
                  indeterminate={false}
                  disabled={!editable}
                  label={node.name}
                  onToggle={() => onFileToggle(file)}
                />
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs">{node.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular">{formatBytes(length)}</span>
                <span className="w-10 shrink-0 text-end text-[11px] text-muted-foreground tabular">{pct}%</span>
              </div>
              <div className="mt-1 pl-6">
                <Progress
                  value={pct}
                  variant={pct >= 100 ? 'success' : 'default'}
                  className="h-0.5 rounded-full"
                  aria-label={`${pct}%`}
                />
              </div>
            </li>
          )
        }

        const leaves = collectFiles(node)
        const allSelected = leaves.every((f) => selected.has(f.index))
        const someSelected = leaves.some((f) => selected.has(f.index))
        const open = expanded.has(node.key)
        return (
          <li key={node.key}>
            <div className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/50">
              <FileCheckbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                disabled={!editable}
                label={node.name}
                onToggle={() => onDirToggle(node)}
              />
              <button
                type="button"
                onClick={() => onExpand(node.key)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <ChevronRight
                  className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
                  aria-hidden="true"
                />
                {open ? (
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{node.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground/70 tabular">{leaves.length}</span>
              </button>
            </div>
            {open && (
              <TreeItems
                nodes={node.children}
                depth={depth + 1}
                selected={selected}
                expanded={expanded}
                editable={editable}
                onFileToggle={onFileToggle}
                onDirToggle={onDirToggle}
                onExpand={onExpand}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function FilesTab({ task }: { task: Aria2Task }) {
  const files = task.files ?? []
  const editable = getDisplayStatus(task) === 'waiting' || getDisplayStatus(task) === 'paused'
  const multi = files.length > 1

  const tree = useMemo(() => (multi ? buildTree(files) : []), [files, multi])
  const keys = useMemo(() => dirKeysOf(tree), [tree])

  // Draft selection keyed by aria2's 1-based file index; initialised from the
  // server-side selection and only sent on 保存选择.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(files.filter((f) => f.selected !== 'false').map((f) => f.index)),
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(keys))
  const [saving, setSaving] = useState(false)

  if (files.length === 0) {
    return <p className="py-8 text-center text-[11px] text-muted-foreground">—</p>
  }

  function toggleFile(file: Aria2File) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(file.index)) next.delete(file.index)
      else next.add(file.index)
      return next
    })
  }

  function toggleDir(node: DirNode) {
    const leaves = collectFiles(node)
    setSelected((prev) => {
      const all = leaves.every((f) => prev.has(f.index))
      const next = new Set(prev)
      for (const f of leaves) {
        if (all) next.delete(f.index)
        else next.add(f.index)
      }
      return next
    })
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSave() {
    if (selected.size === 0) {
      toast.error('至少选择一个文件')
      return
    }
    const indices = files.filter((f) => selected.has(f.index)).map((f) => f.index)
    setSaving(true)
    try {
      await useTasks.getState().changeOption(task.gid, { 'select-file': indices.join(',') })
      toast.success('已保存文件选择')
    } catch (e) {
      toast.error(`操作失败：${errorText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // Single-file (or unknown path) tasks: plain read-only rows, no checkbox.
  if (!multi) {
    return (
      <ul className="space-y-1">
        {files.map((file) => {
          const length = Number(file.length) || 0
          const done = Number(file.completedLength) || 0
          const pct = formatPercent(done, length)
          const dimmed = file.selected === 'false'
          return (
            <li
              key={file.index}
              className={cn('rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50', dimmed && 'opacity-50')}
              title={file.path}
            >
              <div className="flex items-center gap-2">
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs">{basename(file.path)}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular">{formatBytes(length)}</span>
              </div>
              <div className="mt-1 pl-[1.375rem]">
                <Progress
                  value={pct}
                  variant={pct >= 100 ? 'success' : 'default'}
                  className="h-0.5 rounded-full"
                  aria-label={`${pct}%`}
                />
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
        {editable && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setSelected(new Set(files.map((f) => f.index)))}
            >
              全选
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setSelected(new Set<string>())}>
              全不选
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setSelected((prev) => new Set(files.filter((f) => !prev.has(f.index)).map((f) => f.index)))}
            >
              反选
            </Button>
          </>
        )}
        <span className={cn('text-[11px] text-muted-foreground tabular', editable ? 'ml-auto' : 'mr-auto')}>
          {`已选择 ${selected.size} / ${files.length}`}
        </span>
        {editable ? (
          <Button size="sm" variant="primary" loading={saving} onClick={() => void handleSave()}>
            保存选择
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground/80">仅等待中/已暂停任务可更改文件选择</span>
        )}
      </div>

      {keys.length > 0 && (
        <div className="flex items-center gap-1 px-1">
          <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(keys))}>
            展开
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set<string>())}>
            收起
          </Button>
        </div>
      )}

      <TreeItems
        nodes={tree}
        depth={0}
        selected={selected}
        expanded={expanded}
        editable={editable}
        onFileToggle={toggleFile}
        onDirToggle={toggleDir}
        onExpand={toggleExpand}
      />
    </div>
  )
}
