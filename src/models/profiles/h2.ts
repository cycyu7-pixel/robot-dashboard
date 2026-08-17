/**
 * H2 机器人 profile（宇树 H2，31 自由度）
 *
 * H2 比 G1 多 head_pitch / head_yaw 两个头部关节，手部为 fixed（无驱动）。
 * 腿/腰/臂关节名与 G1 完全一致，故 2D 视图的 restPose / labelOffsets 复用 G1。
 *
 * ⚠️ motor_state 顺序为占位假设：腿6 + 腿6 + 腰3 + 臂7 + 臂7 + 头2 = 31，
 *    头部两个 index 暂放最后。接入真机后请手推头部关节验证 index 是否正确，
 *    不对就调整下面 motorJoints / displayNames / urdfJoints 三者的顺序。
 */

import type { RobotProfile } from '../profile'
import { g1Profile } from './g1'
import urdfXml from '@/urdf/h2/H2.urdf?raw'

export const h2Profile: RobotProfile = {
  id: 'h2',
  name: 'Unitree H2',
  numMotors: 31,

  // 电机序号 -> ROS 关节名（0~28 同 G1，29~30 为头部，占位待实测）
  motorJoints: [
    // 0-5: 左腿
    'left_hip_yaw', 'left_hip_roll', 'left_hip_pitch', 'left_knee', 'left_ankle_pitch', 'left_ankle_roll',
    // 6-11: 右腿
    'right_hip_yaw', 'right_hip_roll', 'right_hip_pitch', 'right_knee', 'right_ankle_pitch', 'right_ankle_roll',
    // 12-14: 腰部
    'waist_yaw', 'waist_roll', 'waist_pitch',
    // 15-21: 左臂
    'left_shoulder_pitch', 'left_shoulder_roll', 'left_shoulder_yaw', 'left_elbow', 'left_wrist_pitch', 'left_wrist_roll', 'left_wrist_yaw',
    // 22-28: 右臂
    'right_shoulder_pitch', 'right_shoulder_roll', 'right_shoulder_yaw', 'right_elbow', 'right_wrist_roll', 'right_wrist_pitch', 'right_wrist_yaw',
    // 29-30: 头部（占位，需手推实测 index）
    'head_pitch', 'head_yaw',
  ],

  // 电机序号 -> 中文显示名
  displayNames: [
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
    // 29-30: 头部
    '头部俯仰', '头部偏航',
  ],

  // 电机序号 -> URDF 关节名
  urdfJoints: [
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
    // 29-30: 头部
    'head_pitch_joint', 'head_yaw_joint',
  ],

  urdfXml,
  urdfMeshBase: '/h2/',

  // 腿/腰/臂关节名与 G1 一致，2D 视图参数直接复用
  restPose: g1Profile.restPose,
  labelOffsets: g1Profile.labelOffsets,

  enableControl: false,
  /** 温度监控场景 1Hz 足够（温度为分钟级变化） */
  lowstateRate: 1,

  ros: {
    lowstateTopic: '/lowstate',
    lowstateMsgType: 'unitree_hg/msg/LowState',
  },
}
