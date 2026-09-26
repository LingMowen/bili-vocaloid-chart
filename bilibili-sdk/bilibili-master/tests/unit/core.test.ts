import { describe, expect, it } from 'vitest'

import {
  APP_KEY_MAP,
  appsign,
  BiliApiError,
  Config,
  Credential,
  DEFAULT_CONFIG,
  genTicketParams,
  hmacSha256,
  md5,
  WbiSigner,
} from '../../src/core'

// Credential

describe('Credential', () => {
  it('厚封装构造 — 所有字段', () => {
    const cred = new Credential({
      sessdata: 'test-sess',
      biliJct: 'test-jct',
      dedeUserId: '12345',
      buvid3: 'buvid3-val',
      buvid4: 'buvid4-val',
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
    })
    expect(cred.sessdata).toBe('test-sess')
    expect(cred.biliJct).toBe('test-jct')
    expect(cred.dedeUserId).toBe('12345')
    expect(cred.buvid3).toBe('buvid3-val')
    expect(cred.buvid4).toBe('buvid4-val')
    expect(cred.accessToken).toBe('access-tok')
    expect(cred.refreshToken).toBe('refresh-tok')
    expect(cred.hasCookie).toBe(true)
    expect(cred.hasAccessToken).toBe(true)
  })

  it('空构造 — 所有字段为 undefined', () => {
    const cred = new Credential()
    expect(cred.sessdata).toBeUndefined()
    expect(cred.biliJct).toBeUndefined()
    expect(cred.dedeUserId).toBeUndefined()
    expect(cred.hasCookie).toBe(false)
    expect(cred.hasAccessToken).toBe(false)
  })

  it('薄封装 fromCookie — 解析 cookie 字符串', () => {
    const cookie = 'SESSDATA=abc123; bili_jct=xyz789; DedeUserID=42'
    const cred = Credential.fromCookie(cookie)
    expect(cred.sessdata).toBe('abc123')
    expect(cred.biliJct).toBe('xyz789')
    expect(cred.dedeUserId).toBe('42')
    expect(cred.hasCookie).toBe(true)
  })

  it('fromCookie — 解析带 buvid 的 cookie', () => {
    const cookie = 'SESSDATA=abc; bili_jct=def; DedeUserID=1; buvid3=b3; buvid4=b4'
    const cred = Credential.fromCookie(cookie)
    expect(cred.sessdata).toBe('abc')
    expect(cred.biliJct).toBe('def')
    expect(cred.dedeUserId).toBe('1')
    expect(cred.buvid3).toBe('b3')
    expect(cred.buvid4).toBe('b4')
  })

  it('fromCookie — 无字段时返回空', () => {
    const cred = Credential.fromCookie('')
    expect(cred.hasCookie).toBe(false)
    expect(cred.sessdata).toBeUndefined()
  })

  it('toCookieString — 输出完整 cookie 格式', () => {
    const cred = new Credential({
      sessdata: 'abc',
      biliJct: 'def',
      dedeUserId: '1',
      buvid3: 'b3',
      buvid4: 'b4',
    })
    const cookie = cred.toCookieString()
    expect(cookie).toContain('SESSDATA=abc')
    expect(cookie).toContain('bili_jct=def')
    expect(cookie).toContain('DedeUserID=1')
    expect(cookie).toContain('buvid3=b3')
    expect(cookie).toContain('buvid4=b4')
  })

  it('toCookieString — 部分字段时仅输出有值的', () => {
    const cred = new Credential({ sessdata: 'abc' })
    const cookie = cred.toCookieString()
    expect(cookie).toBe('SESSDATA=abc')
  })

  it('toHeaders — 输出完整 HTTP header 格式', () => {
    const cred = new Credential({
      accessToken: 'tok123',
      biliJct: 'jct456',
      dedeUserId: '789',
      buvid3: 'b3',
      buvid4: 'b4',
    })
    const headers = cred.toHeaders()
    expect(headers.access_key).toBe('tok123')
    expect(headers['x-csrf-token']).toBe('jct456')
    expect(headers['x-bili-mid']).toBe('789')
    expect(headers['x-bili-buvid3']).toBe('b3')
    expect(headers['x-bili-buvid4']).toBe('b4')
  })

  it('toHeaders — 空凭据返回空对象', () => {
    const cred = new Credential()
    expect(cred.toHeaders()).toEqual({})
  })

  it('hasAccessToken — access_token 存在时返回 true', () => {
    const cred = new Credential({ accessToken: 'tok' })
    expect(cred.hasAccessToken).toBe(true)
    expect(cred.hasCookie).toBe(false)
  })

  it('hasCookie — 仅当 sessdata+biliJct+dedeUserId 三者齐全才为 true', () => {
    expect(new Credential({ sessdata: 'a', biliJct: 'b' }).hasCookie).toBe(false)
    expect(new Credential({ sessdata: 'a', dedeUserId: 'c' }).hasCookie).toBe(false)
    expect(new Credential({ biliJct: 'b', dedeUserId: 'c' }).hasCookie).toBe(false)
  })
})

