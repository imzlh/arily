import { Copy, Globe } from 'lucide-react'
import { toast } from '@/stores/toasts'
import type { Aria2Task } from '@/types/aria2'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'

export function TrackerTab({ task }: { task: Aria2Task }) {
  const tiers = (task.bittorrent?.announceList ?? []).filter((tier) => Array.isArray(tier) && tier.length > 0)
  const all = tiers.flat()

  if (all.length === 0) {
    return <p className="py-8 text-center text-[11px] text-muted-foreground">没有 Tracker</p>
  }

  function copy(uri: string) {
    void navigator.clipboard
      .writeText(uri)
      .then(() => toast.success('已复制'))
      .catch(() => undefined)
  }

  function copyAll() {
    void navigator.clipboard
      .writeText(all.join('\n'))
      .then(() => toast.success('已复制'))
      .catch(() => undefined)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5">
        <span className="text-[11px] text-muted-foreground tabular">{`共 ${all.length} 个 Tracker`}</span>
        <Button size="sm" variant="outline" onClick={copyAll}>
          <Copy className="size-3" aria-hidden="true" />
          复制全部
        </Button>
      </div>
      {tiers.map((tier, index) => (
        <div key={index} className="space-y-0.5">
          <div className="px-1 text-[11px] font-medium text-muted-foreground tabular">
            {`分组 #${index + 1}`}
          </div>
          {tier.map((uri) => (
            <div
              key={uri}
              className="group flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/50"
            >
              <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={uri}>
                {uri}
              </span>
              <IconButton icon={Copy} label="复制" className="-my-1 size-6" onClick={() => copy(uri)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
