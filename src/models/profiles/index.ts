/**
 * 所有机器人 profile 聚合导出
 *
 * 新增型号：在此 import 并加入 ROBOT_PROFILES 数组。
 */

import type { RobotProfile } from '../profile'
import { g1Profile } from './g1'
import { h2Profile } from './h2'

export { g1Profile } from './g1'
export { h2Profile } from './h2'

/** 所有可用型号，App 下拉选择用 */
export const ROBOT_PROFILES: RobotProfile[] = [g1Profile, h2Profile]
