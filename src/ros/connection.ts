/**
 * ============================================================
 * ROS 连接管理 —— 整个 App 共用这一个连接实例
 * ============================================================
 *
 * 工作原理：
 *   roslib 通过 WebSocket 连接 rosbridge_server（通常跑在机器人上或仿真环境里），
 *   连接上之后就可以订阅 Topic、发布 Topic、调用 Service 等等。
 *
 * 前置条件（你的机器上需要先配好）：
 *   1. ROS Master / rosbridge_server 已启动
 *   2. 知道 rosbridge 的 WebSocket 地址，一般是 ws://<IP>:9090
 *
 * 怎么改地址：
 *   - 改下面 DEFAULT_URL 常量的值
 *   - 或者在代码里调用 connect(url) 动态传入
 *
 * 怎么用（见末尾的 useRos 函数）：
 *   import { useRos } from '@/ros'
 *   const ros = useRos()
 *   ros.subscribe('/odom', 'nav_msgs/Odometry', (msg) => { ... })
 */

import * as ROSLIB from 'roslib'
import { ref } from 'vue'

// ============================================================
// 1. 配置（改成你自己的机器人地址 & 端口）
// ============================================================

/** rosbridge WebSocket 默认地址 */
const DEFAULT_URL = 'ws://localhost:9090'

// ============================================================
// 2. 连接状态（响应式，方便在界面上显示）
// ============================================================

/** 是否已连接 */
const connected = ref(false)

/** 当前连接状态文字说明，比如 "已连接" / "连接失败" / "连接中..." */
const statusText = ref('未连接')

/** 最后发生的错误信息 */
const lastError = ref<string | null>(null)

// ============================================================
// 3. 内部变量
// ============================================================

let ros: ROSLIB.Ros | null = null

/** 已订阅的 topic 列表，方便 disconnect 时统一清理 */
const topics: ROSLIB.Topic[] = []

// ============================================================
// 4. 连接 & 断开
// ============================================================

export interface ConnectCallbacks {
  onSuccess?: () => void
  onError?: (message: string) => void
  onClose?: () => void
}

/** 连接超时（毫秒） */
const CONNECT_TIMEOUT = 8000

/** 连接到 ROS */
export function connect(url: string = DEFAULT_URL, callbacks?: ConnectCallbacks): void {
  // 如果已经有连接了，先断开
  if (ros) {
    disconnect()
  }

  statusText.value = '连接中...'
  lastError.value = null

  ros = new ROSLIB.Ros({ url })
  console.log(`[ROS] 正在连接 ${url} ...`)

  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    clearTimeout(timer)
  }

  // --- 连接超时 ---
  const timer = setTimeout(() => {
    if (cleanedUp) return
    cleanedUp = true
    statusText.value = '连接超时'
    lastError.value = '连接超时，请检查机器人是否在线'
    console.warn('[ROS] ⏰ 连接超时')
    ros?.close()
    ros = null
    callbacks?.onError?.('连接超时，请检查机器人是否在线')
  }, CONNECT_TIMEOUT)

  // --- 连接成功 ---
  ros.on('connection', () => {
    cleanup()
    connected.value = true
    statusText.value = `已连接 → ${url}`
    console.log('[ROS] ✅ 连接成功')
    callbacks?.onSuccess?.()
  })

  // --- 连接关闭 ---
  ros.on('close', () => {
    cleanup()
    connected.value = false
    statusText.value = '连接已关闭'
    console.log('[ROS] ⚠️ 连接已关闭')
    callbacks?.onClose?.()
  })

  // --- 连接出错 ---
  ros.on('error', (err: unknown) => {
    cleanup()
    connected.value = false
    statusText.value = '连接失败'
    const msg = err instanceof Error ? err.message : String(err)
    lastError.value = msg
    console.error('[ROS] ❌ 连接错误:', err)
    callbacks?.onError?.(msg)
  })
}

/** 断开 ROS 连接 */
export function disconnect(): void {
  topics.forEach((t) => t.unsubscribe())
  topics.length = 0

  if (ros) {
    ros.close()
    ros = null
  }

  connected.value = false
  statusText.value = '未连接'
  console.log('[ROS] 已断开连接')
}

/** 获取当前 ROS 实例（供需要直接使用 ros 实例的场合） */
export function getRos(): ROSLIB.Ros | null {
  return ros
}

// ============================================================
// 5. 核心操作 —— 订阅 Topic
// ============================================================

/**
 * 订阅一个 ROS Topic
 *
 * @param topicName   - 要订阅的 topic 名称，如 '/odom'、'/cmd_vel'
 * @param messageType - ROS 消息类型。传空字符串 '' 表示不限制类型（rosbridge 原样转发）
 * @param callback    - 收到消息时回调，msg 是解析好的 JS 对象
 * @param throttleRate - 可选，rosbridge 端限流（msg/s），降低机器⼈侧 CPU 开销
 */
export function subscribe(
  topicName: string,
  messageType: string,
  callback: (msg: any) => void,
  throttleRate?: number
): void {
  if (!ros) {
    console.warn('[ROS] 尚未连接，无法订阅', topicName)
    return
  }

  const topic = new ROSLIB.Topic({
    ros: ros,
    name: topicName,
    messageType: messageType,
    throttle_rate: throttleRate,
  })

  topic.subscribe(callback)
  topics.push(topic)
  console.log(`[ROS] 已订阅 ${topicName} ${messageType ? '(' + messageType + ')' : '(any type)'}`)
}

// ============================================================
// 6. 发布消息到 Topic
// ============================================================

/**
 * 发布消息到 ROS Topic
 *
 * 示例（发布一个简单的 Twist 控制指令）：
 *   const msg = { linear: { x: 0.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.1 } }
 *   publish('/cmd_vel', 'geometry_msgs/Twist', msg)
 */
export function publish(
  topicName: string,
  messageType: string,
  msg: object
): void {
  if (!ros) {
    console.warn('[ROS] 尚未连接，无法发布')
    return
  }

  const topic = new ROSLIB.Topic({
    ros: ros,
    name: topicName,
    messageType: messageType,
  })

  topic.publish(msg)
  console.log(`[ROS] 已发布 ${topicName}`, msg)
}

// ============================================================
// 7. 调用 Service
// ============================================================

/**
 * 调用 ROS Service
 *
 * 示例（触发急停）：
 *   callService('/g1/trigger_estop', 'std_srvs/srv/Trigger', {})
 *     .then(res => console.log(res))
 *
 * @param serviceName  - Service 名称，如 '/g1/trigger_estop'
 * @param serviceType  - Service 类型，如 'std_srvs/srv/Trigger'
 * @param request      - 请求参数对象
 * @returns             Promise，resolve 为响应数据
 */
export function callService(
  serviceName: string,
  serviceType: string,
  request: object = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ros) {
      reject(new Error('[ROS] 尚未连接'))
      return
    }

    const service = new ROSLIB.Service({
      ros,
      name: serviceName,
      serviceType,
    })

    service.callService(request, (result: any) => {
      resolve(result)
    }, (error: any) => {
      console.error(`[ROS] Service ${serviceName} 失败:`, error)
      reject(error)
    })
  })
}

// ============================================================
// 7. 获取连接状态（在 .vue 里用）
// ============================================================

/** 获取当前连接相关的响应式状态 */
export function useRosStatus() {
  return { connected, statusText, lastError }
}
