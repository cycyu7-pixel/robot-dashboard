# 宇树 G1 机器人仪表盘

基于 Vue 3 + TypeScript 的宇树 G1 人形机器人远程监控仪表盘，通过 rosbridge WebSocket 实时获取机器人状态，提供 3D 姿态可视化 + 遥测图表 + 电机温度告警。

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 打开浏览器 http://localhost:5173
# 4. 在顶栏输入机器人 IP 和 rosbridge 端口，点击「连接 ROS」
```

**前置条件**：机器人上需要运行 rosbridge_server：

```bash
ssh unitree@<机器人IP>
cd gb_ros_ws_g1/unitree_ros2
ROSBRIDGE_ADDRESS=0.0.0.0 \
ROSBRIDGE_PORT=9090 \
./scripts/run_rosbridge_server.sh
```

> 如需要开机自启，将 `scripts/rosbridge.service` 复制到机器人 `/etc/systemd/system/` 后执行 `sudo systemctl enable rosbridge`。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 Composition API + TypeScript |
| 构建 | Vite 8 |
| 3D 渲染 | Three.js + urdf-loader（URDF 模型加载） |
| 图表 | ECharts 6 + vue-echarts |
| ROS 通信 | roslib.js → rosbridge WebSocket |

## 项目架构

```
src/
├── App.vue                          # 主页面（连接控制 + 布局）
├── main.ts                          # 入口
├── style.css                        # 全局样式
│
├── ros/                             # ★ ROS 通信层
│   ├── connection.ts                #   WebSocket 连接、订阅、发布
│   ├── topics.ts                    #   ★ Topic 声明式配置（新增 Topic 只改这个）
│   ├── useTopics.ts                 #   声明式订阅执行器
│   └── index.ts                     #   统一导出
│
├── models/                          # 数据模型 & 常量
│   ├── robot.ts                     #   类型定义 + G1 关节映射 + 校准表
│   └── index.ts                     #   统一导出
│
├── components/
│   ├── RobotView3D/                 # 3D URDF 机器人视图
│   │   └── RobotView3D.vue          #   Three.js 渲染 + 关节驱动 + 鼠标交互
│   ├── RobotView/                   # 2D 火柴人视图（静态，仅标签）
│   │   └── RobotView.vue
│   ├── Telemetry/                   # 遥测图表
│   │   └── Telemetry.vue            #   关节角度、力矩、电压图表 + 温度监控
│   ├── Toast/                       # Toast 通知
│   │   ├── toast.ts                 #   showToast() composable
│   │   └── ToastContainer.vue       #   通知容器组件
│   └── Widgets/
│       └── ChartCard.vue            # 图表卡片包装器（深色主题）
│
└── urdf/                            # G1 URDF 模型 & STL 网格
    ├── g1_29dof_rev_1_0_with_inspire_hand_FTP.urdf
    └── meshes/                      # 89 个 STL 网格文件
```

### 数据流

```
机器人 /lowstate ──ROS2──▶ rosbridge_server ──WebSocket──▶ roslib.js
                                                              │
                                              ┌───────────────┘
                                              ▼
                                    src/ros/connection.ts
                                    subscribe(topic, type, cb)
                                              │
                                              ▼
                                    src/ros/topics.ts
                                    process(msg) → 业务数据
                                              │
                                              ▼
                                    topicData (reactive)
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                      RobotView3D.vue   Telemetry.vue    App.vue (footer)
                       (3D 关节驱动)    (ECharts 图表)    (状态栏)
```

## 如何新增 Topic 订阅

只需要改 **一个文件**：[src/ros/topics.ts](src/ros/topics.ts)。

在 `TOPICS` 数组里加一项配置：

```ts
{
  name: '/imu',                    // ROS Topic 名称
  messageType: 'sensor_msgs/Imu',  // ROS 消息类型
  enabled: true,                   // true = 连接后自动订阅
  id: 'imu',                       // 数据 key，页面用 topicData.imu 取值
  process: (msg: any) => ({        // 原始 ROS 消息 → 业务数据
    accelX: msg.linear_acceleration?.x ?? 0,
    gyroZ: msg.angular_velocity?.z ?? 0,
  }),
},
```

然后在任意 `.vue` 组件中读取数据：

```ts
import { topicData } from '@/ros/useTopics'