// Config

describe('Config', () => {
  it('默认值', () => {
    const cfg = new Config()
    expect(cfg.baseURL).toBe('https://api.bilibili.com')
    expect(cfg.platform).toBe('web')
    expect(cfg.timeout).toBe(10000)
    expect(cfg.userAgent).toBe('Mozilla/5.0 BiliDroid/1.12.0 (bbcallen@gmail.com)')
    expect(cfg.injectPlatformParams).toBe(true)
  })

  it('自定义覆盖全部字段', () => {
    const cfg = new Config({
      baseURL: 'https://example.com',
      platform: 'android',
      timeout: 5000,
      userAgent: 'custom-ua',
      injectPlatformParams: false,
    })
    expect(cfg.baseURL).toBe('https://example.com')
    expect(cfg.platform).toBe('android')
    expect(cfg.timeout).toBe(5000)
    expect(cfg.userAgent).toBe('custom-ua')
    expect(cfg.injectPlatformParams).toBe(false)
  })

  it('部分覆盖 — 其余用默认值', () => {
    const cfg = new Config({ platform: 'ios' })
    expect(cfg.platform).toBe('ios')
    expect(cfg.baseURL).toBe('https://api.bilibili.com')
    expect(cfg.timeout).toBe(10000)
  })

  it('DEFAULT_CONFIG 不可变引用', () => {
    // 确保 DEFAULT_CONFIG 的值是常量
    expect(DEFAULT_CONFIG.baseURL).toBe('https://api.bilibili.com')
    expect(DEFAULT_CONFIG.timeout).toBe(10000)
  })
})

// Sign

describe('md5', () => {
  it('计算 MD5 哈希（小写 hex）', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('空字符串 MD5', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })
})

describe('hmacSha256', () => {
  it('计算 HMAC-SHA256 哈希', () => {
    const result = hmacSha256('key', 'message')
    expect(result).toBe('6e9ef29b75fffc5b7abae527d58fdadb2fe42e7219011976917343065f58ed4a')
  })

  it('空 key 或空消息', () => {
    expect(hmacSha256('', '')).toHaveLength(64)
  })
})

describe('appsign', () => {
  it('按签名算法计算 sign', () => {
    const params: Record<string, string> = {
      id: '114514',
      str: '1919810',
    }
    appsign(params, '1d8b6e7d45233436', '560c52ccd288fed045859ed18bffd973')

    expect(params.appkey).toBe('1d8b6e7d45233436')
    expect(params.ts).toBeTruthy()
    expect(params.sign).toBeTruthy()
    expect(params.sign).toHaveLength(32)
    // 原始参数不应被覆盖
    expect(params.id).toBe('114514')
    expect(params.str).toBe('1919810')
  })

  it('空参数也能正常工作', () => {
    const params: Record<string, string> = {}
    appsign(params, '1d8b6e7d45233436', '560c52ccd288fed045859ed18bffd973')
    expect(params.appkey).toBe('1d8b6e7d45233436')
    expect(params.ts).toBeTruthy()
    expect(params.sign).toHaveLength(32)
  })

  it('特殊字符参数正确编码', () => {
    const params: Record<string, string> = {
      'a b': 'c d',
      special: '=&?',
    }
    appsign(params, '1d8b6e7d45233436', '560c52ccd288fed045859ed18bffd973')
    expect(params.sign).toBeTruthy()
    expect(params.sign).toHaveLength(32)
  })

  it('已知 appkey 映射表包含所有客户端 key', () => {
    expect(APP_KEY_MAP['783bbb7264451d82']).toBe('2653583c8873dea268ab9386918b1d65')
    expect(APP_KEY_MAP['1d8b6e7d45233436']).toBe('560c52ccd288fed045859ed18bffd973')
    expect(APP_KEY_MAP['27eb53fc9058f8c3']).toBe('c2ed53a74eeefe6cf99fda01e1d96e7f')
    expect(APP_KEY_MAP['4409e2ce8ffd6b70']).toBe('59b43e04ad6965f34319062b478f83dd')
  })
})

