/**
 * ============================================================
 * FastAPI 占位功能接口 —— 集中管理
 * ============================================================
 *
 * 机器人在内部部署了 FastAPI 服务（端口见 client.ts 的 API_PORT），
 * 这里把前端要用的「流程功能」接口统一封装。
 *
 * ★ 目前是占位实现：接口路径/参数为假想，等拿到真实接口清单后
 *   只需要改这个文件，就能把对应功能页面换成真实请求。
 *
 * 用法：
 *   import { createFastApi } from '@/api'
 *   const api = createFastApi('http://192.168.123.99:18800')
 *   const info = await api.getDeviceInfo()
 */

import { buildApiBase, createApiClient } from './client'

/** 由机器人 IP 创建 FastAPI 客户端（IP 由顶栏输入，复用同一份） */
export function createFastApi(ip: string) {
  const api = createApiClient(buildApiBase(ip))
  return {
    /** 设备信息：型号 / 序列号 / 固件版本 */
    getDeviceInfo: () => api.get<DeviceInfo>('/api/device/info'),
    /** 当前任务状态：任务名 / 进度 / 是否运行中 */
    getTaskStatus: () => api.get<TaskStatus>('/api/task/status'),
    /** 启动指定任务 */
    startTask: (taskId: string) => api.post<ApiResult>('/api/task/start', { taskId }),
    /** 停止当前任务 */
    stopTask: () => api.post<ApiResult>('/api/task/stop'),
    /** 最近日志（最多 limit 条） */
    getLogs: (limit = 20) => api.get<LogEntry[]>(`/api/logs?limit=${limit}`),
  }
}

export type FastApi = ReturnType<typeof createFastApi>

// ============================================================
// 占位数据结构（与假想接口返回对应，拿到真实文档后按需调整）
// ============================================================

export interface DeviceInfo {
  model?: string
  serial?: string
  firmware?: string
  uptime?: number
}

export interface TaskStatus {
  running?: boolean
  taskId?: string
  taskName?: string
  progress?: number
}

export interface ApiResult {
  success?: boolean
  message?: string
}

export interface LogEntry {
  time?: string
  level?: string
  message?: string
}
