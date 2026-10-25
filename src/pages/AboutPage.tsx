import { ExternalLink } from 'lucide-react'

const VERSION = '0.2.0'

const LINKS = [
  { href: 'https://aria2.github.io/manual/en/html/aria2c.html', label: 'aria2 文档' },
  { href: 'https://github.com/aria2/aria2/releases', label: 'GitHub' },
] as const

function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="h-20 w-20 drop-shadow-lg" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="var(--primary)" />
      <path
        d="M32 15v20.4m0 0 8.4-8.4M32 35.4l-8.4-8.4"
        stroke="#fff"
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M19 45h26" stroke="#fff" strokeWidth="4.8" strokeLinecap="round" />
    </svg>
  )
}

export function AboutPage() {
  return (
    <div className="flex h-full overflow-y-auto">
      <div className="m-auto flex w-full max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <Logo />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">关于 AriaUI</h2>
          <p className="font-mono text-xs text-muted-foreground">v{VERSION}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          AriaUI 是一个面向 aria2 的现代下载管理器，目标是替代 AriaNg，提供现代化界面与现代前端技术栈。
        </p>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>基于 aria2 JSON-RPC 驱动</p>
          <p>界面风格参考 Motrix</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
            >
              {label}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