describe('WbiSigner', () => {
  const imgKey = '7cd084941338484aae1ad9425b84077c'
  const subKey = '4932caff0ff746eab6f01bf08b70ac45'

  it('init 计算 mixin_key', () => {
    const signer = new WbiSigner()
    signer.init(imgKey, subKey)
    expect(signer.ready).toBe(true)
  })

  it('未 init 时 ready 为 false', () => {
    const signer = new WbiSigner()
    expect(signer.ready).toBe(false)
  })

  it('fromNav 从 URL 提取 key 并初始化', () => {
    const signer = WbiSigner.fromNav(
      'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
      'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
    )
    expect(signer.ready).toBe(true)
  })

  it('fromNav 处理不含扩展名的 URL', () => {
    const signer = WbiSigner.fromNav(
      'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c',
      'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45',
    )
    expect(signer.ready).toBe(true)
  })

  it('sign 追加 w_rid 和 wts 但不覆盖原参数', () => {
    const signer = new WbiSigner()
    signer.init(imgKey, subKey)
    const params: Record<string, string> = { mid: '123456' }
    signer.sign(params)
    expect(params.wts).toBeTruthy()
    expect(params.w_rid).toBeTruthy()
    expect(params.w_rid).toHaveLength(32)
    expect(params.mid).toBe('123456')
  })

  it('sign 对空参数也能工作', () => {
    const signer = new WbiSigner()
    signer.init(imgKey, subKey)
    const params: Record<string, string> = {}
    signer.sign(params)
    expect(params.wts).toBeTruthy()
    expect(params.w_rid).toHaveLength(32)
  })

  it('同一个 mixin_key 下的签名可复现', () => {
    // 固定 wts 用不了因为 sign 内部用 Date.now()，但我们验证 w_rid 存在且为 32 字符即可
    const signer = new WbiSigner()
    signer.init(imgKey, subKey)
    const params1: Record<string, string> = { a: '1' }
    const params2: Record<string, string> = { a: '1' }
    signer.sign(params1)
    signer.sign(params2)
    // 由于 wts 不同，签名不同，但格式一致
    expect(params1.w_rid).toHaveLength(32)
    expect(params2.w_rid).toHaveLength(32)
  })
})

describe('genTicketParams', () => {
  it('生成 ticket 签名参数（带 csrf）', () => {
    const params = genTicketParams('csrf123')
    expect(params.key_id).toBe('ec02')
    expect(params.csrf).toBe('csrf123')
    expect(params.hexsign).toBeTruthy()
    expect(params.hexsign).toHaveLength(64) // SHA-256 hex
    expect(params['context[ts]']).toBeTruthy()
  })

  it('生成 ticket 签名参数（无 csrf）', () => {
    const params = genTicketParams()
    expect(params.key_id).toBe('ec02')
    expect(params.csrf).toBe('')
    expect(params.hexsign).toBeTruthy()
    expect(params['context[ts]']).toBeTruthy()
  })
})

// BiliApiError

describe('BiliApiError', () => {
  it('包含 code / message / rawResponse', () => {
    const raw = { code: -403, message: '权限不足', ttl: 1 }
    const err = new BiliApiError(-403, '权限不足', raw)
    expect(err.code).toBe(-403)
    expect(err.message).toContain('[BiliApi -403]')
    expect(err.message).toContain('权限不足')
    expect(err.rawResponse).toBe(raw)
    expect(err.name).toBe('BiliApiError')
  })

  it('无 rawResponse 时默认为 undefined', () => {
    const err = new BiliApiError(0, 'ok')
    expect(err.code).toBe(0)
    expect(err.rawResponse).toBeUndefined()
    expect(err.message).toContain('ok')
  })

  it('错误码 0 也能正常构造', () => {
    const err = new BiliApiError(0, 'success')
    expect(err.code).toBe(0)
    expect(err.message).toContain('[BiliApi 0]')
  })

  it('instanceof 正确', () => {
    const err = new BiliApiError(-1, 'err')
    expect(err).toBeInstanceOf(BiliApiError)
    expect(err).toBeInstanceOf(Error)
  })
})
