import type { Aria2ConnectionConfig, ConnectionEvent, TransportProtocol } from '@/types/settings'

/** Shape of an aria2 JSON-RPC error */
export interface RpcError extends Error {
  code: number
  rpcMessage: string
}

export type RpcState = 'idle' | 'connecting' | 'connected' | 'disconnected'

interface RpcRequest {
  id: string
  resolve: (value: unknown) => void
  reject: (reason: RpcError) => void
  cleanup: () => void
}

interface RpcResponse {
  id?: string | number | null
  jsonrpc: string
  method?: string
  params?: unknown[]
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

type Listener<T> = (payload: T) => void

/** Callback for JSON-RPC notifications pushed by aria2 over WebSocket */
export type NotificationListener = (method: string, gid: string) => void

/** Options accepted by Aria2Client.connect */
export interface ConnectOptions {
  /**
   * Transport preference: 'auto' tries WebSocket first and falls back to HTTP,
   * 'websocket' and 'http' pin the transport. Defaults to 'auto'.
   */
  protocol?: TransportProtocol
  /**
   * Fixed reconnect interval in ms, applied to the WebSocket transport only.
   * 0 disables automatic reconnection. Defaults to 5000.
   */
  autoReconnectInterval?: number
}

const MAX_EVENTS = 200
const REQUEST_TIMEOUT = 30000

function makeError(code: number, message: string): RpcError {
  const err = new Error(message) as RpcError
  err.code = code
  err.rpcMessage = message
  return err
}

interface Endpoint {
  wsUrl: string
  httpUrl: string
}

/**
 * Turns a loosely-specified connection config into concrete endpoints.
 * Accepts bare hosts ("127.0.0.1"), full URLs ("http://nas:6800/jsonrpc")
 * or anything in between, merging whatever parts are present.
 */
export function resolveEndpoint(config: Aria2ConnectionConfig): Endpoint {
  let host = config.host.trim()
  let port = config.port
  let path = config.path.trim() || '/jsonrpc'
  let secure = config.secure

  const m = host.match(/^(https?|wss?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/i)
  if (m) {
    const scheme = m[1].toLowerCase()
    secure = scheme === 'https' || scheme === 'wss'
    host = m[2]
    if (m[3]) port = Number(m[3])
    if (m[4]) path = m[4]
  }

  host = host.replace(/^\/+|\/+$/g, '')
  if (!path.startsWith('/')) path = '/' + path
  const proto = secure ? 's' : ''
  const suffix = port > 0 ? `:${port}` : ''
  return {
    wsUrl: `ws${proto}://${host}${suffix}${path}`,
    httpUrl: `http${proto}://${host}${suffix}${path}`,
  }
}

/**
 * A resilient aria2 JSON-RPC client.
 *
 * Prefers WebSocket (no CORS restrictions) and falls back to plain HTTP POST
 * when WebSocket cannot be established, mirroring AriaNg's behaviour.
 */
export class Aria2Client {
  private ws: WebSocket | null = null
  private httpUrl = ''
  private wsUrl = ''
  private token = ''
  private pending = new Map<string, RpcRequest>()
  private nextId = 1
  /** Transport preference from the last connect() call */
  private protocol: TransportProtocol = 'auto'
  /** Fixed reconnect interval in ms; 0 disables auto-reconnect (WS transport only) */
  private reconnectInterval = 5000
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = true

  /** Whether the active transport is HTTP instead of WebSocket */
  useHttp = false
  state: RpcState = 'idle'
  readonly events: ConnectionEvent[] = []

  private stateListeners = new Set<Listener<RpcState>>()
  private eventListeners = new Set<Listener<ConnectionEvent>>()
  private notificationListeners = new Set<NotificationListener>()

  onState(listener: Listener<RpcState>): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onEvent(listener: Listener<ConnectionEvent>): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /**
   * Subscribe to JSON-RPC notifications pushed by aria2 over WebSocket
   * (aria2.onDownloadStart, aria2.onDownloadComplete, …). The callback
   * receives the full method name and the gid from the first param.
   * Returns an unsubscribe function. HTTP transport never emits notifications.
   */
  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  /** Record something in the connection log (also used for non-RPC notes) */
  note(level: ConnectionEvent['level'], message: string) {
    const event: ConnectionEvent = { id: Date.now() + Math.random(), time: Date.now(), level, message }
    this.events.push(event)
    if (this.events.length > MAX_EVENTS) this.events.shift()
    this.eventListeners.forEach((l) => l(event))
  }

  private setState(state: RpcState) {
    if (this.state === state) return
    this.state = state
    this.stateListeners.forEach((l) => l(state))
  }

  // -------------------------------------------------------------- lifecycle

  /** (Re)connect using the given config. Safe to call repeatedly. */
  connect(config: Aria2ConnectionConfig, opts?: ConnectOptions) {
    this.shutdown()
    this.disposed = false
    this.token = config.secret ? `token:${config.secret}` : ''
    this.protocol = opts?.protocol ?? 'auto'
    this.reconnectInterval = opts?.autoReconnectInterval ?? 5000
    const endpoint = resolveEndpoint(config)
    this.wsUrl = endpoint.wsUrl
    this.httpUrl = endpoint.httpUrl
    this.useHttp = this.protocol === 'http'
    this.reconnectAttempts = 0
    this.note('info', `连接 ${this.useHttp ? endpoint.httpUrl : endpoint.wsUrl}`)
    if (this.useHttp) this.probeHttp()
    else this.openWebSocket(true)
  }

  private openWebSocket(isInitial: boolean) {
    if (this.disposed) return
    this.setState('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.wsUrl)
    } catch (e) {
      this.onTransportFailure(isInitial, `无法创建 WebSocket：${(e as Error).message}`)
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.reconnectAttempts = 0
      this.setState('connected')
      this.note('info', 'WebSocket 已连接')
    }

    ws.onmessage = (ev) => {
      let data: RpcResponse | RpcResponse[]
      try {
        data = JSON.parse(ev.data as string) as RpcResponse | RpcResponse[]
      } catch {
        return
      }
      for (const item of Array.isArray(data) ? data : [data]) this.handleResponse(item)
    }

    ws.onclose = (ev) => {
      if (this.ws !== ws) return
      this.ws = null
      this.rejectAll(makeError(-1, '连接已断开'))
      if (this.disposed) return
      this.onTransportFailure(isInitial, `WebSocket 关闭（code ${ev.code}）`)
    }
  }

  private onTransportFailure(isInitial: boolean, reason: string) {
    if (this.disposed) return
    // The very first WebSocket attempt failing usually means the aria2 build
    // has no WebSocket support, or a proxy strips the upgrade. With 'auto' we
    // fall back to HTTP; with 'websocket' we stay on WS and retry. A failure
    // after we were connected is a transient drop: reconnect.
    if (isInitial && this.protocol === 'auto') {
      this.note('warn', `${reason}，改用 HTTP 传输`)
      this.useHttp = true
      this.probeHttp()
      return
    }
    this.scheduleReconnect()
  }

  /** Verify the HTTP endpoint answers before declaring ourselves connected */
  private probeHttp() {
    this.setState('connecting')
    this.request<{ version: string }>('getVersion', [])
      .then((v) => {
        if (this.disposed) return
        this.setState('connected')
        this.note('info', `已通过 HTTP 连接 aria2 ${v.version}`)
      })
      .catch((e: RpcError) => {
        if (this.disposed) return
        this.note('error', `连接失败：${e.rpcMessage}`)
        this.scheduleReconnect()
      })
  }

  private scheduleReconnect() {
    if (this.disposed) return
    this.setState('disconnected')
    // Automatic reconnection only applies to the WebSocket transport; with
    // HTTP the user reconnects manually (connect()/reconnect() still work).
    if (this.useHttp) return
    if (this.reconnectInterval <= 0) {
      this.note('warn', '自动重连已禁用，可手动重新连接')
      return
    }
    this.reconnectAttempts += 1
    this.note('warn', `${Math.round(this.reconnectInterval / 1000)} 秒后重连（第 ${this.reconnectAttempts} 次）`)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.disposed) return
      this.openWebSocket(false)
    }, this.reconnectInterval)
  }

  /** Tear down the transport without notifying listeners of a disconnect */
  private shutdown() {
    this.disposed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }
    this.rejectAll(makeError(-1, '连接已关闭'))
    this.setState('idle')
  }

  disconnect() {
    this.shutdown()
    this.note('info', '已断开连接')
  }

  /** True when an RPC call can be issued right now */
  get ready() {
    return this.useHttp ? this.state === 'connected' : this.ws?.readyState === WebSocket.OPEN
  }

  // -------------------------------------------------------------- rpc calls

  call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    return this.request<T>(method, params)
  }

  /**
   * Run several aria2 calls in a single round trip via system.multicall.
   * The RPC token is prepended to each call's params automatically.
   *
   * Resolves with one entry per call (same order): a Promise that fulfils with
   * the unwrapped result, or rejects with an RpcError when that single call
   * returned a multicall fault. Entries are already settled or about to settle
   * — always consume them with Promise.all / Promise.allSettled immediately.
   */
  async multicall(calls: { method: string; params: unknown[] }[]): Promise<unknown[]> {
    if (calls.length === 0) return []
    const payload = calls.map((c) => ({
      methodName: `aria2.${c.method}`,
      params: this.token ? [this.token, ...c.params] : [...c.params],
    }))
    const raw = await this.request<unknown>('system.multicall', [payload])
    const entries = Array.isArray(raw) ? raw : []
    return entries.map((entry) => {
      // Per the XML-RPC multicall convention aria2 follows, each entry is
      // [result] on success or { faultCode, faultMessage } on failure.
      if (Array.isArray(entry)) return Promise.resolve(entry[0])
      const fault = entry as { faultCode?: number; faultMessage?: string } | null
      return Promise.reject(makeError(fault?.faultCode ?? -1, fault?.faultMessage || '批量调用失败'))
    })
  }

  private request<T>(method: string, params: unknown[]): Promise<T> {
    const fullParams = this.token ? [this.token, ...params] : params

    if (this.useHttp) return this.requestHttp<T>(method, fullParams)

    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(makeError(-1, '连接尚未就绪'))
    }

    const id = String(this.nextId++)
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(makeError(-2, `请求超时：${method}`))
      }, REQUEST_TIMEOUT)
      this.pending.set(id, {
        id,
        resolve: resolve as (v: unknown) => void,
        reject,
        cleanup: () => clearTimeout(timer),
      })
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: `aria2.${method}`, params: fullParams }))
    })
  }

  private async requestHttp<T>(method: string, fullParams: unknown[]): Promise<T> {
    let res: Response
    try {
      res = await fetch(this.httpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: String(this.nextId++),
          method: `aria2.${method}`,
          params: fullParams,
        }),
      })
    } catch (e) {
      throw makeError(-1, `网络错误：${(e as Error).message}`)
    }
    let body: RpcResponse | RpcResponse[]
    try {
      body = (await res.json()) as RpcResponse | RpcResponse[]
    } catch {
      throw makeError(-1, `HTTP ${res.status}：响应不是合法的 JSON-RPC`)
    }
    const single = Array.isArray(body) ? body[0] : body
    if (!single) throw makeError(-1, '空响应')
    if (single.error) throw makeError(single.error.code, single.error.message)
    return single.result as T
  }

  private handleResponse(res: RpcResponse) {
    if (res.id === undefined || res.id === null) {
      // No id: a JSON-RPC notification pushed by aria2 over WebSocket
      // (aria2.onDownloadStart etc.), with params [gid].
      const method = res.method
      if (!method) return
      const params = Array.isArray(res.params) ? res.params : []
      const gid = typeof params[0] === 'string' ? params[0] : ''
      this.notificationListeners.forEach((l) => l(method, gid))
      return
    }
    const req = this.pending.get(String(res.id))
    if (!req) return
    this.pending.delete(req.id)
    req.cleanup()
    if (res.error) req.reject(makeError(res.error.code, res.error.message))
    else req.resolve(res.result)
  }

  private rejectAll(err: RpcError) {
    for (const req of this.pending.values()) {
      req.cleanup()
      req.reject(err)
    }
    this.pending.clear()
  }
}

export const client = new Aria2Client()

/** Extract a human-readable message from any thrown RPC/JS error */
export function errorText(e: unknown): string {
  const err = e as Partial<RpcError> | undefined
  return err?.rpcMessage || err?.message || String(e)
}
