/**
 * ============================================================
 * 机器人数据模型 -- 通用类型定义
 * ============================================================
 *
 * 型号相关的关节表、URDF、2D 视图参数、ROS 接口等见 src/models/profiles/。
 */

/** 单个电机状态（unitree_hg/msg/LowState.motor_state[i]） */
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

/** /lowstate 消息体 */
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
