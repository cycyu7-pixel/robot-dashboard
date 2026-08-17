/**
 * useSportService -- 运动服务 FSM 模式查询与切换
 *
 * 通过 /api/sport/request、/api/sport/response 两个 topic 与机器人运控服务通信：
 *   - 查询当前 FSM ID（GET_FSM_ID = 7001）
 *   - 切换 FSM 模式（SET_FSM_ID = 7101）
 *
 * 模式菜单打开时会自动查询一次当前模式。
 * profile 为 Ref，仅 enableControl=true 的型号才在连接后初始化。
 */

import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import * as ROSLIB from 'roslib'
import { getRos, useRosStatus } from '@/ros'
import { FSM_MODE_MAP, FSM_IDS } from '@/ros/topics'
import { showToast } from '@/components/Toast/toast'
import type { RobotProfile } from '@/models'

const API_IDS = {
  GET_FSM_ID: 7001,
  SET_FSM_ID: 7101,
}

export function useSportService(profile: Ref<RobotProfile>) {
  const { connected } = useRosStatus()

  /** 运动服务 FSM ID（来自 API 响应） */
  const sportFsmId = ref(0)

  /** FSM ID -> 中文名 */
  const currentModeLabel = computed(() => {
    return FSM_MODE_MAP[sportFsmId.value] ?? `模式${sportFsmId.value}`
  })

  /** 可选模式列表 */
  const robotModes = FSM_IDS

  /** 模式菜单是否打开 */
  const modeMenuOpen = ref(false)

  let requestTopic: ROSLIB.Topic | null = null
  let responseTopic: ROSLIB.Topic | null = null

  function initSportService(): void {
    const reqTopic = profile.value.ros.sportRequestTopic
    const resTopic = profile.value.ros.sportResponseTopic
    if (!reqTopic || !resTopic) return
    const ros = getRos()
    if (!ros) return

    requestTopic = new ROSLIB.Topic({
      ros,
      name: reqTopic,
      messageType: 'unitree_api/msg/Request',
    })

    responseTopic = new ROSLIB.Topic({
      ros,
      name: resTopic,
      messageType: 'unitree_api/msg/Response',
    })

    responseTopic.subscribe((msg: any) => {
      for (const key of ['data', 'datas', 'parameter']) {
        const val = msg?.[key]
        if (val !== undefined && val !== null) {
          if (typeof val === 'string') {
            try {
              const parsed = JSON.parse(val)
              if (parsed?.data !== undefined) sportFsmId.value = Number(parsed.data)
            } catch {}
          } else if (typeof val === 'number') {
            sportFsmId.value = val
          } else if (typeof val === 'object' && val?.data !== undefined) {
            sportFsmId.value = Number(val.data)
          }
        }
      }
    })
  }

  function sendRequest(request: object): void {
    if (!requestTopic) return
    requestTopic.publish(request)
  }

  function queryFsmId(): void {
    sendRequest({
      header: { identity: { api_id: API_IDS.GET_FSM_ID } },
    })
  }

  function handleModeSelect(mode: typeof robotModes[0]): void {
    modeMenuOpen.value = false
    showToast(`切换至「${mode.label}」模式`, 'info')
    sendRequest({
      header: { identity: { api_id: API_IDS.SET_FSM_ID } },
      parameter: JSON.stringify({ data: mode.id }),
    })
    setTimeout(() => queryFsmId(), 1000)
  }

  /** 点击菜单外部时关闭菜单 */
  function handleDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement
    if (!target.closest('.mode-switch')) {
      modeMenuOpen.value = false
    }
  }

  watch(modeMenuOpen, (val) => {
    if (val) {
      document.addEventListener('click', handleDocClick)
      queryFsmId()
    } else {
      document.removeEventListener('click', handleDocClick)
    }
  })

  // 连接后初始化运动服务 & 查询当前模式（仅支持控制的型号）
  watch(connected, (val) => {
    if (!profile.value.enableControl) return
    if (val) {
      initSportService()
      queryFsmId()
    }
  })

  return {
    sportFsmId,
    currentModeLabel,
    robotModes,
    modeMenuOpen,
    handleModeSelect,
  }
}
