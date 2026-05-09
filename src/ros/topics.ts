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
        /** 原始 28 电机数组，给 3D 视图 & 遥测图表用 */
        motors,
        /** { 关节名: 弧度 }，给 2D 视图用 */
        jointAngles: extractJointAngles(motors),
      }
    },
  },

  // ---- 里程计（暂时关闭，Topic 不存在） ----
  {
    name: '/odom',
    messageType: 'nav_msgs/Odometry',
    enabled: false,
    id: 'odom',
    process: (msg: any) => ({
      timestamp: Date.now() / 1000,
      pose: {
        position: {
          x: msg.pose?.pose?.position?.x ?? 0,
          y: msg.pose?.pose?.position?.y ?? 0,
          z: msg.pose?.pose?.position?.z ?? 0,
        },
        orientation: {
          x: msg.pose?.pose?.orientation?.x ?? 0,
          y: msg.pose?.pose?.orientation?.y ?? 0,
          z: msg.pose?.pose?.orientation?.z ?? 0,
          w: msg.pose?.pose?.orientation?.w ?? 1,
        },
      },
      twist: {
        linear: {
          x: msg.twist?.twist?.linear?.x ?? 0,
          y: msg.twist?.twist?.linear?.y ?? 0,
          z: msg.twist?.twist?.linear?.z ?? 0,
        },
        angular: {
          x: msg.twist?.twist?.angular?.x ?? 0,
          y: msg.twist?.twist?.angular?.y ?? 0,
          z: msg.twist?.twist?.angular?.z ?? 0,
        },
      },
    }),
  },

  // ---- 电池（暂时关闭，Topic 不存在） ----
  {
    name: '/battery',
    messageType: 'sensor_msgs/BatteryState',
    enabled: false,
    id: 'battery',
    process: (msg: any) => ({
      voltage: msg.voltage ?? 0,
      current: msg.current ?? 0,
      percentage: msg.percentage ?? 0,
      temperature: msg.temperature ?? 0,
    }),
  },
]
