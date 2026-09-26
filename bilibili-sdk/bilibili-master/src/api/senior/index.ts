/**
 * 硬核会员答题 API（来自 bili-hardcore）
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取答题分类 */
export async function getSeniorCategory(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/senior/v1/category', {}, 'app')
}

/** 获取验证码 */
export async function getSeniorCaptcha(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/senior/v1/captcha', {}, 'app')
}

/** 提交验证码 */
export async function submitSeniorCaptcha(
  client: BiliClient,
  params: {
    code: string
    captchaToken: string
    ids: string
  },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/senior/v1/captcha/submit',
    {
      bili_code: params.code,
      bili_token: params.captchaToken,
      ids: params.ids,
      type: 'bilibili',
      gt_challenge: '',
      gt_seccode: '',
      gt_validate: '',
    },
    'app',
  )
}

/** 获取题目 */
export async function getSeniorQuestion(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/senior/v1/question', {}, 'app')
}

/** 提交答案 */
export async function submitSeniorAnswer(
  client: BiliClient,
  params: {
    id: number
    ansHash: string
    ansText: string
  },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/senior/v1/answer/submit',
    {
      id: String(params.id),
      ans_hash: params.ansHash,
      ans_text: params.ansText,
    },
    'app',
  )
}

/** 获取答题结果 */
export async function getSeniorResult(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/senior/v1/answer/result', {}, 'app')
}
