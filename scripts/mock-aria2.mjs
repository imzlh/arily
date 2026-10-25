// 开发用 aria2 RPC 模拟服务器：支持 HTTP POST 与 WebSocket 双通道、任务进度模拟、事件通知。
// 用法：node scripts/mock-aria2.mjs [端口]（默认 6800）
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.argv[2]) || 6800;
const TICK_MS = 500;

const FEATURES = [
  'Async DNS', 'BitTorrent', 'FTPS', 'Flash XML-RPC', 'GZip', 'HTTPS',
  'HTTP Server', 'IPv6', 'Large file', 'Metalink', 'Message Digest',
  'SFTP', 'SSL/TLS', 'Unix Socket',
];

const DEFAULT_GLOBAL_OPTIONS = {
  dir: 'D:\\Downloads',
  'max-concurrent-downloads': '5',
  'max-overall-download-limit': '0',
  'max-overall-upload-limit': '0',
  'max-download-limit': '0',
  'max-upload-limit': '0',
  'max-connection-per-server': '8',
  split: '8',
  'min-split-size': '20M',
  continue: 'true',
  'user-agent': 'aria2/1.37.0',
  'retry-wait': '5',
  timeout: '60',
  'connect-timeout': '30',
  'lowest-speed-limit': '0',
  'auto-file-renaming': 'true',
  'allow-overwrite': 'false',
  'file-allocation': 'prealloc',
  'disk-cache': '32M',
  'seed-ratio': '1.0',
  'seed-time': '0',
  'bt-max-peers': '80',
  'bt-enable-lpd': 'true',
  'enable-dht': 'true',
  'listen-port': '6881-6999',
  'dht-listen-port': '6881-6999',
  'follow-torrent': 'true',
  'bt-tracker': '',
  'check-integrity': 'false',
  'rpc-listen-port': String(PORT),
  'save-session': '',
  log: '',
  'log-level': 'warn',
};

const state = {
  seq: 1,
  tasks: new Map(), // gid -> task
  globalOptions: { ...DEFAULT_GLOBAL_OPTIONS },
  sessionId: crypto.randomUUID().replace(/-/g, ''),
  version: '1.37.0',
};

const wsClients = new Set();

function newGid() {
  return crypto.randomBytes(8).toString('hex');
}

function isTorrentish(uri) {
  return /^magnet:/i.test(uri) || /\.torrent$/i.test(uri);
}

function guessTotalLength(uri) {
  const m = /(\d+(?:\.\d+)?)\s*(kb|mb|gb)/i.exec(uri);
  if (m) {
    const n = parseFloat(m[1]);
    const mult = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[m[2].toLowerCase()];
    return Math.round(n * mult);
  }
  return 80 * 1024 * 1024 + Math.floor(Math.random() * 40 * 1024 * 1024);
}

function makeBitfield(total, completed, pieceLength) {
  const numPieces = Math.max(1, Math.ceil(total / pieceLength));
  const done = Math.min(numPieces, Math.floor((completed / Math.max(total, 1)) * numPieces));
  const bytes = Math.ceil(numPieces / 8);
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i < done; i++) buf[i >> 3] |= 0x80 >> (i & 7);
  return buf.toString('hex');
}

function taskView(task) {
  const view = { gid: task.gid, status: task.status };
  Object.assign(view, {
    totalLength: String(task.totalLength),
    completedLength: String(task.completedLength),
    uploadLength: String(task.uploadLength),
    downloadSpeed: String(task.downloadSpeed),
    uploadSpeed: String(task.uploadSpeed),
    connections: String(task.connections),
    numSeeders: String(task.numSeeders),
    seeder: task.seeder ? 'true' : 'false',
    pieceLength: String(task.pieceLength),
    numPieces: String(Math.max(1, Math.ceil(task.totalLength / task.pieceLength))),
    bitfield: makeBitfield(task.totalLength, task.completedLength, task.pieceLength),
    verifiedLength: task.status === 'complete' ? String(task.totalLength) : '0',
    completedTime: task.completedTime ? String(Math.floor(task.completedTime / 1000)) : undefined,
    errorCode: task.errorCode ? String(task.errorCode) : undefined,
    errorMessage: task.errorMessage,
    dir: task.options.dir || DEFAULT_GLOBAL_OPTIONS.dir,
    files: task.files,
    bittorrent: task.bittorrent,
    infoHash: task.infoHash,
    followedBy: task.followedBy,
    following: task.following,
    belongsTo: task.belongsTo,
  });
  for (const key of Object.keys(view)) if (view[key] === undefined) delete view[key];
  return view;
}

