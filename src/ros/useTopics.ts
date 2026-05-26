/**
 * ============================================================
 * useTopics —— 声明式 Topic 订阅 composable
 * ============================================================
 *
 * 根据 src/ros/topics.ts 的配置自动订阅所有 enabled: true 的 Topic，
 * 并把处理后的数据存入一个响应式 store。
 *
 * 用法（在 App.vue 或任何组件里）：
 *   import { useTopics } from '@/ros/useTopics'
 *   const { data, subscribeAll } = useTopics()
 *   // data.motorState  = /lowstate 处理后的 { motors, jointAngles }
 *   // data.odom        = /odom 处理后的 { pose, twist }
 *   // data.battery     = /battery 处理后的 { voltage, ... }
 *
 * 新增 Topic 不需要改这个文件，只改 topics.ts 即可。
 */

import { reactive } from 'vue'
import { subscribe } from './connection'
import { TOPICS } from './topics'

// ============================================================
// 响应式数据存储（key = TopicConfig.id）
// ============================================================

/** 存储所有 topic 的最新数据，key 是 TopicConfig.id */
export const topicData = reactive<Record<string, any>>({})

/** 是否已订阅（防止重复订阅） */
let subscribed = false

/** 节流时间戳 Map，key = TopicConfig.id */
const lastProcessTime = new Map<string, number>()

// ============================================================
// composable
// ============================================================

export function useTopics() {
  /**
   * 订阅所有 enabled: true 的 Topic
   * 应在 ROS 连接成功后调用
   */
  function subscribeAll(): void {
    // 防止重复调用
    if (subscribed) {
      console.warn('[useTopics] 已经订阅过，跳过重复订阅')
      return
    }
    subscribed = true

    const enabled = TOPICS.filter(t => t.enabled)
    if (enabled.length === 0) {
      console.log('[useTopics] 没有启用的 Topic，跳过订阅')
      return
    }

    console.log(`[useTopics] 即将订阅 ${enabled.length} 个 Topic:`)
    for (const t of enabled) {
      console.log(`  - ${t.name} (${t.messageType})`)
    }

    for (const config of enabled) {
      subscribe(config.name, config.messageType, (msg: any) => {
        // 节流：高频 topic 限制处理频率
        if (config.throttleMs && config.throttleMs > 0) {
          const now = Date.now()
          const last = lastProcessTime.get(config.id) || 0
          if (now - last < config.throttleMs) return
          lastProcessTime.set(config.id, now)
        }

        try {
          topicData[config.id] = config.process(msg)
        } catch (e) {
          console.error(`[useTopics] 处理 ${config.name} 消息出错:`, e)
        }
      }, config.throttle_rate)
    }
  }

  /** 重置订阅状态（断线重连时调用） */
  function resetSubscribed(): void {
    subscribed = false
  }

  return {
    /** 订阅所有启用的 Topic */
    subscribeAll,
    /** 重置订阅状态，供断开连接时调用 */
    resetSubscribed,
  }
}
