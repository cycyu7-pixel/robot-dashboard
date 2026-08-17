/**
 * G1 机器人 profile（宇树 G1，29 自由度）
 *
 * 关节顺序基于标准 G1 固件，电机序号与 /lowstate 的 motor_state 数组一一对应。
 * 验证方法：手推某个关节看哪个 index 的 q 值变了。
 */

import type { RobotProfile } from '../profile'
import urdfXml from '@/urdf/g1_29dof_rev_1_0_with_inspire_hand_FTP.urdf?raw'

export const g1Profile: RobotProfile = {
  id: 'g1',
  name: 'Unitree G1',
  numMotors: 29,

  // 电机序号 -> ROS 关节名
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
  ],

  // 电机序号 -> URDF 关节名（加 _joint 后缀）
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
  ],

  urdfXml,
  urdfMeshBase: '/',

  // 2D 视图静态展示姿态（肘部微弯，不随真实关节数据变化）
  restPose: {
    left_elbow_joint: 0.65,
    right_elbow_joint: 0.65,
    left_shoulder_pitch_joint: 0.25,
    right_shoulder_pitch_joint: 0.25,
    left_shoulder_roll_joint: 0.35,
    right_shoulder_roll_joint: -0.35,
  },

  // 每个关节标签的独立偏移量（逐个调）
  labelOffsets: {
    left_shoulder:  { x: 30, y: 0 },
    right_shoulder: { x: -110, y: 0 },
    left_elbow:     { x: 20, y: 0 },
    right_elbow:    { x: -100, y: 0 },
    left_wrist:     { x: 35, y: 0 },
    right_wrist:    { x: -105, y: 0 },
    waist:          { x: -40, y: 0 },
    left_hip:       { x: 30, y: 10 },
    right_hip:      { x: -100, y: 10 },
    left_knee:      { x: 30, y: 0 },
    right_knee:     { x: -100, y: 0 },
    left_ankle:     { x: 30, y: 0 },
    right_ankle:    { x: -100, y: 0 },
  },

  enableControl: true,
  /** 温度监控场景 1Hz 足够（温度为分钟级变化） */
  lowstateRate: 1,

  ros: {
    lowstateTopic: '/lowstate',
    lowstateMsgType: 'unitree_hg/msg/LowState',
    estopService: '/g1/trigger_estop',
    estopQueryService: '/g1_emergency_stop_node/query_estop_state',
    sportRequestTopic: '/api/sport/request',
    sportResponseTopic: '/api/sport/response',
  },
}
