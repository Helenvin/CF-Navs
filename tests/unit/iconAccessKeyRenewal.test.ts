import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { clearIconAccessKey, ensureIconAccessKey, iconAccessKey } from '../../src/lib/iconAccessKey'
import type { IconAccessResp } from '../../shared/types'

// iconAccessKey 的临期自动续签。注释里宣称「临近过期前提前续签」很久了，实现却一直
// 缺席：页面停留超过 key 寿命（默认 30 分钟）后所有私密图标整体退化成兜底图，直到
// 某次数据刷新才恢复——正是「过一会儿图标又坏了」的另一半成因。

const BASE = 1_700_000_000_000
const TTL = 30 * 60 * 1000

// 真实服务端按「签发时刻 + TTL」给 expires_at，mock 也要基于当前 fake 时间，
// 否则续签拿到的 key 一落地就已处在续签窗口内，publish 会把它判成空。
const grant = (suffix: string): IconAccessResp => ({ key: `k-${suffix}`, expires_at: Date.now() + TTL })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE)
})

afterEach(() => {
  clearIconAccessKey()
  vi.useRealTimers()
})

describe('iconAccessKey 的临期自动续签', () => {
  // grant() 依赖「签发时刻」的 fake 时间，所以 mock 必须惰性求值——mockResolvedValueOnce
  // 的参数在构建时就求完了，续签时拿到的还是 BASE 时刻的过期点。
  const grantAt = (suffix: string) => vi.fn(async () => grant(suffix))

  it('到续签点自动重签，store 平滑换上新 key', async () => {
    const fetchGrant = vi.fn()
      .mockImplementationOnce(async () => grant('a'))
      .mockImplementationOnce(async () => grant('b'))

    await ensureIconAccessKey(fetchGrant)
    expect(get(iconAccessKey)).toBe('k-a')
    expect(fetchGrant).toHaveBeenCalledTimes(1)

    // 续签点 = expires_at - RENEW_BEFORE_MS = 28 分钟处。
    await vi.advanceTimersByTimeAsync(28 * 60 * 1000)
    expect(fetchGrant).toHaveBeenCalledTimes(2)
    expect(get(iconAccessKey)).toBe('k-b')
  })

  it('续签拿到新 key 后按新过期时间重新排程', async () => {
    const fetchGrant = vi.fn()
      .mockImplementationOnce(async () => grant('a'))
      .mockImplementationOnce(async () => grant('b'))
      .mockImplementationOnce(async () => grant('c'))

    await ensureIconAccessKey(fetchGrant)
    await vi.advanceTimersByTimeAsync(28 * 60 * 1000)
    expect(fetchGrant).toHaveBeenCalledTimes(2)
    expect(get(iconAccessKey)).toBe('k-b')

    await vi.advanceTimersByTimeAsync(28 * 60 * 1000)
    expect(fetchGrant).toHaveBeenCalledTimes(3)
    expect(get(iconAccessKey)).toBe('k-c')
  })

  it('登出清掉续签定时器，之后不再发签发请求', async () => {
    const fetchGrant = vi.fn().mockImplementation(async () => grant('a'))
    await ensureIconAccessKey(fetchGrant)
    expect(fetchGrant).toHaveBeenCalledTimes(1)

    clearIconAccessKey()
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(fetchGrant).toHaveBeenCalledTimes(1)
    expect(get(iconAccessKey)).toBe('')
  })

  it('签发失败返回空串且不影响后续调用重试', async () => {
    const fetchGrant = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementationOnce(async () => grant('a'))

    await expect(ensureIconAccessKey(fetchGrant)).resolves.toBe('')
    expect(get(iconAccessKey)).toBe('')

    await expect(ensureIconAccessKey(fetchGrant)).resolves.toBe('k-a')
    expect(get(iconAccessKey)).toBe('k-a')
  })
})
