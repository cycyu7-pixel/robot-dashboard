/**
 * ============================================================
 * App.vue —— 宇树 G1 机器人仪表盘主页面
 * ============================================================
 *
 * 布局：左 3D 人形机器人视图 | 右侧遥测图表
 *
 * 怎么启动：
 *   1. 确保 rosbridge 已运行
 *   2. npm run dev
 *   3. 输入 IP 和端口，点「连接 ROS」
 *
 * 改 ROS 地址：页面上直接输入
 * 改订阅 Topic：去 src/ros/topics.ts 的 TOPICS 数组加/改配置
 * 改关节映射：去 src/models/robot.ts 的 G1_JOINT_MAPPING 表
 */
<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import * as ROSLIB from 'roslib'
import RobotDiagram2D from '@/components/RobotDiagram2D/RobotDiagram2D.vue'
import Telemetry from '@/components/Telemetry/Telemetry.vue'
import { connect, disconnect, useRosStatus, callService, getRos } from '@/ros'
import { useTopics, topicData } from '@/ros/useTopics'
import { G1_JOINT_MAPPING, G1_MOTOR_JOINTS, G1_MOTOR_DISPLAY_NAMES } from '@/models'
import { FSM_MODE_MAP, FSM_IDS } from '@/ros/topics'
import ToastContainer from '@/components/Toast/ToastContainer.vue'
import { showToast } from '@/components/Toast/toast'

// ============================================================
// 1. 连接配置（用户可在页面上修改）
// ============================================================

const rosIp = ref('192.168.123.99')
const rosPort = ref('9090')

/** rosbridge WebSocket 地址，由 IP + 端口拼接 */
const rosUrl = computed(() => `ws://${rosIp.value}:${rosPort.value}`)

// ============================================================
// 2. ROS 状态 & 数据
// ============================================================

const { connected, statusText, lastError } = useRosStatus()

/** 电机报警温度（℃），用户可调 */
const alarmTemp = ref(70)

/** 声明式订阅（Topic 配置见 src/ros/topics.ts） */
const { subscribeAll, resetSubscribed } = useTopics()

// 2D 视图容器尺寸
const viewWidth = 500
const viewHeight = 700

// ============================================================
// 3. 按钮操作
// ============================================================

/** 连接 ROS 并在连上后自动订阅所有启用的 Topic */
function handleConnect(): void {
  connect(rosUrl.value, {
    onSuccess: () => {
      showToast('机器人连接成功', 'success')
      // 等 rosbridge 就绪后批量订阅
      setTimeout(() => {
        subscribeAll()
      }, 500)
    },
    onError: (msg) => {
      showToast(`连接失败：${msg}`, 'error')
    },
    onClose: () => {
      showToast('连接已断开', 'info')
    },
  })
}

/** 断开连接，清空所有 topic 数据 */
function handleDisconnect(): void {
  disconnect()
  resetSubscribed()
  // 清空 topicData 中所有 key
  for (const key of Object.keys(topicData)) {
    delete topicData[key]
  }
}

// ============================================================
// 4. 急停控制
// ============================================================


/** 急停状态 */
const estopActive = ref(false)
/** 急停轮询定时器 */
let estopTimer: ReturnType<typeof setInterval> | null = null

/** 触发急停 */
async function handleEStop(): Promise<void> {
  try {
    await callService('/g1/trigger_estop', 'std_srvs/srv/Trigger', {})
    showToast('急停已触发，机器人进入阻尼模式', 'error', 8000)
  } catch (e: any) {
    showToast(`急停失败：${e.message}`, 'error')
  }
}

/** 查询急停状态 */
async function handleQueryEStop(): Promise<void> {
  try {
    const res = await callService('/g1_emergency_stop_node/query_estop_state', 'std_srvs/srv/Trigger', {})
    estopActive.value = res.estop_active === true || res.estop_active === 'true'
  } catch (e: any) {
    console.warn('[急停] 查询失败:', e.message)
  }
}

// ============================================================
// 5. 模式切换 & 运动服务（unitree_api/msg/Request）
// ============================================================

/** FSM ID → 中文名 */
const currentModeLabel = computed(() => {
  return FSM_MODE_MAP[sportFsmId.value] ?? `模式${sportFsmId.value}`
})

/** 运动服务 FSM ID（来自 API 响应） */
const sportFsmId = ref(0)

/** 可选模式列表 */
const robotModes = FSM_IDS

/** 模式菜单是否打开 */
const modeMenuOpen = ref(false)

const API_IDS = {
  GET_FSM_ID: 7001,
  SET_FSM_ID: 7101,
}

let requestTopic: ROSLIB.Topic | null = null
let responseTopic: ROSLIB.Topic | null = null

