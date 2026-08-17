/**
 * ============================================================
 * Topic 声明式配置
 * ============================================================
 *
 * /lowstate 的订阅配置由 buildLowstateConfig(profile) 按型号动态构建。
 * process 只提取原始 motor_state 数组，关节名/顺序映射由各组件按 profile 自行处理。
 */

import type { RobotProfile } from '@/models'

/** FSM ID -> 模式名映射（宇树 G1） */
export const FSM_MODE_MAP: Record<number, string> = {
  0: '零力矩',
  1: '阻尼模式',
  2: '下蹲',
  3: '坐姿',
  4: '预备模式',
  5: '平衡站立',
  501: '常规运控',
  706: '平衡下蹲、蹲起',
  702: '躺起',
  802: '走跑模式',
}

export const FSM_IDS = Object.entries(FSM_MODE_MAP).map(([id, label]) => ({
  id: Number(id),
  label,
}))

// ============================================================
// 单个 Topic 配置
// ============================================================

export interface TopicConfig {
  /** ROS Topic 名称，如 '/lowstate' */
  name: string
  /** ROS 消息类型，如 'unitree_hg/msg/LowState' */
  messageType: string
  /** 是否启用：连接 ROS 后自动订阅 */
  enabled: boolean
  /** 数据在 dataStore 里的键名（全局唯一），页面通过 dataStore[id] 取值 */
  id: string
  /** 把原始 ROS 消息转为业务对象，返回的数据会存入 dataStore[id] */
  process: (msg: any) => any
  /** 节流：限制处理频率，单位 ms（如 50 = 20fps），高频 topic 用 */
  throttleMs?: number
  /** rosbridge 端限流（msg/s），降低机器人侧 CPU */
  throttle_rate?: number
}

/**
 * 根据型号构建 /lowstate 订阅配置
 * process 只提取原始 motor_state 数组，关节名映射由消费侧按 profile 处理
 * 读取频率由 profile.lowstateRate 控制（rosbridge 端与前端同为该频率）
 */
export function buildLowstateConfig(profile: RobotProfile): TopicConfig {
  const intervalMs = Math.round(1000 / profile.lowstateRate)
  return {
    name: profile.ros.lowstateTopic,
    messageType: profile.ros.lowstateMsgType,
    enabled: true,
    id: 'motorState',
    process: (msg: any) => ({
      motors: msg.motor_state ?? msg.motorState ?? [],
    }),
    /** 前端处理节流，与读取频率一致 */
    throttleMs: intervalMs,
    /** rosbridge 端限流：消息最小间隔（毫秒） */
    throttle_rate: intervalMs,
  }
}
