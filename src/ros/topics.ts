/**
 * ============================================================
 * Topic 声明式配置
 * ============================================================
 *
 * 新增订阅只需要在这里加一项，不用改 App.vue 或其他文件。
 *
 * 使用方法：
 *   1. 在 TOPICS 数组里加一个 TopicConfig 对象
 *   2. enabled: true 表示连接后自动订阅
 *   3. process 函数负责把 ROS 原始消息转成页面需要的业务数据
 *   4. 在页面里通过 dataStore[id] 拿到处理后的数据
 *
 * 示例：新增一个 /imu 话题
 *   {
 *     name: '/imu',
 *     messageType: 'sensor_msgs/Imu',
 *     enabled: true,
 *     id: 'imu',
 *     process: (msg: any) => ({
 *       accelX: msg.linear_acceleration?.x ?? 0,
 *     }),
 *   },
 */

import { extractJointAngles } from '@/models'

/** FSM ID → 模式名映射（宇树 G1） */
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
  /** ROS 消息类型，如 'unitree_hg/msg/LowState'，空字符串表示不限制 */
  messageType: string
  /** 是否启用：连接 ROS 后自动订阅 */
  enabled: boolean
  /** 数据在 dataStore 里的键名（全局唯一），页面通过 dataStore[id] 取值 */
  id: string
  /** 把原始 ROS 消息转为业务对象，返回的数据会存入 dataStore[id] */
  process: (msg: any) => any
  /** 节流：限制处理频率，单位 ms（如 50 = 20fps），高频 topic 用 */
  throttleMs?: number
  /** rosbridge 端限流（msg/s），降低机器⼈侧 CPU */
  throttle_rate?: number
}

// ============================================================
// 所有 Topic 配置（新增 Topic 只在这里加）
// ============================================================

export const TOPICS: TopicConfig[] = [
  // ---- G1 电机状态 /lowstate ----
  {
    name: '/lowstate',
    messageType: 'unitree_hg/msg/LowState',
    enabled: true,
    id: 'motorState',
    process: (msg: any) => {
      const motors: any[] = msg.motor_state ?? msg.motorState ?? []
      return {
        motors,
        /** { 关节名: 弧度 }，给 2D 视图用 */
        jointAngles: extractJointAngles(motors),
        /** 当前运控模式 FSM ID */
        modeMachine: msg.mode_machine ?? 0,
        /** 主运控模式 FSM ID */
        modePr: msg.mode_pr ?? 0,
      }
    },
    /** 50ms 节流 = 20fps，避免高频 lowstate 撑爆页面 */
    throttleMs: 50,
    /** rosbridge 端限流 20 msg/s，减少机器⼈侧序列化开销 */
    throttle_rate: 20,
  },
]