function statusOf(task) {
  if (task.status === 'complete' || task.status === 'error' || task.status === 'removed') return 'stopped';
  if (task.status === 'paused') return 'paused';
  if (task.status === 'waiting') return 'waiting';
  return 'active';
}

function emit(method, gid) {
  if (wsClients.size === 0) return;
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params: [gid] });
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

function note(text) {
  console.log(`[mock] ${text}`);
}

function addUriTask(uris, options, paused) {
  const gid = newGid();
  const uri = uris[0] || 'unknown://';
  const torrentish = isTorrentish(uri);
  const pieceLength = 512 * 1024;
  const total = torrentish && /^magnet:/i.test(uri) ? 0 : guessTotalLength(uri);
  const name = torrentish
    ? `Ubuntu-24.04-desktop-amd64.iso.torrent`
    : decodeURIComponent(uri.split('/').pop() || 'download.bin');
  const task = {
    gid,
    status: paused ? 'waiting' : 'active',
    totalLength: total,
    completedLength: 0,
    uploadLength: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    connections: 0,
    numSeeders: 0,
    seeder: false,
    pieceLength,
    dir: options?.dir || '',
    options: { dir: options?.dir || '', out: options?.out || '' },
    files: [{
      index: '1', path: `${options?.dir || DEFAULT_GLOBAL_OPTIONS.dir}\\${name}`,
      length: String(total || 100 * 1024 * 1024), completedLength: '0', selected: 'true',
      uris: [{ uri, status: 'used' }],
    }],
    bittorrent: torrentish ? { announceList: [[`udp://tracker.opentrackr.org:1337/announce`], [`udp://tracker.openbittorrent.com:6969/announce`]], comment: '模拟任务', creationDate: Math.floor(Date.now() / 1000) - 86400 * 30 } : undefined,
    infoHash: torrentish ? crypto.randomBytes(20).toString('hex') : undefined,
    uris,
    metadataPending: torrentish && /^magnet:/i.test(uri),
    addedAt: Date.now(),
  };
  if (total > 6 * pieceLength) {
    // 多文件 BT 假任务（补充几个文件便于测试文件树）
    task.files = [task.files[0]];
    for (let i = 1; i <= 3; i++) {
      const sub = 8 * 1024 * 1024 * i;
      task.totalLength += sub;
      task.files.push({
        index: String(i + 1), path: `${options?.dir || DEFAULT_GLOBAL_OPTIONS.dir}\\SubFolder\\episode-0${i}.mkv`,
        length: String(sub), completedLength: '0', selected: i % 2 === 1 ? 'true' : 'false',
        uris: [],
      });
    }
  }
  state.tasks.set(gid, task);
  if (!paused) {
    setTimeout(() => emit('aria2.onDownloadStart', gid), 150);
  }
  note(`addUri -> ${gid} (${uri.slice(0, 60)})`);
  return gid;
}

function addTorrentTask(base64, options, paused) {
  const gid = addUriTask(['magnet:?xt=urn:btih:' + crypto.randomBytes(20).toString('hex')], options, paused);
  return gid;
}

