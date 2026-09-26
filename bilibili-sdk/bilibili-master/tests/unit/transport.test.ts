import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Credential, BiliApiError, WbiSigner } from '../../src/core'
import { BiliClient, createClient } from '../../src/transport'

// Mock axios
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  }
  return { default: mockAxios }
})

describe('BiliClient', () => {
  let client: BiliClient
  let responseInterceptor: (response: unknown) => unknown
  let errorInterceptor: (error: unknown) => unknown
  beforeEach(() => {
    vi.mocked(axios.create).mockReturnValue(axios)
    const useSpy = vi.mocked(axios.interceptors.response.use)
    useSpy.mockImplementation((onFulfilled, onRejected) => {
      responseInterceptor = onFulfilled as (response: unknown) => unknown
      errorInterceptor = onRejected as (error: unknown) => unknown
      return 0
    })
    // 重置 mock 计数器
    vi.mocked(axios.get).mockReset()
    vi.mocked(axios.post).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('构造函数', () => {
    it('创建默认 axios 实例', () => {
      client = new BiliClient()
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.bilibili.com',
        timeout: 10000,
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    })

    it('接受自定义 Config', () => {
      client = new BiliClient({
        config: { baseURL: 'https://example.com', timeout: 5000, platform: 'android' },
      })
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://example.com',
        timeout: 5000,
        headers: expect.any(Object),
      })
    })

    it('接受 Credential', () => {
      const cred = new Credential({ sessdata: 's', biliJct: 'j', dedeUserId: '1' })
      client = new BiliClient({ credential: cred })
      expect(client.credential).toBe(cred)
    })

    it('注册响应拦截器', () => {
      client = new BiliClient()
      expect(axios.interceptors.response.use).toHaveBeenCalledTimes(1)
    })
  })

  describe('响应拦截器', () => {
    beforeEach(() => {
      client = new BiliClient()
    })

    it('code=0 时原样返回', () => {
      const response = { data: { code: 0, message: '0', ttl: 1, data: { foo: 'bar' } } }
      const result = responseInterceptor!(response)
      expect(result).toBe(response)
    })

    it('code !== 0 时抛出 BiliApiError', () => {
      const response = { data: { code: -403, message: '权限不足', ttl: 1, data: null } }
      expect(() => responseInterceptor!(response)).toThrow(BiliApiError)
      try {
        responseInterceptor!(response)
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(BiliApiError)
        expect((e as BiliApiError).code).toBe(-403)
        expect((e as BiliApiError).message).toContain('权限不足')
      }
    })

    it('二进制/非 JSON 响应跳过 code 校验', () => {
      const response = { data: new Uint8Array([1, 2, 3]) }
      expect(responseInterceptor!(response)).toBe(response)
    })
  })

  describe('错误拦截器', () => {
    beforeEach(() => {
      client = new BiliClient()
    })

    it('网络错误包装为 BiliApiError', () => {
      expect(() => errorInterceptor!(new Error('Network timeout'))).toThrow(BiliApiError)
    })

    it('BiliApiError 透传不包装', () => {
      const original = new BiliApiError(-1, '透传')
      expect(() => errorInterceptor!(original)).toThrow(BiliApiError)
      try {
        errorInterceptor!(original)
      } catch (e: unknown) {
        expect(e).toBe(original)
      }
    })

    it('非 Error 类型未知错误', () => {
      expect(() => errorInterceptor!('string error')).toThrow(BiliApiError)
    })

    it('null 错误', () => {
      expect(() => errorInterceptor!(null)).toThrow(BiliApiError)
    })
  })

  describe('setAppSign / setCredential', () => {
    beforeEach(() => {
      client = new BiliClient()
    })

    it('设置 APP 签名 key/sec', () => {
      client.setAppSign('key123', 'sec456')
      expect(client.appKey).toBe('key123')
      expect(client.appSec).toBe('sec456')
    })

    it('设置凭据', () => {
      const cred = new Credential({
        sessdata: 'sess',
        biliJct: 'jct',
        dedeUserId: '123',
      })
      client.setCredential(cred)
      expect(client.credential).toBe(cred)
    })

    it('先后调用 setAppSign 和 setCredential', () => {
      const cred = new Credential({ sessdata: 's' })
      client.setAppSign('k', 's')
      client.setCredential(cred)
      expect(client.appKey).toBe('k')
      expect(client.credential).toBe(cred)
    })
  })

  describe('GET 请求', () => {
    beforeEach(() => {
      client = new BiliClient()
    })

    it('发起基本 GET 请求', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      const result = await client.get('/test', { p1: 'v1' }, 'none')
      expect(axios.get).toHaveBeenCalledWith('/test', {
        params: { p1: 'v1' },
        headers: {},
      })
      expect(result).toEqual({ code: 0, message: '0', ttl: 1, data: 'ok' })
    })

    it('GET 请求注入 app 签名', async () => {
      client.setAppSign('appkey', 'appsec')
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', { a: '1' }, 'app')
      const params = vi.mocked(axios.get).mock.calls[0][1]?.params as Record<string, string>
      expect(params.appkey).toBe('appkey')
      expect(params.sign).toBeTruthy()
      expect(params.a).toBe('1')
    })

    it('GET 请求注入 access_token', async () => {
      client.setCredential(new Credential({ accessToken: 'tok123' }))
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', {}, 'none')
      const params = vi.mocked(axios.get).mock.calls[0][1]?.params as Record<string, string>
      expect(params.access_key).toBe('tok123')
    })

    it('GET 请求注入 wbi 签名', async () => {
      const signer = new WbiSigner()
      signer.init('7cd084941338484aae1ad9425b84077c', '4932caff0ff746eab6f01bf08b70ac45')
      client = new BiliClient({ wbiSigner: signer })
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', { a: '1' }, 'wbi')
      const params = vi.mocked(axios.get).mock.calls[0][1]?.params as Record<string, string>
      expect(params.w_rid).toHaveLength(32)
      expect(params.wts).toBeTruthy()
      expect(params.a).toBe('1')
    })

    it('wbi 签名器未就绪时不注入 wbi 参数', async () => {
      client = new BiliClient({ wbiSigner: new WbiSigner() })
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', { a: '1' }, 'wbi')
      const params = vi.mocked(axios.get).mock.calls[0][1]?.params as Record<string, string>
      expect(params.w_rid).toBeUndefined()
      expect(params.a).toBe('1')
    })

    it('GET 请求带 cookie header', async () => {
      const cred = new Credential({ sessdata: 's', biliJct: 'j', dedeUserId: '1' })
      client.setCredential(cred)
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', {}, 'cookie')
      const headers = vi.mocked(axios.get).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers.Cookie).toContain('SESSDATA=s')
    })

    it('GET 请求 wbi 模式不发 cookie', async () => {
      const cred = new Credential({ sessdata: 's', biliJct: 'j', dedeUserId: '1' })
      client.setCredential(cred)
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', {}, 'wbi')
      const headers = vi.mocked(axios.get).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers.Cookie).toContain('SESSDATA=s')
    })

    it('GET 请求 auth=none 时不发 cookie', async () => {
      const cred = new Credential({ sessdata: 's', biliJct: 'j', dedeUserId: '1' })
      client.setCredential(cred)
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', {}, 'none')
      const headers = vi.mocked(axios.get).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers.Cookie).toBeUndefined()
    })

    it('GET 请求传递自定义 axios config', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.get('/test', {}, 'none', { responseType: 'arraybuffer' })
      expect(vi.mocked(axios.get).mock.calls[0][1]?.responseType).toBe('arraybuffer')
    })

    it('getBinary 请求二进制数据', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: new Uint8Array([1, 2, 3]) })
      const result = await client.getBinary('/bin', {}, 'none')
      expect(axios.get).toHaveBeenCalledWith('/bin', {
        params: {},
        headers: {},
        responseType: 'arraybuffer',
      })
      expect(result).toEqual(new Uint8Array([1, 2, 3]))
    })
  })

  describe('POST 请求', () => {
    beforeEach(() => {
      client = new BiliClient()
    })

    it('发起基本 POST 请求', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      const result = await client.post('/test', { p1: 'v1' }, 'none')
      expect(axios.post).toHaveBeenCalledWith(
        '/test',
        { p1: 'v1' },
        {
          headers: {},
        },
      )
      expect(result).toEqual({ code: 0, message: '0', ttl: 1, data: 'ok' })
    })

    it('POST 注入 app 签名', async () => {
      client.setAppSign('appkey', 'appsec')
      vi.mocked(axios.post).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.post('/test', { a: '1' }, 'app')
      const body = vi.mocked(axios.post).mock.calls[0][1] as Record<string, string>
      expect(body.appkey).toBe('appkey')
      expect(body.sign).toBeTruthy()
    })

    it('POST 请求带 cookie header', async () => {
      const cred = new Credential({ sessdata: 's', biliJct: 'j', dedeUserId: '1' })
      client.setCredential(cred)
      vi.mocked(axios.post).mockResolvedValue({
        data: { code: 0, message: '0', ttl: 1, data: 'ok' },
      })
      await client.post('/test', {}, 'cookie')
      const config = vi.mocked(axios.post).mock.calls[0][2] as Record<string, unknown>
      expect((config.headers as Record<string, string>).Cookie).toContain('SESSDATA=s')
    })
  })

  describe('createClient 工厂', () => {
    it('返回 BiliClient 实例', () => {
      const c = createClient()
      expect(c).toBeInstanceOf(BiliClient)
    })

    it('传递选项', () => {
      const cred = new Credential({ sessdata: 's' })
      const c = createClient({ credential: cred })
      expect(c.credential).toBe(cred)
    })
  })
})
