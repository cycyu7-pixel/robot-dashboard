/**
 * RobotProfile -- 机器人型号配置
 *
 * 一套代码支持多型号运行时切换（G1 / H2 ...）。所有与具体型号相关的
 * 关节表、URDF、2D 视图参数、ROS 接口都封装在 profile 里，组件/composable
 * 只依赖 RobotProfile 接口，不直接引用任何 G1_/H2_ 常量。
 *
 * 新增型号：在 src/models/profiles/ 下新建一个 profile 文件，实现 RobotProfile。
 */

export interface RobotProfile {
  /** 型号 id，如 'g1' / 'h2' */
  id: string
  /** 型号显示名 */
  name: string
  /** 电机数量 */
  numMotors: number
  /** 电机序号 -> ROS 关节名（与 motor_state 数组一一对应） */
  motorJoints: string[]
  /** 电机序号 -> 中文显示名 */
  displayNames: string[]
  /** 电机序号 -> URDF 关节名 */
  urdfJoints: string[]
  /** URDF XML 文本（通过 ?raw 导入） */
  urdfXml: string
  /** mesh 请求前缀，dev 中间件按此查找源目录，如 '/' 或 '/h2/' */
  urdfMeshBase: string
  /** 2D 视图静态展示姿态 { urdfJointName: angle } */
  restPose: Record<string, number>
  /** 2D 视图温度标签逐个偏移量 */
  labelOffsets: Record<string, { x: number; y: number }>
  /** 是否支持控制（急停 / 模式切换） */
  enableControl: boolean
  /** /lowstate 读取频率（Hz）。温度监控 1 即可；将来若要 2D 视图跟随实时关节角度需提到 20~30 */
  lowstateRate: number
  /** ROS 接口配置 */
  ros: {
    lowstateTopic: string
    lowstateMsgType: string
    /** 急停 service（enableControl=true 时用） */
    estopService?: string
    estopQueryService?: string
    /** 运动 service topic（enableControl=true 时用） */
    sportRequestTopic?: string
    sportResponseTopic?: string
  }
}
