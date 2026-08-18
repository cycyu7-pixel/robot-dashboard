/**
 * ============================================================
 * FastAPI 接口封装 —— 对应 docs/http-api.md
 * ============================================================
 *
 * 机器人在内部部署了 FastAPI 服务（端口见 client.ts 的 API_PORT），
 * 这里把前端要用的接口统一封装。接口均以 /api/v1 为前缀，
 * 返回统一 Result 包装（client.ts 已解包，这里直接拿到业务数据）。
 *
 * 用法：
 *   import { createFastApi } from '@/api'
 *   const api = createFastApi('192.168.123.99')
 *   const alive = await api.alive()
 *   await api.callAgv({ workstation: 'W03' })
 */

import { buildApiBase, createApiClient } from './client'

/** 由机器人 IP 创建 FastAPI 客户端（IP 由顶栏输入，复用同一份） */
export function createFastApi(ip: string) {
  const api = createApiClient(buildApiBase(ip))
  return {
    // ---------- 服务状态 ----------
    /** 健康检查 */
    test: () => api.get<TestVO>('/api/v1/test'),
    /** 节点存活检查 */
    alive: () => api.get<AliveVO>('/api/v1/alive'),

    // ---------- 机器人本体控制 ----------
    /** 触发急停（经 service 层调 ROS service /g1/estop/trigger） */
    triggerEstop: () => api.post<EstopVO>('/api/v1/estop/trigger'),
    /** 查询急停状态（经 service 层调 ROS service 查询） */
    estopState: () => api.get<EstopStateVO>('/api/v1/estop/state'),

    // ---------- 运动服务（FSM 模式查询/切换） ----------
    /** 查询当前 FSM 模式 */
    getFsm: () => api.get<SportFsmVO>('/api/v1/sport/fsm'),
    /** 切换 FSM 模式 */
    setFsm: (data: number) => api.post<SportFsmVO>('/api/v1/sport/fsm', { data }),

    // ---------- AGV 调度 ----------
    /** 呼叫 AGV 到工位 */
    callAgv: (dto: AgvCallDTO) => api.post<AgvCallVO>('/api/v1/agv/call', dto),
    /** AGV 返库（podNo 不传用到位回调缓存的 container） */
    agvReturn: (dto: AgvReturnDTO) => api.post<AgvReturnVO>('/api/v1/agv/return', dto),
    /** 查询当前缓存的 AGV container */
    getAgvCurrent: () => api.get<AgvCurrentVO>('/api/v1/agv/current'),

    // ---------- EPC 条码读取 ----------
    /** 发起 EPC 扫描，返回唯一 requestId */
    startEpcScan: () => api.post<EpcStartScanVO>('/api/v1/epc/start-scan'),
    /** 查询当前缓存的 EPC */
    getEpcCurrent: () => api.get<EpcCurrentVO>('/api/v1/epc/current'),
  }
}

export type FastApi = ReturnType<typeof createFastApi>

// ============================================================
// 接口出入参类型（字段与 docs/http-api.md 对应，均宽松可选）
// ============================================================

// ---- GET /api/v1/test ----
export interface TestVO {
  status?: string
}

// ---- GET /api/v1/alive ----
export interface AliveVO {
  /** alive / disabled（ROS 未启用）/ dead */
  status?: string
  /** 节点名 */
  node_name?: string
  /** 检查时间（ISO） */
  timestamp?: string
}

// ---- POST /api/v1/estop/trigger ----
export interface EstopVO {
  success?: boolean
  message?: string
}

// ---- GET /api/v1/estop/state ----
export interface EstopStateVO {
  /** true 已急停 / false 未急停 */
  estop?: boolean
}

// ---- GET/POST /api/v1/sport/fsm ----
export interface SportFsmVO {
  /** 当前/目标 FSM 模式 id */
  fsmId?: number
}

// ---- POST /api/v1/agv/call ----
export interface AgvCallDTO {
  barcode?: string
  podCategory?: string
  workstation?: string
}
export interface AgvCallVO {
  workstation?: string
  response?: unknown
}

// ---- POST /api/v1/agv/return ----
export interface AgvReturnDTO {
  podCategory?: string
  podNo?: string
  type?: string
  workstationNo?: string
}
export interface AgvReturnVO {
  workstation?: string
  container?: string | null
  response?: unknown
}

// ---- GET /api/v1/agv/current ----
export interface AgvCurrentVO {
  container?: string | null
}

// ---- POST /api/v1/epc/start-scan ----
export interface EpcStartScanVO {
  requestId?: string
}

// ---- GET /api/v1/epc/current ----
export interface EpcCurrentVO {
  requestId?: string | null
  epc?: string | null
}
