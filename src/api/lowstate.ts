/**
 * ============================================================
 * FastAPI /lowstate 数据源 —— 替代 rosbridge WebSocket 连接层
 * ============================================================
 *
 * 连接流程（健康检查先行）：
 *   1. 点「连接」→ 先发健康检查 GET /api/v1/test
 *   2. 健康通过（后端在线）→ 建立 WebSocket 连接 /api/v1/ws/lowstate 收实时帧
 *   3. 健康失败（后端离线 / 机器人未开机）→ 弹一次"连接失败，请检查机器人状态"，
 *      不建立连接，不做反复重试
 *
 * 帧格式 {"motors": [...], "ts": "..."} 直接写入 topicData.motorState，
 * 2D 视图 / 遥测 / 告警从 topicData 读取，UI 层与传输方式无关。
 *
 * 用法（App.vue）：
 *   import { connectLowstate, disconnectLowstate, useLowstateStatus } from '@/api/lowstate'
 *   connectLowstate(ip, { onOpen, onError, onClose })
 *   const { connected, statusText, lastError } = useLowstateStatus()
 */

import { ref } from 'vue'
import { topicData } from '@/ros/useTopics'
import { buildApiBase, createApiClient } from './client'

// ============================================================
// 连接状态（响应式，界面上显示）
// ============================================================

const connected = ref(false)
const statusText = ref('未连接')
const lastError = ref<string | null>(null)

// ============================================================
// 内部变量
// ============================================================

let ws: WebSocket | null = null
/** 连接尝试序号：每次 connect 自增，旧尝试的异步回调作废 */
let attemptSeq = 0
/** 是否主动断开（主动断开时不触发回调） */
let manualDisconnect = false
/** WS 是否已结束（错误/不可用），onclose 不再重复回调 */
let wsEnded = false

export interface LowstateCallbacks {
  onOpen?: () => void
  onError?: (message: string) => void
  onClose?: () => void
}

// ============================================================
// 核心逻辑
// ============================================================

/** 写入一帧低状态数据（帧格式与后端 /lowstate 一致：motors + ts） */
function applyFrame(frame: { motors?: unknown[] }): void {
  if (!frame || !Array.isArray(frame.motors)) return
  topicData.motorState = { motors: frame.motors }
}

/** 清理 WS 连接（不触发回调） */
function clearWs(): void {
  if (!ws) return
  ws.onopen = null
  ws.onmessage = null
  ws.onclose = null
  ws.onerror = null
  ws.close()
  ws = null
}

/** 建立 WebSocket 连接并接管消息（健康检查通过后才调用） */
function openWs(ip: string, callbacks?: LowstateCallbacks): void {
  clearWs()
  wsEnded = false
  const wsUrl = buildApiBase(ip).replace(/^http/, 'ws') + '/api/v1/ws/lowstate'
  statusText.value = '连接中...'
  lastError.value = null

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    connected.value = true
    statusText.value = `已连接 → ${wsUrl}`
    lastError.value = null
    callbacks?.onOpen?.()
  }

  ws.onmessage = (ev: MessageEvent) => {
    try {
      const frame = JSON.parse(ev.data as string)
      // 后端约定：ROS 未启用时发 {"unavailable": true, "message": "..."} 后关闭
      if (frame?.unavailable) {
        wsEnded = true
        connected.value = false
        statusText.value = '数据源不可用'
        lastError.value = frame.message ?? '实时状态不可用'
        return
      }
      applyFrame(frame)
    } catch (e) {
      console.warn('[lowstate] 帧解析失败:', e)
    }
  }

  ws.onerror = () => {
    if (manualDisconnect || wsEnded) return
    wsEnded = true
    connected.value = false
    statusText.value = '连接失败'
    lastError.value = '机器人状态异常'
    callbacks?.onError?.('连接失败，请检查机器人状态')
  }

  ws.onclose = () => {
    if (manualDisconnect || wsEnded) return
    connected.value = false
    statusText.value = '连接已关闭'
    callbacks?.onClose?.()
  }
}

/**
 * 连接 FastAPI /lowstate 数据源（健康检查先行，通过后才建 WS）
 *
 * @param ip        机器人 IP（FastAPI 端口取 client.ts 的 API_PORT）
 * @param callbacks 连接事件回调
 */
export function connectLowstate(ip: string, callbacks?: LowstateCallbacks): void {
  manualDisconnect = false
  const attempt = ++attemptSeq
  clearWs()
  connected.value = false
  statusText.value = '检查机器人状态...'
  lastError.value = null

  const api = createApiClient(buildApiBase(ip))
  api.get<{ status?: string }>('/api/v1/test')
    .then(() => {
      // 已被更新的连接/断开取代，或已主动断开：不再继续
      if (manualDisconnect || attempt !== attemptSeq) return
      openWs(ip, callbacks)
    })
    .catch(() => {
      if (manualDisconnect || attempt !== attemptSeq) return
      connected.value = false
      statusText.value = '连接失败'
      lastError.value = '机器人未上线'
      callbacks?.onError?.('连接失败，请检查机器人状态')
    })
}

/** 断开数据源连接并清空数据 */
export function disconnectLowstate(): void {
  manualDisconnect = true
  wsEnded = true
  attemptSeq++
  clearWs()
  connected.value = false
  statusText.value = '未连接'
  lastError.value = null
  delete topicData.motorState
}

/** 获取数据源连接状态（在 .vue 里用） */
export function useLowstateStatus() {
  return { connected, statusText, lastError }
}
