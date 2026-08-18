/**
 * 本地 mock FastAPI 服务（模拟机器人内部 bsd-unitree-controller 的 HTTP 接口）
 * 用于前端联调：按 docs/http-api.md 的 Result 格式返回。
 * 启动：node scripts/mock-fastapi.mjs  （监听 127.0.0.1:18800）
 *
 * 覆盖前端全部调用：
 *   - REST：test / alive / estop(trigger,state) / sport(fsm) / lowstate(current) / agv / epc
 *   - WebSocket：/api/v1/ws/lowstate 实时推流（1Hz，与 REST 同帧格式）
 *
 * 特例：agv/call 传 workstation=W99 时返回业务错误（验证前端错误提示）。
 */
import http from 'node:http'
import { WebSocketServer } from 'ws'

const ok = (data) => ({ code: 1, message: 'success', data })
const fail = (code, message) => ({ code, message, data: null })

// ---- 可变状态（让接口间有联动，方便联调） ----
let currentFsmId = 802
let estopActive = false

/** 生成一帧电机状态（默认 29 个，对应 G1） */
function fakeMotors(count = 29) {
  const t = Date.now()
  return Array.from({ length: count }, (_, i) => ({
    mode: 1,
    q: Number((Math.sin(t / 1000 + i * 0.7) * 0.5).toFixed(3)),
    tau_est: Number((Math.sin(t / 1500 + i) * 2).toFixed(2)),
    temperature: [Number((35 + Math.abs(Math.sin(t / 3000 + i)) * 8).toFixed(1))],
    vol: 25.6,
  }))
}

/** /lowstate 一帧（与 GET /lowstate/current、WS 共用） */
function lowstateFrame() {
  return { motors: fakeMotors(), ts: new Date().toISOString() }
}

const server = http.createServer((req, res) => {
  const send = (body) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end(JSON.stringify(body))
  }
  // 预检请求直接放行
  if (req.method === 'OPTIONS') return send({})
  const url = new URL(req.url, 'http://127.0.0.1')
  const path = url.pathname

  if (req.method === 'GET' && path === '/api/v1/test') {
    return send(ok({ status: 'up' }))
  }
  if (req.method === 'GET' && path === '/api/v1/alive') {
    return send(ok({ status: 'alive', node_name: 'api_ctr', timestamp: '2026-08-17T10:00:00' }))
  }

  // ---- 实时状态 ----
  if (req.method === 'GET' && path === '/api/v1/lowstate/current') {
    return send(ok(lowstateFrame()))
  }

  // ---- 运动服务 FSM ----
  if (req.method === 'GET' && path === '/api/v1/sport/fsm') {
    return send(ok({ fsmId: currentFsmId }))
  }
  if (req.method === 'POST' && path === '/api/v1/sport/fsm') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const dto = body ? JSON.parse(body) : {}
      if (dto.data === undefined) return send(fail(400, 'data 缺失'))
      currentFsmId = dto.data
      return send(ok({ fsmId: currentFsmId }))
    })
    return
  }

  // ---- 急停 ----
  if (req.method === 'GET' && path === '/api/v1/estop/state') {
    return send(ok({ estop: estopActive }))
  }
  if (req.method === 'POST' && path === '/api/v1/estop/trigger') {
    estopActive = true
    return send(ok({ triggered: true }))
  }

  // ---- AGV ----
  if (req.method === 'POST' && path === '/api/v1/agv/call') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const dto = body ? JSON.parse(body) : {}
      if (dto.workstation === 'W99') {
        return send(fail(50001, 'AGV 调度失败：目标工位不可用'))
      }
      return send(ok({ workstation: dto.workstation ?? 'W03', response: { success: true, result: {} } }))
    })
    return
  }
  if (req.method === 'POST' && path === '/api/v1/agv/return') {
    return send(ok({ workstation: 'W03', container: 'T0377461', response: { success: true } }))
  }
  if (req.method === 'GET' && path === '/api/v1/agv/current') {
    return send(ok({ container: 'T0377461' }))
  }

  // ---- EPC ----
  if (req.method === 'POST' && path === '/api/v1/epc/start-scan') {
    return send(ok({ requestId: 'a1b2c3d4e5f6' }))
  }
  if (req.method === 'GET' && path === '/api/v1/epc/current') {
    return send(ok({ requestId: 'a1b2c3d4e5f6', epc: 'E2XX1234567890' }))
  }

  return send(fail(404, 'not found'))
})

// ---- WebSocket：/api/v1/ws/lowstate 实时推流（1Hz，与 REST 同帧格式） ----
const wss = new WebSocketServer({ server, path: '/api/v1/ws/lowstate' })
wss.on('connection', (socket) => {
  // 连接建立后立即推一帧（页面秒渲染），之后每秒一帧
  socket.send(JSON.stringify(lowstateFrame()))
  const timer = setInterval(() => socket.send(JSON.stringify(lowstateFrame())), 1000)
  socket.on('close', () => clearInterval(timer))
})

server.listen(18800, '127.0.0.1', () => {
  console.log('[mock-fastapi] listening on http://127.0.0.1:18800 (ws /api/v1/ws/lowstate)')
})
