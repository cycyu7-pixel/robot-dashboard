/**
 * useTopics -- 声明式 Topic 订阅 composable
 *
 * 连接成功后调用 subscribeAll(profile)，按型号构建 /lowstate 订阅配置，
 * 把处理后的数据存入响应式 store。
 *
 * 用法（在 App.vue 里）：
 *   const { subscribeAll } = useTopics()
 *   subscribeAll(currentProfile)
 *   // topicData.motorState.motors = /lowstate 处理后的电机数组
 */

import { reactive } from 'vue'
import { subscribe } from './connection'
import { buildLowstateConfig } from './topics'
import type { RobotProfile } from '@/models'

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
   * 订阅 /lowstate（按 profile 构建配置）
   * 应在 ROS 连接成功后调用
   */
  function subscribeAll(profile: RobotProfile): void {
    // 防止重复调用
    if (subscribed) {
      console.warn('[useTopics] 已经订阅过，跳过重复订阅')
      return
    }
    subscribed = true

    const config = buildLowstateConfig(profile)
    if (!config.enabled) return

    console.log(`[useTopics] 即将订阅 ${config.name} (${config.messageType})`)

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

  /** 重置订阅状态（断线重连时调用） */
  function resetSubscribed(): void {
    subscribed = false
  }

  /** 清空所有 topic 数据（断开连接时调用） */
  function clearTopicData(): void {
    for (const key of Object.keys(topicData)) {
      delete topicData[key]
    }
  }

  return {
    /** 订阅 /lowstate（按 profile） */
    subscribeAll,
    /** 重置订阅状态，供断开连接时调用 */
    resetSubscribed,
    /** 清空所有 topic 数据，供断开连接时调用 */
    clearTopicData,
  }
}
