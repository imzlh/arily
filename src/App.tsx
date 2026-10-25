import { useEffect, useRef, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { FileDown, Upload } from 'lucide-react'
import { useSettings, resolveTheme } from '@/stores/settings'
import { useConnection } from '@/stores/connection'
import { useTasks } from '@/stores/tasks'
import { useTaskForm } from '@/stores/taskForm'
import { Toaster } from '@/components/Toaster'
import { ConfirmProvider } from '@/hooks/useConfirm'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useDownloadNotifications } from '@/hooks/useDownloadNotifications'
import { GlobalStatsBar } from '@/components/layout/GlobalStatsBar'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { NewTaskDialog } from '@/features/new-task/NewTaskDialog'
import { DownloadsPage } from '@/pages/DownloadsPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StatusPage } from '@/pages/StatusPage'
import { AboutPage } from '@/pages/AboutPage'

const URI_RE = /^(https?|ftps?|magnet):/i

function splitUriList(text: string): string[] {
  return text
    .split(/[\r\n\t ]+/)
    .map((uri) => uri.trim())
    .filter((uri) => URI_RE.test(uri))
}

function collectDroppedFiles(data: DataTransfer) {
  const files = Array.from(data.files ?? [])
  const torrents = files.filter((f) => f.name.toLowerCase().endsWith('.torrent'))
  const metalinks = files.filter((f) => /\.(metalink|meta4)$/i.test(f.name))
  return { torrents, metalinks }
}

function AppShell() {
  // App-wide document title + completion notifications (ported from SettingsPage)
  useDocumentTitle()
  useDownloadNotifications()

  const theme = useSettings((s) => s.theme)
  const connectionState = useConnection((s) => s.state)
  const pollingInterval = useSettings((s) => s.pollingInterval)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

  // Theme
  useEffect(() => {
    const root = document.documentElement
    const apply = () => root.classList.toggle('dark', resolveTheme(theme) === 'dark')
    apply()
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  // Connection lifecycle (StrictMode-safe: connect only runs once)
  useEffect(() => {
    useConnection.getState().connect()
  }, [])

  // Poll tasks while connected; clear when not
  useEffect(() => {
    if (connectionState !== 'connected') {
      useTasks.getState().clearAll()
      return
    }
    void useTasks.getState().refresh()
    const id = window.setInterval(() => void useTasks.getState().refresh(), pollingInterval)
    return () => window.clearInterval(id)
  }, [connectionState, pollingInterval])

  // Window drag & drop
  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0
      setDragging(false)
    }
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    // The overlay covers the window, so its own enter/leave events must not skew the counter.
    const isOverlay = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      return !!target?.closest('[data-drop-overlay]')
    }

    const onDragEnter = (e: DragEvent) => {
      if (isOverlay(e) || !hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (isOverlay(e) || !hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent) => {
      if (isOverlay(e) || !hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      reset()
      const data = e.dataTransfer
      if (!data) return
      const { torrents, metalinks } = collectDroppedFiles(data)
      if (torrents.length > 0 || metalinks.length > 0) {
        useTaskForm.getState().openForm({
          ...(torrents.length > 0 ? { torrents } : {}),
          ...(metalinks.length > 0 ? { metalinks } : {}),
        })
        return
      }
      const uris = splitUriList(data.getData('text/uri-list') || data.getData('text/plain'))
      if (uris.length > 0) useTaskForm.getState().openForm({ uris })
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', reset)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', reset)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        useTaskForm.getState().openForm()
        return
      }
      if (e.key === '/' && !mod && !e.altKey) {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return
        if (!searchRef.current) return
        e.preventDefault()
        searchRef.current.focus()
        searchRef.current.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-full overflow-hidden bg-sidebar">
      <Sidebar />
      {/* Inset card: Motrix's SidebarInset (m-2 rounded-xl shadow-sm) */}
      <div className="m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-sidebar-inset shadow-sm max-md:m-0 max-md:rounded-none dark:border-transparent">
        <TopBar searchRef={searchRef} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <Routes>
                <Route path="/" element={<DownloadsPage />} />
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            {/* Reserve room for the floating mobile tab bar */}
            <div
              aria-hidden="true"
              style={{ height: 'calc(64px + env(safe-area-inset-bottom))' }}
              className="shrink-0 lg:hidden"
            />
          </div>
        </main>
        {/* Motrix footer bar: speeds, global limits, version + connection state */}
        <GlobalStatsBar />
      </div>
      <MobileTabBar />
      <NewTaskDialog />
      <Toaster />
      {dragging && (
        <div
          data-drop-overlay
          className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/80 p-10 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-primary bg-card/90 shadow-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileDown className="h-8 w-8" />
            </div>
            <p className="flex items-center gap-2 text-lg font-medium text-foreground">
              <Upload className="h-4 w-4 text-muted-foreground" />
              松开以添加下载
            </p>
            <p className="text-sm text-muted-foreground">也可以把文件直接拖到任意位置</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </HashRouter>
  )
}