// topicData.imu.accelX  —— 响应式，数据到达时自动更新
```

**不需要修改 App.vue**，不需要写 `subscribe()` 调用。

## 3D 机器人 & 关节校准

### 坐标转换

ROS 坐标系是 Z-up，Three.js 是 Y-up。URDF 模型加载后做了 90° 旋转：

```ts
robot.rotation.set(-Math.PI / 2, 0, 0)  // Z-up → Y-up
```

### 关节映射

两个映射表在 [src/models/robot.ts](src/models/robot.ts)：

| 常量 | 作用 |
|------|------|
| `G1_MOTOR_JOINTS` | 电机 index → ROS 关节名（28 个，按 /lowstate 输出顺序） |
| `G1_MOTOR_TO_URDF_JOINT` | 电机 index → URDF 关节名（加 `_joint` 后缀，按关节名对应） |
| `G1_MOTOR_DISPLAY_NAMES` | 电机 index → 中文显示名 |
| `G1_MOTOR_CALIBRATION` | 电机 index → 校准参数（offset + invert） |

**验证方法**：手推机器人某一个关节，查看 `lowstate-data.json` 里哪个 index 的 `q` 值变了，对照调整上表。

### 姿态基准校准（C / R 键）

电机编码器零位和 URDF 模型零位不同，所以需要校准。

| 操作 | 按键 | 效果 |
|------|------|------|
| 采集基准 | **C** | 把当前姿态录为基准，3D 模型立即归零对齐 |
| 清除校准 | **R** | 恢复原始 q 值 |

**使用流程**：
1. 让机器人站在你想要的参考姿态（如手臂下垂站立）
2. 在网页上按 **C 键** → 控制台输出 `[calibrate] 已采集基准姿态`
3. 之后机器人的运动以此为基准在 3D 模型上展示
4. 如果某个关节方向反了，在控制台调：

```js
G1_MOTOR_CALIBRATION[18].invert = true   // 翻转第 18 号电机方向
G1_MOTOR_CALIBRATION[9].offset = 0.5     // 调整第 9 号电机偏移
```

## 遥测图表

四个面板在右侧，每秒刷新一次（1s 节流）：

| 面板 | 内容 |
|------|------|
| 下肢关节角度 | 左/右髋俯仰 + 左/右膝（rad） |
| 关节力矩 | 同上关节的 tau_est（Nm） |
| 电机电压 | 所有在线电机的最低/最高/平均电压（V） |
| 电机温度 | 每个在线电机的当前温度，**超过 50°C 红色告警 + 弹窗** |

### 温度告警

- 各电机独立监控
- 超过 50°C：卡片变红闪烁 + 右上角 Toast 弹窗
- 回落到 ≤50°C：自动解除告警
- 同一关节不会重复弹窗（回落后再次升高会重新告警）

## 页面操作

| 操作 | 方式 |
|------|------|
| 修改 IP / 端口 | 顶栏输入框，仅未连接时可编辑 |
| 连接 ROS | 输入 IP 和端口后点「连接 ROS」 |
| 断开连接 | 点「断开连接」 |
| 旋转 3D 视角 | 鼠标拖拽 |
| 缩放 3D 视角 | 滚轮 |
| 采集姿态基准 | 按 **C 键** |
| 清除姿态校准 | 按 **R 键** |
| 关闭 Toast | 点击通知卡片 |

## ROS 控制（预留）

需要向机器人发送指令时，使用 `publish()` 函数：

```ts
import { publish } from '@/ros'

// 示例：发送速度指令
publish('/cmd_vel', 'geometry_msgs/Twist', {
  linear: { x: 0.5, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: 0.1 },
})
```

配合页面按钮即可实现远程控制。