function initSportService(): void {
  const ros = getRos()
  if (!ros) return

  requestTopic = new ROSLIB.Topic({
    ros,
    name: '/api/sport/request',
    messageType: 'unitree_api/msg/Request',
  })

  responseTopic = new ROSLIB.Topic({
    ros,
    name: '/api/sport/response',
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

// 连接后初始化运动服务 & 查询当前模式
watch(connected, (val) => {
  if (val) {
    handleQueryEStop()
    estopTimer = setInterval(handleQueryEStop, 3000)
    initSportService()
    queryFsmId()
  } else if (estopTimer) {
    clearInterval(estopTimer)
    estopTimer = null
    estopActive.value = false
  }
})

// ============================================================
// 6. 温度告警 toast
// ============================================================

/** 已触发过告警的关节（去重，温度回落自动清除） */
const alertedJoints = new Set<string>()

watch(() => topicData.motorState?.motors, (motors) => {
  if (!motors || motors.length === 0) return
  const threshold = alarmTemp.value
  for (let i = 0; i < Math.min(motors.length, G1_MOTOR_JOINTS.length); i++) {
    const m = motors[i]
    if (m.mode !== 0 && m.mode !== 1) continue
    const temp = m.temperature?.[0] ?? 0
    const name = G1_MOTOR_JOINTS[i]
    const display = G1_MOTOR_DISPLAY_NAMES[i] ?? name
    if (temp > threshold && !alertedJoints.has(name)) {
      alertedJoints.add(name)
      showToast(`${display} 电机过热: ${temp.toFixed(1)}°C`, 'error', 6000)
    }
    if (temp <= threshold) {
      alertedJoints.delete(name)
    }
  }
}, { deep: false })

// ============================================================
// 7. 清理
// ============================================================

onBeforeUnmount(() => {
  if (estopTimer) clearInterval(estopTimer)
  disconnect()
})

// 调试：浏览器控制台可直接访问 __topicData
;(window as any).__topicData = topicData
</script>

<template>
  <div class="app-root">
    <ToastContainer />
    <!-- ===== 顶部导航栏 ===== -->
    <header class="topbar">
      <h1 class="title">🤖 unitree-G1-dashboard</h1>

      <div class="status-area">
        <!-- 报警温度 -->
        <span v-if="!connected" class="alarm-label">报警:</span>
        <input
          v-if="!connected"
          v-model.number="alarmTemp"
          class="input-alarm"
          placeholder="温度℃"
          title="电机温度超过此值弹出告警"
        />

        <!-- 连接状态指示灯 -->
        <span class="status-dot" :class="{ on: connected }"></span>
        <span class="status-text">{{ statusText }}</span>
        <span v-if="lastError" class="error-text">（{{ lastError }}）</span>

        <!-- 模式切换（仅连接后可用） -->
        <div v-if="connected" class="mode-switch">
          <button class="btn-mode" @click.stop="modeMenuOpen = !modeMenuOpen" title="切换机器人模式">
            <span class="mode-indicator" :class="'mode-' + sportFsmId"></span>
            {{ currentModeLabel }}
            <span class="mode-arrow">▾</span>
          </button>
          <Transition name="dropdown">
            <ul v-if="modeMenuOpen" class="mode-menu">
              <li
                v-for="m in robotModes"
                :key="m.id"
                class="mode-menu-item"
                :class="{ active: m.id === sportFsmId }"
                @click="handleModeSelect(m)"
              >
                <span class="mode-indicator" :class="'mode-' + m.id"></span>
                {{ m.label }}
              </li>
            </ul>
          </Transition>
        </div>

        <!-- 急停按钮（仅连接后可用） -->
        <button
          v-if="connected"
          class="btn-estop"
          :class="{ active: estopActive }"
          @click="handleEStop"
          title="紧急停止机器人"
        >
          {{ estopActive ? '⚠ 急停中' : '急停' }}
        </button>

        <!-- IP 和端口输入 -->
        <input
          v-if="!connected"
          v-model="rosIp"
          class="input-ip"
          placeholder="IP 地址"
          title="机器人 IP 地址"
        />
        <input
          v-if="!connected"
          v-model="rosPort"
          class="input-port"
          placeholder="端口"
          title="rosbridge 端口"
        />

        <!-- 连接 / 断开按钮 -->
        <button
          v-if="!connected"
          class="btn btn-connect"
          @click="handleConnect"
        >
          连接 ROS
        </button>
        <button v-else class="btn btn-disconnect" @click="handleDisconnect">
          断开连接
        </button>
      </div>
    </header>

    <!-- ===== 主体：左 3D 视图 + 右图表 ===== -->
    <main class="main">
      <section class="left-panel">
        <RobotDiagram2D
          :motor-state="topicData.motorState?.motors"
          :alarm-temp="alarmTemp"
          :width="viewWidth"
          :height="viewHeight"
        />
      </section>

      <aside class="right-panel">
        <Telemetry :motor-state="topicData.motorState?.motors" />
      </aside>
    </main>

    <!-- ===== 底部状态栏 ===== -->
    <footer class="bottombar">
      <span>ROS: {{ rosUrl }}</span>
      <span>电机: {{ Object.keys(topicData.motorState?.jointAngles ?? {}).length }} | 2D 关节: {{ G1_JOINT_MAPPING.length }}</span>
    </footer>
  </div>
</template>

<style scoped>
/* ---------- 整体布局 ---------- */
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f0f23;
  color: #ecf0f1;
  font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
}

/* ---------- 顶栏 ---------- */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: #16213e;
  border-bottom: 1px solid #2c3e50;
}

.title {
  margin: 0;
  font-size: 20px;
}

.status-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e74c3c;
  transition: background 0.3s;
}

