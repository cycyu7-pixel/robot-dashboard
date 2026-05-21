/**
 * ============================================================
 * 机器人数据模型 - G1 机器人业务类型定义
 * ============================================================
 *
 * 使用方法：
 *   import { MotorState, G1_MOTOR_JOINTS } from '@/models/robot'
 */

// -------------------------------------------------------------------
// 宇树 G1 关节映射（2D 火柴人用）
// -------------------------------------------------------------------

/**
 * 2D 火柴人关节映射
 *
 * 说明：
 *   jointName   = ROS 关节名，不同固件版本可能不一样，对着你的实际数据改
 *   displayName = 调试显示用的中文名
 *   axis        = 2D 中可见的旋转方向 'z'（在画面平面内旋转）
 *   invert      = true 表示反转旋转方向
 *   group       = 这根肢体在骨架里的 Group 名
 *
 * 2D 火柴人只展示能在画面上看到的旋转（正面视角），
 * 所以 shoulder_pitch、hip_pitch 等前后方向的运动不太明显，
 * 这里默认用 shoulder_roll / hip_roll 作为 2D 可视角度。
 * 如果你觉得不够直观，把 jointName 换成 pitch 关节就行。
 */
export interface JointMapping {
  /** ROS topic 中关节的名字 */
  jointName: string
  /** 调试用的中文名 */
  displayName: string
  /** 2D 可见旋转轴，固定用 'z' */
  axis: 'z'
  /** 是否反转角度方向 */
  invert: boolean
  /** 这根关节控制 2D 骨架里的哪个 Group */
  group: string
}

// -------------------------------------------------------------------
// G1 LowState —— Unitree 自定义消息（非标准 ROS 类型）
// -------------------------------------------------------------------

/** 单个电机状态 */
export interface MotorState {
  mode: number
  /** 关节位置（弧度） */
  q: number
  /** 关节速度（rad/s） */
  dq: number
  ddq: number
  /** 估算力矩（Nm） */
  tau_est: number
  temperature: number[]
  vol: number
}

/** G1 /lowstate 消息体 */
export interface LowState {
  tick: number
  motor_state: MotorState[]
  imu_state?: {
    quaternion: number[]
    gyroscope: number[]
    accelerometer: number[]
    rpy: number[]
  }
}

// -------------------------------------------------------------------
// G1 电机序号 → 关节名映射
// -------------------------------------------------------------------

/**
 * G1 28 电机顺序（0-indexed）
 *
 * 这个顺序基于标准 G1 固件，如果不准就对着 ros2 topic echo 的输出调。
 * 测试方法：手推某个关节看哪个电机的 q 值变了。
 */
export const G1_MOTOR_JOINTS: string[] = [
  // 0-5: 左腿
  'left_hip_yaw',
  'left_hip_roll',
  'left_hip_pitch',
  'left_knee',
  'left_ankle_pitch',
  'left_ankle_roll',

  // 6-11: 右腿
  'right_hip_yaw',
  'right_hip_roll',
  'right_hip_pitch',
  'right_knee',
  'right_ankle_pitch',
  'right_ankle_roll',

  // 12-14: 腰部
  'waist_yaw',
  'waist_roll',
  'waist_pitch',

  // 15-21: 左臂
  'left_shoulder_pitch',
  'left_shoulder_roll',
  'left_shoulder_yaw',
  'left_elbow',
  'left_wrist_pitch',
  'left_wrist_roll',
  'left_wrist_yaw',

  // 22-28: 右臂
  'right_shoulder_pitch',
  'right_shoulder_roll',
  'right_shoulder_yaw',
  'right_elbow',
  'right_wrist_roll',
  'right_wrist_pitch',
  'right_wrist_yaw',
]

/**
 * 电机序号 → 中文显示名（与 G1_MOTOR_JOINTS 一一对应）
 */
export const G1_MOTOR_DISPLAY_NAMES: string[] = [
  // 0-5: 左腿
  '左髋偏航', '左髋侧摆', '左髋俯仰', '左膝', '左踝俯仰', '左踝侧摆',
  // 6-11: 右腿
  '右髋偏航', '右髋侧摆', '右髋俯仰', '右膝', '右踝俯仰', '右踝侧摆',
  // 12-14: 腰部
  '腰部偏航', '腰部侧摆', '腰部俯仰',
  // 15-21: 左臂
  '左肩俯仰', '左肩侧摆', '左肩偏航', '左肘', '左腕俯仰', '左腕侧摆', '左腕偏航',
  // 22-28: 右臂
  '右肩俯仰', '右肩侧摆', '右肩偏航', '右肘', '右腕侧摆', '右腕俯仰', '右腕偏航',
]

/**
 * 电机序号 → URDF 关节名（与 G1_MOTOR_JOINTS 一一对应，加 _joint 后缀）
 *
 * URDFLoader 按关节名查找，与 URDF 定义顺序无关。
 * 验证方法：手推机器人某个关节，看 lowstate-data.json 里哪个 index 的 q 变了。
 */
export const G1_MOTOR_TO_URDF_JOINT: string[] = [
  // 0-5: 左腿
  'left_hip_yaw_joint', 'left_hip_roll_joint', 'left_hip_pitch_joint',
  'left_knee_joint', 'left_ankle_pitch_joint', 'left_ankle_roll_joint',
  // 6-11: 右腿
  'right_hip_yaw_joint', 'right_hip_roll_joint', 'right_hip_pitch_joint',
  'right_knee_joint', 'right_ankle_pitch_joint', 'right_ankle_roll_joint',
  // 12-14: 腰部
  'waist_yaw_joint', 'waist_roll_joint', 'waist_pitch_joint',
  // 15-21: 左臂
  'left_shoulder_pitch_joint', 'left_shoulder_roll_joint', 'left_shoulder_yaw_joint',
  'left_elbow_joint', 'left_wrist_pitch_joint', 'left_wrist_roll_joint', 'left_wrist_yaw_joint',
  // 22-28: 右臂
  'right_shoulder_pitch_joint', 'right_shoulder_roll_joint', 'right_shoulder_yaw_joint',
  'right_elbow_joint', 'right_wrist_roll_joint', 'right_wrist_pitch_joint', 'right_wrist_yaw_joint',
]

