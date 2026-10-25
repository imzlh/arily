import type { NewTaskInput } from '@/types/aria2'
import { client } from './rpc'

/**
 * Add one or more downloads.
 * Torrents are uploaded as base64 per the JSON-RPC spec; aria2 then follows
 * the torrent into the actual download(s) (follow-torrent defaults to true).
 */
export async function addTask(input: NewTaskInput): Promise<string[]> {
  if (input.kind === 'uri') {
    const gid = await client.call<string>('addUri', [input.uris, input.options])
    return [gid]
  }
  if (input.kind === 'torrent') {
    const gid = await client.call<string>('addTorrent', [input.torrent, input.uris ?? [], input.options])
    return [gid]
  }
  const gids = await client.call<string[]>('addMetalink', [input.metalink, input.options])
  return gids ?? []
}

/** Read a File and return its base64 content without the data-URL prefix */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/** Turn a text box of URLs / magnets into a clean, de-duplicated list */
export function parseUriList(text: string): string[] {
  return text
    .split(/[\s\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => /^(https?|ftp|sftp|magnet):/i.test(s))
    .filter((s, i, arr) => arr.indexOf(s) === i)
}
