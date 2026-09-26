/**
 * 公共类型定义
 *
 * 包含 Bilibili API 通用的请求/响应结构和领域模型的基础类型
 */

// 通用响应

/** Bilibili API 统一响应结构 */
export interface BiliApiResponse<T = unknown> {
  code: number
  message: string
  ttl: number
  data: T
}

/** 分页信息 */
export interface PaginationInfo {
  /** 当前页码 */
  page: number
  /** 每页条数 */
  pagesize: number
  /** 总条数 */
  count: number
}

// 鉴权

/** 鉴权模式 */
export type AuthMode = 'none' | 'cookie' | 'app' | 'wbi'

// 通用子类型

/** 用户基础信息（精简版） */
export interface BiliSimpleUser {
  mid: number
  name: string
  face: string
}

/** 视频状态计数 */
export interface BiliVideoStat {
  view: number
  danmaku: number
  reply: number
  favorite: number
  coin: number
  share: number
  like: number
}

/** 视频分 P 信息 */
export interface BiliVideoPage {
  cid: number
  page: number
  part: string
  duration: number
  dimension: {
    width: number
    height: number
    rotate: number
  }
}

/** 认证信息 */
export interface BiliOfficial {
  role: number
  title: string
  desc: string
  type: number
}

/** 大会员信息 */
export interface BiliVip {
  type: number
  status: number
  dueDate: number
  label: {
    path: string
    text: string
    label_theme: string
  }
}