// -------------------------------------------------------------------
// 关节校准（解决编码器零位 ≠ URDF 零位的问题）
// -------------------------------------------------------------------

export interface JointCalibration {
  /** 偏移量：urdf_angle = (motor_q - offset) * (invert ? -1 : 1) */
  offset: number
  /** 反转方向 */
  invert: boolean
}

/** 29 个电机的校准参数，与 G1_MOTOR_JOINTS 一一对应 */
export const G1_MOTOR_CALIBRATION: JointCalibration[] = Array.from({ length: 29 }, () => ({
  offset: 0,
  invert: false,
}))

/**
 * 采集当前姿态作为基准
 * 调用后，当前 motor q 值将成为 3D 模型的「零位」
 */
export function captureBaseline(motors: MotorState[]): void {
  for (let i = 0; i < Math.min(motors.length, G1_MOTOR_CALIBRATION.length); i++) {
    if (motors[i]?.mode === 1) {
      G1_MOTOR_CALIBRATION[i].offset = motors[i].q
      G1_MOTOR_CALIBRATION[i].invert = false
    }
  }
  console.log('[calibrate] 已采集基准姿态:', G1_MOTOR_CALIBRATION.map((c, i) => `${G1_MOTOR_JOINTS[i]}=${c.offset.toFixed(3)}`).join(', '))
}

/** 清除所有校准 */
export function resetCalibration(): void {
  for (const c of G1_MOTOR_CALIBRATION) {
    c.offset = 0
    c.invert = false
  }
  console.log('[calibrate] 已清除所有校准')
}

/** 将电机原始 q 值转为 URDF 角度 */
export function calibrateJointValue(motorIndex: number, motorQ: number): number {
  const cal = G1_MOTOR_CALIBRATION[motorIndex]
  if (!cal) return motorQ
  const val = (motorQ - cal.offset) * (cal.invert ? -1 : 1)
  return val
}

/** 从 motor_state 数组提取 { 关节名: 弧度 }（给 2D 视图用，带 _joint 后缀） */
export function extractJointAngles(motorState: MotorState[]): Record<string, number> {
  const angles: Record<string, number> = {}
  for (let i = 0; i < Math.min(motorState.length, G1_MOTOR_JOINTS.length); i++) {
    const name = G1_MOTOR_JOINTS[i]
    if (name && motorState[i]?.mode === 1) {
      angles[name] = motorState[i].q
    }
  }
  return angles
}

/**
 * G1 关节映射（2D 火柴人版）
 *
 * 每个 group 对应 2D Canvas 里一根可旋转的线段。
 * 骨架结构：
 *         [头]
 *          │
 *   [左上臂]  [右上臂]
 *   [左前臂]  [右前臂]
 *          │
 *        [躯干]
 *          │
 *   [左大腿]  [右大腿]
 *   [左小腿]  [右小腿]
 *
 * jointName 要和 G1_MOTOR_JOINTS 里的名字对上。
 */
export const G1_JOINT_MAPPING: JointMapping[] = [
  // ===== 头部（暂时无独立颈部电机，后续可换） =====
  { jointName: 'waist_roll', displayName: '头部', axis: 'z', invert: false, group: 'head' },

  // ===== 左臂（pitch = 前后摆，正面 2D 看起来比 roll 自然） =====
  { jointName: 'left_shoulder_pitch', displayName: '左肩',  axis: 'z', invert: true,  group: 'left_upper_arm' },
  { jointName: 'left_elbow',          displayName: '左肘',  axis: 'z', invert: false, group: 'left_lower_arm' },

  // ===== 右臂 =====
  { jointName: 'right_shoulder_pitch', displayName: '右肩',  axis: 'z', invert: true,  group: 'right_upper_arm' },
  { jointName: 'right_elbow',          displayName: '右肘',  axis: 'z', invert: false, group: 'right_lower_arm' },

  // ===== 左腿（hip_pitch = 腿前后摆动） =====
  { jointName: 'left_hip_pitch', displayName: '左髋', axis: 'z', invert: true,  group: 'left_upper_leg' },
  { jointName: 'left_knee',      displayName: '左膝', axis: 'z', invert: false, group: 'left_lower_leg' },

  // ===== 右腿 =====
  { jointName: 'right_hip_pitch', displayName: '右髋', axis: 'z', invert: true,  group: 'right_upper_leg' },
  { jointName: 'right_knee',      displayName: '右膝', axis: 'z', invert: false, group: 'right_lower_leg' },
]

// ============================================================
// 暴露到 window，方便浏览器控制台调试校准
// ============================================================

if (typeof window !== 'undefined') {
  ;(window as any).G1_MOTOR_CALIBRATION = G1_MOTOR_CALIBRATION
  ;(window as any).G1_MOTOR_JOINTS = G1_MOTOR_JOINTS
  ;(window as any).G1_MOTOR_DISPLAY_NAMES = G1_MOTOR_DISPLAY_NAMES
  ;(window as any).captureBaseline = captureBaseline
  ;(window as any).resetCalibration = resetCalibration
}
