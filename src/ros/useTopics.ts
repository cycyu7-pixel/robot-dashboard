/**
 * useTopics -- 实时数据存储
 *
 * /lowstate 帧由 src/api/lowstate.ts（FastAPI 数据源）写入，
 * 这里只负责提供响应式 store 与清空工具。
 * 2D 视图 / 遥测 / 告警统一从 topicData.motorState 读取，与传输方式无关。
 *
 * 用法（在 App.vue 里）：
 *   const { clearTopicData } = useTopics()
 *   clearTopicData()  // 断开连接时清空
 *   // topicData.motorState.motors = /lowstate 最新电机数组
 */

import { reactive } from 'vue'

// ============================================================
// 响应式数据存储（key 目前固定为 'motorState'）
// ============================================================

/** 存储所有实时数据的最新值，key 是数据源写入的键名（当前只有 motorState） */
export const topicData = reactive<Record<string, any>>({})

// ============================================================
// composable
// ============================================================

export function useTopics() {
  /** 清空所有实时数据（断开连接时调用） */
  function clearTopicData(): void {
    for (const key of Object.keys(topicData)) {
      delete topicData[key]
    }
  }

  return {
    /** 清空所有 topic 数据，供断开连接时调用 */
    clearTopicData,
  }
}
