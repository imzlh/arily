export type TaskStatus =
  | 'active'
  | 'waiting'
  | 'paused'
  | 'error'
  | 'complete'
  | 'removed'

/** Raw status as reported by aria2 */
export type Aria2Status = 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed'

export interface UriEntry {
  uri: string
  status: 'used' | 'waiting'
}

export interface Aria2File {
  index: string
  path: string
  length: string
  completedLength: string
  selected: 'true' | 'false'
  uris: UriEntry[]
}

export interface Aria2Task {
  gid: string
  status: Aria2Status
  totalLength: string
  completedLength: string
  uploadLength: string
  downloadSpeed: string
  uploadSpeed: string
  connections: string
  numSeeders: string
  seeder: 'true' | 'false'
  pieceLength: string
  numPieces: string
  bitfield?: string
  dir: string
  files: Aria2File[]
  bittorrent?: {
    announceList?: string[][]
    comment?: string
    creationDate?: number
    mode?: string
    info?: { name: string }
  }
  errorCode?: string
  errorMessage?: string
  followedBy?: string[]
  following?: string
  belongsTo?: string
  infoHash?: string
  verifiedLength?: string
  verifyIntegrityPending?: string
  /** Unix seconds when a stopped download completed (stopped tasks only) */
  completedTime?: string
}

export interface GlobalStat {
  downloadSpeed: string
  uploadSpeed: string
  numActive: string
  numWaiting: string
  numStopped: string
  numStoppedTotal?: string
}

export interface VersionInfo {
  version: string
  enabledFeatures: string[]
}

export interface SessionInfo {
  sessionId: string
}

/** A task enriched with client-side derived fields */
export interface Task extends Aria2Task {
  /** Index of the file currently shown in the detail panel */
  selectedFileIndex?: string
}

export type NewTaskInput =
  | { kind: 'uri'; uris: string[]; options: Record<string, string> }
  | { kind: 'torrent'; torrent: string; uris?: string[]; options: Record<string, string> }
  | { kind: 'metalink'; metalink: string; options: Record<string, string> }

export interface GlobalOptions {
  'max-concurrent-downloads'?: string
  'max-overall-download-limit'?: string
  'max-overall-upload-limit'?: string
  'max-connection-per-server'?: string
  'split'?: string
  'min-split-size'?: string
  'continue'?: string
  'max-tries'?: string
  'retry-wait'?: string
  'timeout'?: string
  'auto-file-renaming'?: string
  'allow-overwrite'?: string
  'disk-cache'?: string
  'file-allocation'?: string
  'seed-ratio'?: string
  'seed-time'?: string
  'bt-max-peers'?: string
  'bt-enable-lpd'?: string
  'enable-dht'?: string
  'listen-port'?: string
  'dht-listen-port'?: string
  'save-session'?: string
  'save-session-interval'?: string
  'input-file'?: string
  'rpc-listen-port'?: string
  'check-integrity'?: string
  [key: string]: string | undefined
}