.status-dot.on {
  background: #2ecc71;
  box-shadow: 0 0 8px #2ecc71;
}

.status-text {
  font-size: 13px;
  color: #bdc3c7;
}

.error-text {
  font-size: 12px;
  color: #e74c3c;
}

.alarm-label {
  font-size: 12px;
  color: #e67e22;
  white-space: nowrap;
}

/* ---------- 按钮 ---------- */
.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.input-ip {
  width: 130px;
  padding: 5px 8px;
  border: 1px solid #3a5070;
  border-radius: 4px;
  background: #0f1a2a;
  color: #ecf0f1;
  font-size: 12px;
}

.input-ip:focus {
  border-color: #3498db;
  outline: none;
}

.input-port {
  width: 60px;
  padding: 5px 8px;
  border: 1px solid #3a5070;
  border-radius: 4px;
  background: #0f1a2a;
  color: #ecf0f1;
  font-size: 12px;
}

.input-port:focus {
  border-color: #3498db;
  outline: none;
}

.input-alarm {
  width: 70px;
  padding: 5px 8px;
  border: 1px solid #e67e22;
  border-radius: 4px;
  background: #0f1a2a;
  color: #e67e22;
  font-size: 12px;
}

.input-alarm:focus {
  border-color: #e67e22;
  outline: none;
}

.btn-connect {
  background: #2ecc71;
  color: #fff;
}

.btn-connect:hover {
  background: #27ae60;
}

.btn-disconnect {
  background: #e74c3c;
  color: #fff;
}

.btn-disconnect:hover {
  background: #c0392b;
}

/* ---------- 模式切换 ---------- */
.mode-switch {
  position: relative;
}

.btn-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 2px solid #3498db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  color: #3498db;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-mode:hover {
  background: #3498db;
  color: #fff;
}

.mode-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.mode-indicator.mode-0 { background: #00d4ff; }
.mode-indicator.mode-1 { background: #e74c3c; }
.mode-indicator.mode-2 { background: #f1c40f; }
.mode-indicator.mode-3 { background: #e67e22; }
.mode-indicator.mode-4 { background: #9b59b6; }
.mode-indicator.mode-5 { background: #2ecc71; }
.mode-indicator.mode-501 { background: #3498db; }
.mode-indicator.mode-706 { background: #1abc9c; }
.mode-indicator.mode-702 { background: #e91e63; }
.mode-indicator.mode-802 { background: #00bcd4; }

.mode-arrow {
  font-size: 10px;
  margin-left: 2px;
}

.mode-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 120px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #1a2a4a;
  border: 1px solid #2c3e50;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.mode-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: #bdc3c7;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-menu-item:hover {
  background: #243456;
  color: #ecf0f1;
}

.mode-menu-item.active {
  color: #3498db;
  font-weight: 600;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ---------- 急停按钮 ---------- */
.btn-estop {
  padding: 6px 18px;
  border: 2px solid #e74c3c;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  background: transparent;
  color: #e74c3c;
  transition: all 0.2s;
  letter-spacing: 1px;
}

.btn-estop:hover {
  background: #e74c3c;
  color: #fff;
}

.btn-estop.active {
  background: #e74c3c;
  color: #fff;
  animation: estop-blink 0.8s ease-in-out infinite alternate;
}

@keyframes estop-blink {
  from { box-shadow: 0 0 4px rgba(231, 76, 60, 0.4); }
  to   { box-shadow: 0 0 16px rgba(231, 76, 60, 0.9); }
}

/* ---------- 主体 ---------- */
.main {
  display: flex;
  flex: 1;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
  justify-content: center;
}

.left-panel {
  flex: 0 0 auto;
}

.right-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}

/* ---------- 底栏 ---------- */
.bottombar {
  display: flex;
  justify-content: space-between;
  padding: 8px 20px;
  background: #16213e;
  border-top: 1px solid #2c3e50;
  font-size: 12px;
  color: #7f8c8d;
}
</style>