function tick() {
  const now = Date.now();
  for (const task of state.tasks.values()) {
    if (task.metadataPending && now - task.addedAt > 3000) {
      task.metadataPending = false;
      task.totalLength = 120 * 1024 * 1024;
      task.files[0].length = String(task.totalLength);
      emit('aria2.onDownloadStart', task.gid);
      note(`metadata ready -> ${task.gid}`);
    }
    if (task.status !== 'active') {
      task.downloadSpeed = 0;
      task.uploadSpeed = task.seeder && task.status === 'active' ? 300 * 1024 : 0;
      continue;
    }
    const speedCap = task.metadataPending ? 0 : 4 * 1024 * 1024 + Math.floor(Math.random() * 1024 * 1024);
    const delta = Math.min(speedCap * (TICK_MS / 1000), Math.max(task.totalLength - task.completedLength, 0));
    task.completedLength += delta;
    task.downloadSpeed = delta > 0 ? speedCap : 0;
    task.connections = task.totalLength > 0 ? 8 + Math.floor(Math.random() * 20) : 0;
    task.numSeeders = task.totalLength > 0 ? 3 + Math.floor(Math.random() * 10) : 0;
    if (isTorrentish(task.uris[0] || '')) {
      task.uploadLength += 200 * 1024;
      task.uploadSpeed = 800 * 1024;
    }
    task.files[0].completedLength = String(Math.min(task.completedLength, Number(task.files[0].length)));
    if (task.totalLength > 0 && task.completedLength >= task.totalLength) {
      task.completedLength = task.totalLength;
      task.status = 'complete';
      task.completedTime = Date.now();
      task.seeder = isTorrentish(task.uris[0] || '');
      task.downloadSpeed = 0;
      emit(task.seeder ? 'aria2.onBtDownloadComplete' : 'aria2.onDownloadComplete', task.gid);
      note(`complete -> ${task.gid}`);
    }
  }
}

function lists() {
  const all = [...state.tasks.values()];
  const byPos = (a, b) => a.addedAt - b.addedAt;
  return {
    active: all.filter((t) => t.status === 'active').sort(byPos),
    waiting: all.filter((t) => t.status === 'waiting' || t.status === 'paused').sort(byPos),
    stopped: all.filter((t) => ['complete', 'error', 'removed'].includes(t.status)).sort(byPos),
  };
}

function getGlobalStat() {
  const { active, waiting, stopped } = lists();
  return {
    downloadSpeed: String(active.reduce((s, t) => s + t.downloadSpeed, 0)),
    uploadSpeed: String(active.reduce((s, t) => s + t.uploadSpeed, 0)),
    numActive: String(active.length),
    numWaiting: String(waiting.length),
    numStopped: String(stopped.length),
    numStoppedTotal: String(stopped.length),
  };
}

