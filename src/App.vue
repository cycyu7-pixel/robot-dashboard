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
import { ref, computed, onBeforeUnmount } from 'vue'
import RobotView3D from '@/components/RobotView3D/RobotView3D.vue'
import Telemetry from '@/components/Telemetry/Telemetry.vue'
import { connect, disconnect, useRosStatus } from '@/ros'
import { useTopics, topicData } from '@/ros/useTopics'
import { G1_JOINT_MAPPING } from '@/models'
import ToastContainer from '@/components/Toast/ToastContainer.vue'
import { showToast } from '@/components/Toast/toast'

// ============================================================
// 1. 连接配置（用户可在页面上修改）
// ============================================================

const rosIp = ref('192.168.123.164')
const rosPort = ref('9090')

/** rosbridge WebSocket 地址，由 IP + 端口拼接 */
const rosUrl = computed(() => `ws://${rosIp.value}:${rosPort.value}`)

// ============================================================
// 2. ROS 状态 & 数据
// ============================================================

const { connected, statusText, lastError } = useRosStatus()

/** 声明式订阅（Topic 配置见 src/ros/topics.ts） */
const { subscribeAll } = useTopics()

// 2D 视图容器尺寸
const viewWidth = ref(440)
const viewHeight = ref(620)

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
  // 清空 topicData 中所有 key
  for (const key of Object.keys(topicData)) {
    delete topicData[key]
  }
}

// ============================================================
// 4. 清理
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
      <h1 class="title">🤖 宇树 G1 仪表盘</h1>

      <div class="status-area">
        <!-- 连接状态指示灯 -->
        <span class="status-dot" :class="{ on: connected }"></span>
        <span class="status-text">{{ statusText }}</span>
        <span v-if="lastError" class="error-text">（{{ lastError }}）</span>

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
        <RobotView3D
          :motor-state="topicData.motorState?.motors"
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
      <span v-if="topicData.odom">
        线速度: {{ topicData.odom.twist.linear.x.toFixed(3) }} m/s
        &nbsp;|&nbsp;
        角速度: {{ topicData.odom.twist.angular.z.toFixed(3) }} rad/s
      </span>
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
