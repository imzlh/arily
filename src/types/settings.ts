export interface Aria2ConnectionConfig {
  /** e.g. "127.0.0.1" or "nas.local" or a full origin like "https://aria.example.com" */
  host: string
  /** JSON-RPC port, default 6800 */
  port: number
  /** RPC secret token (`--rpc-secret`) */
  secret: string
  /** JSON-RPC endpoint path, default "/jsonrpc" */
  path: string
  /** Use https/wss for the connection */
  secure: boolean
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface ConnectionEvent {
  id: number
  time: number
  level: 'info' | 'warn' | 'error'
  message: string
}

/** Preferred transport: 'auto' tries WebSocket first and falls back to HTTP. */
export type TransportProtocol = 'auto' | 'websocket' | 'http'

/** How often browser notifications may fire for completed downloads. */
export type NotificationFrequency = 'high' | 'middle' | 'low'