const handlers = {
  getVersion: () => ({ version: state.version, enabledFeatures: FEATURES }),
  getSessionInfo: () => ({ sessionId: state.sessionId }),
  getGlobalStat,
  getGlobalOption: () => state.globalOptions,
  changeGlobalOption: ([opts]) => {
    Object.assign(state.globalOptions, opts);
    note(`changeGlobalOption ${Object.keys(opts).join(',')}`);
    return 'OK';
  },
  addUri: ([uris, options]) => addUriTask(uris, options, options?.pause === 'true'),
  addTorrent: ([torrent, options]) => addTorrentTask(torrent, options, options?.pause === 'true'),
  addMetalink: () => newGid(),
  tellActive: () => lists().active.map(taskView),
  tellWaiting: ([offset, num]) => lists().waiting.slice(offset, offset + num).map(taskView),
  tellStopped: ([offset, num]) => lists().stopped.slice(offset, offset + num).map(taskView),
  tellStatus: ([gid]) => {
    const task = state.tasks.get(gid);
    if (!task) throw rpcError(1, `未找到任务 ${gid}`);
    return taskView(task);
  },
  getOption: ([gid]) => {
    const task = state.tasks.get(gid);
    if (!task) throw rpcError(1, `未找到任务 ${gid}`);
    return {
      dir: task.options.dir || state.globalOptions.dir,
      out: task.options.out || '',
      split: '8',
      'max-connection-per-server': '8',
      'max-download-limit': '0',
      'max-upload-limit': '0',
      'select-file': '1',
      'bt-tracker': '',
      'seed-ratio': '1.0',
      'seed-time': '0',
      continue: 'true',
      'force-save': 'false',
    };
  },
  changeOption: ([gid, opts]) => {
    const task = state.tasks.get(gid);
    if (!task) throw rpcError(1, `未找到任务 ${gid}`);
    if (opts.dir !== undefined) task.options.dir = opts.dir;
    if (opts.out !== undefined) task.options.out = opts.out;
    note(`changeOption ${gid}: ${Object.keys(opts).join(',')}`);
    return 'OK';
  },
  pause: ([gid]) => setPaused(gid, true, 'aria2.onDownloadPause'),
  'forcePause': ([gid]) => setPaused(gid, true, 'aria2.onDownloadPause'),
  unpause: ([gid]) => setPaused(gid, false, 'aria2.onDownloadStart'),
  pauseAll: () => {
    for (const t of state.tasks.values()) if (t.status === 'active') setPaused(t.gid, true, 'aria2.onDownloadPause');
    return 'OK';
  },
  unpauseAll: () => {
    for (const t of state.tasks.values()) if (t.status === 'paused') setPaused(t.gid, false, 'aria2.onDownloadStart');
    return 'OK';
  },
  remove: ([gid]) => removeTask(gid, 'aria2.onDownloadStop'),
  'forceRemove': ([gid]) => removeTask(gid, 'aria2.onDownloadStop'),
  removeDownloadResult: ([gid]) => {
    const task = state.tasks.get(gid);
    if (!task) throw rpcError(1, `未找到任务 ${gid}`);
    if (!['complete', 'error', 'removed'].includes(task.status)) throw rpcError(1, '该任务尚未停止');
    state.tasks.delete(gid);
    return 'OK';
  },
  purgeDownloadResult: () => {
    for (const [gid, t] of state.tasks) if (['complete', 'error', 'removed'].includes(t.status)) state.tasks.delete(gid);
    return 'OK';
  },
  forcePauseAll: () => handlers.pauseAll(),
  changePosition: ([gid, pos, how]) => {
    const { waiting } = lists();
    const idx = waiting.findIndex((t) => t.gid === gid);
    if (idx === -1) throw rpcError(1, '任务不在等待队列中');
    let target = idx;
    if (how === 'POS_SET') target = Math.max(0, Math.min(pos, waiting.length - 1));
    else if (how === 'POS_CUR') target = Math.max(0, Math.min(idx + pos, waiting.length - 1));
    else if (how === 'POS_INC') target = idx + pos;
    const [moved] = waiting.splice(idx, 1);
    waiting.splice(target, 0, moved);
    const newPos = waiting.indexOf(moved);
    note(`changePosition ${gid} ${how} ${pos} -> ${newPos}`);
    return String(newPos);
  },
  getUris: ([gid]) => {
    const task = state.tasks.get(gid);
    if (!task) throw rpcError(1, `未找到任务 ${gid}`);
    return task.uris.map((u) => ({ uri: u, status: 'used' }));
  },
  getPeers: ([gid]) => {
    const task = state.tasks.get(gid);
    if (!task) throw rpcError(1, `未找到任务 ${gid}`);
    if (statusOf(task) !== 'active' || !task.bittorrent) return [];
    const numPieces = Math.max(1, Math.ceil(task.totalLength / task.pieceLength));
    const clients = [
      ['qBittorrent 5.0.1', '-qB5010-'],
      ['Transmission 4.0.6', '-TR4060-'],
      ['aria2/1.37.0', 'A2-1-37-0-'],
      ['libtorrent 2.0.10', '-LT2010-'],
    ];
    return clients.map(([client, prefix], i) => {
      const done = Math.max(0, numPieces - 10 - i * 15);
      const bytes = Math.ceil(numPieces / 8);
      const buf = Buffer.alloc(bytes);
      for (let p = 0; p < done; p++) buf[p >> 3] |= 0x80 >> (p & 7);
      return {
        peerId: prefix + crypto.randomBytes(12).toString('hex').slice(0, 20 - prefix.length),
        ip: `192.168.1.${10 + i}`, port: String(6881 + i), client,
        amChoking: i === 3 ? 'true' : 'false', peerChoking: 'false',
        amInterested: 'true', peerInterested: i % 2 === 0 ? 'true' : 'false',
        downloadSpeed: String(1024 * 1024 * (4 - i)), uploadSpeed: String(256 * 1024 * i),
        seeder: i === 0 ? 'true' : 'false',
        bitfield: buf.toString('hex'),
      };
    });
  },
  getServers: () => [{ index: '1', servers: [{ uri: 'http://speed.example.com/file', current: 'true', downloadSpeed: '1048576' }] }],
  saveSession: () => 'OK',
  shutdown: () => 'OK',
  'forceShutdown': () => 'OK',
  'system.listMethods': () => Object.keys(handlers).map((k) => (k.startsWith('system.') ? k : `aria2.${k}`)).concat('system.multicall', 'system.listNotifications'),
  'system.listNotifications': () => ['aria2.onDownloadStart', 'aria2.onDownloadPause', 'aria2.onDownloadStop', 'aria2.onDownloadComplete', 'aria2.onDownloadError', 'aria2.onBtDownloadComplete'],
};

