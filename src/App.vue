/**
 * ============================================================
 * App.vue -- 宇树机器人仪表盘主页面（支持 G1 / H2 运行时切换）
 * ============================================================
 *
 * 布局：左 3D 人形机器人视图 | 右侧遥测图表
 *
 * 怎么启动：
 *   1. 确保 rosbridge 已运行
 *   2. npm run dev
 *   3. 选择型号（G1 / H2），输入 IP 和端口，点「连接 ROS」
 *
 * 改 ROS 地址：页面上直接输入
 * 改订阅 Topic：去 src/ros/topics.ts 的 buildLowstateConfig
 * 新增/修改型号：去 src/models/profiles/ 下对应 profile
 * 急停 / 模式切换 / 温度告警：分别见 src/composables/ 下对应 composable
 */
<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import RobotDiagram2D from '@/components/RobotDiagram2D/RobotDiagram2D.vue'
import Telemetry from '@/components/Telemetry/Telemetry.vue'
import ToastContainer from '@/components/Toast/ToastContainer.vue'
import ApiPanel from '@/components/ApiPanel/ApiPanel.vue'
import { showToast } from '@/components/Toast/toast'
import { connect, disconnect, useRosStatus } from '@/ros'
import { useTopics, topicData } from '@/ros/useTopics'
import { ROBOT_PROFILES } from '@/models'
import { useEStop } from '@/composables/useEStop'
import { useSportService } from '@/composables/useSportService'
import { useTempAlarm } from '@/composables/useTempAlarm'

// ============================================================
// 1. 型号选择 & 连接配置（用户可在页面上修改）
// ============================================================

const robotProfiles = ROBOT_PROFILES
const selectedProfileId = ref('g1')
const currentProfile = computed(() =>
  robotProfiles.find(p => p.id === selectedProfileId.value) ?? robotProfiles[0]
)

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
const { subscribeAll, resetSubscribed, clearTopicData } = useTopics()

// 2D 视图容器尺寸
const viewWidth = 500
const viewHeight = 700

// ============================================================
// 3. 业务模块（急停 / 模式切换 / 温度告警）
// ============================================================

const { estopActive, handleEStop } = useEStop(currentProfile)
const { sportFsmId, currentModeLabel, robotModes, modeMenuOpen, handleModeSelect } = useSportService(currentProfile)
useTempAlarm(currentProfile, alarmTemp)

// ============================================================
// 4. 连接 / 断开
// ============================================================

/** 连接 ROS 并在连上后自动订阅所有启用的 Topic */
function handleConnect(): void {
  connect(rosUrl.value, {
    onSuccess: () => {
      showToast(`${currentProfile.value.name} 连接成功`, 'success')
      // 等 rosbridge 就绪后批量订阅
      setTimeout(() => {
        subscribeAll(currentProfile.value)
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
  clearTopicData()
}

// ============================================================
// 5. 清理
// ============================================================

onBeforeUnmount(() => {
  disconnect()
})
</script>

<template>
  <div class="app-root">
    <ToastContainer />
    <!-- ===== 顶部导航栏 ===== -->
    <header class="topbar">
      <h1 class="title">🤖 {{ currentProfile.name }}</h1>

      <div class="status-area">
        <!-- 型号选择（连接前） -->
        <select v-if="!connected" v-model="selectedProfileId" class="input-profile" title="选择机器人型号">
          <option v-for="p in robotProfiles" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>

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

        <!-- 模式切换（仅支持控制的型号 + 连接后） -->
        <div v-if="connected && currentProfile.enableControl" class="mode-switch">
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

        <!-- 急停按钮（仅支持控制的型号 + 连接后） -->
        <button
          v-if="connected && currentProfile.enableControl"
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
          :key="currentProfile.id"
          :profile="currentProfile"
          :motor-state="topicData.motorState?.motors"
          :alarm-temp="alarmTemp"
          :width="viewWidth"
          :height="viewHeight"
        />
      </section>

      <aside class="right-panel">
        <Telemetry :key="currentProfile.id" :profile="currentProfile" :motor-state="topicData.motorState?.motors" />
      </aside>
    </main>

    <!-- ===== 底部状态栏 ===== -->
    <footer class="bottombar">
      <span>ROS: {{ rosUrl }}</span>
      <span>电机: {{ currentProfile.numMotors }} | 型号: {{ currentProfile.name }}</span>
    </footer>

    <!-- ===== 机器人内部 FastAPI 服务悬浮面板（复用已输入的 IP） ===== -->
    <ApiPanel :ip="rosIp" />
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

/* ---------- 输入框 ---------- */
.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.input-profile {
  padding: 5px 8px;
  border: 1px solid #3a5070;
  border-radius: 4px;
  background: #0f1a2a;
  color: #ecf0f1;
  font-size: 12px;
  cursor: pointer;
}

.input-profile:focus {
  border-color: #3498db;
  outline: none;
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