function rpcError(code, message) {
  return Object.assign(new Error(message), { code });
}

function setPaused(gid, paused, notify) {
  const task = state.tasks.get(gid);
  if (!task) throw rpcError(1, `未找到任务 ${gid}`);
  if (paused) {
    if (task.status !== 'active') throw rpcError(1, '任务未在下载中');
    task.status = 'paused';
  } else {
    if (task.status !== 'paused') throw rpcError(1, '任务未暂停');
    task.status = 'active';
    emit(notify, gid);
  }
  return gid;
}

function removeTask(gid, notify) {
  const task = state.tasks.get(gid);
  if (!task) throw rpcError(1, `未找到任务 ${gid}`);
  if (['complete', 'error', 'removed'].includes(task.status)) throw rpcError(1, '任务已停止，请使用 removeDownloadResult');
  task.status = 'removed';
  task.downloadSpeed = 0;
  emit(notify, gid);
  return gid;
}

function stripToken(params) {
  if (params.length && typeof params[0] === 'string' && params[0].startsWith('token:')) {
    const [, ...rest] = params;
    return rest;
  }
  return params;
}

async function dispatch(method, params) {
  if (!method.startsWith('system.') && !method.startsWith('aria2.')) {
    throw rpcError(32601, `未知方法 ${method}`);
  }
  const key = method.replace(/^aria2\./, '');
  const handler = handlers[key] ?? handlers[method];
  if (!handler) throw rpcError(32601, `未知方法 ${method}`);
  return handler(stripToken(params || []));
}

async function handleRpc(body) {
  if (Array.isArray(body)) {
    const results = [];
    for (const call of body) results.push(await handleRpc(call));
    return results;
  }
  const { id, method, params } = body;
  try {
    const result = await dispatch(method, params);
    return { jsonrpc: '2.0', id, result };
  } catch (err) {
    return { jsonrpc: '2.0', id, error: { code: err.code || 1, message: err.message } };
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  let data = '';
  req.on('data', (chunk) => (data += chunk));
  req.on('end', async () => {
    try {
      const body = JSON.parse(data || '{}');
      const response = await handleRpc(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `解析失败: ${err.message}` } }));
    }
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  wsClients.add(ws);
  note(`ws client connected (${wsClients.size} total)`);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('message', async (raw) => {
    try {
      const body = JSON.parse(String(raw));
      const response = await handleRpc(body);
      if (ws.readyState === 1) ws.send(JSON.stringify(response));
    } catch {
      /* 忽略无法解析的消息 */
    }
  });
});

server.listen(PORT, () => {
  note(`模拟 aria2 已启动: http://127.0.0.1:${PORT}/jsonrpc 与 ws://127.0.0.1:${PORT}/jsonrpc`);
  setInterval(tick, TICK_MS);
  // 预置任务，方便打开页面即有数据
  addUriTask(['http://speedtest.example.com/10Mb.dat'], {}, false);
  addUriTask(['magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Big.Buck.Bunny.1080p'], {}, false);
  addUriTask(['http://speedtest.example.com/archieve.tar.gz'], { dir: DEFAULT_GLOBAL_OPTIONS.dir }, true);
});
