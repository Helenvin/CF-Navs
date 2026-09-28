import { describe, expect, it } from 'vitest'
import type { IconSource, PublicBookmark } from '../../shared/types'
import {
  deriveBookmarkCardIconBase,
  deriveBookmarkCardIconState,
  shouldReadBookmarkLocalIconCache,
} from '../../src/lib/bookmarkCardIconState'

function bookmark(overrides: Partial<PublicBookmark> = {}): PublicBookmark {
  return {
    id: 42,
    category_id: 1,
    title: 'Example',
    url: 'https://example.com/path',
    icon: null,
    icon_source: null,
    icon_background_color: null,
    icon_blob: null,
    icon_cached: null,
    description: null,
    open_method: 1,
    sort: 0,
    ...overrides,
  }
}

function state(overrides: Partial<PublicBookmark> = {}, input: {
  iconInView?: boolean
  cachedIconFailed?: boolean
  fallbackFailed?: boolean
  syncLocalCachedIconUrl?: string
  localCachedIconUrl?: string
  localCachePending?: boolean
  shouldWaitForLocalIconCache?: boolean
  iconAccessKey?: string
} = {}) {
  return deriveBookmarkCardIconState({
    bookmark: bookmark(overrides),
    iconInView: input.iconInView ?? true,
    cachedIconFailed: input.cachedIconFailed ?? false,
    fallbackFailed: input.fallbackFailed ?? false,
    syncLocalCachedIconUrl: input.syncLocalCachedIconUrl,
    localCachedIconUrl: input.localCachedIconUrl,
    localCachePending: input.localCachePending,
    shouldWaitForLocalIconCache: input.shouldWaitForLocalIconCache,
    iconAccessKey: input.iconAccessKey,
  })
}

describe('bookmark card icon state', () => {
  it('does not return an icon URL before the card is in view', () => {
    const result = state({ icon: 'https://example.com/icon.png', icon_source: 'custom' }, { iconInView: false })

    expect(result.iconUrl).toBe('')
    expect(result.hasRenderableIcon).toBe(false)
    expect(result.shouldReadLocalIconCache).toBe(false)
  })

  it('uses saved logo.surf icons before generated logo icons', () => {
    expect(state({
      icon: 'data:image/svg+xml,saved-logo',
      icon_source: 'logo_surf',
    }).iconUrl).toBe('data:image/svg+xml,saved-logo')

    const generated = state({ icon: null, icon_source: 'logo_surf' }).iconUrl
    expect(generated).toContain('data:image/svg+xml')
    expect(generated).toContain('<svg')
  })

  it('uses the original URL when a saved remote icon has no persisted cache', () => {
    const result = state({
      icon: 'https://favicon.im/example.com?larger=true',
      icon_source: 'logo_surf',
    })

    expect(result.iconUrl).toBe('https://favicon.im/example.com?larger=true')
    expect(result.canUseRawHttpIconFallback).toBe(true)
    expect(result.shouldReadLocalIconCache).toBe(true)
  })

  it('uses embedded icon blobs before remote icon URLs', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_blob: 'data:image/png;base64,cached',
      icon_cached: true,
    })

    expect(result.iconUrl).toBe('data:image/png;base64,cached')
    expect(result.shouldReadLocalIconCache).toBe(false)
  })

  it('uses browser local cache before the bookmark icon proxy', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    }, {
      syncLocalCachedIconUrl: 'data:image/png;base64,local',
    })

    expect(result.iconUrl).toBe('data:image/png;base64,local')
    expect(result.shouldUseIconProxy).toBe(true)
    expect(result.proxiedHttpIconUrl).toContain('/api/icon/42?v=')
  })

  it('uses the bookmark proxy when D1 reports a persisted icon cache', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    })

    expect(result.iconUrl).toContain('/api/icon/42?v=')
    expect(result.shouldUseIconProxy).toBe(true)
  })


  it('falls back to the saved HTTP icon after the bookmark proxy fails', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    }, {
      cachedIconFailed: true,
    })

    expect(result.iconUrl).toBe('https://example.com/icon.png')
    expect(result.hasRenderableIcon).toBe(true)
  })

  it('waits for the persistent cache lookup before using the remote proxy', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    }, {
      localCachePending: true,
      shouldWaitForLocalIconCache: true,
    })

    expect(result.shouldWaitForLocalIconCache).toBe(true)
    expect(result.iconUrl).toBe('')
  })

  it('proxies Iconify names and Iconify URLs through the Iconify endpoint', () => {
    expect(state({ icon: 'mdi:home', icon_source: 'iconify' }).iconUrl).toBe('/api/iconify/mdi/home.svg')
    expect(state({
      icon: 'https://api.iconify.design/logos/github-icon.svg?color=black',
      icon_source: 'custom',
    }).iconUrl).toBe('/api/iconify/logos/github-icon.svg')
  })

  it('uses ordinary HTTP icons directly when no persisted cache exists', () => {
    const result = state({ icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' })

    expect(result.iconUrl).toBe('https://cdn.example.com/icon.png')
    expect(result.canUseRawHttpIconFallback).toBe(true)
    expect(result.shouldReadLocalIconCache).toBe(true)
  })

  it('does not treat custom text icons as image URLs', () => {
    const result = state({ icon: 'TXT', icon_source: 'custom' })

    expect(result.customTextIcon).toBe('TXT')
    expect(result.iconText).toBe('TXT')
    expect(result.iconUrl).toBe('')
    expect(result.shouldReadLocalIconCache).toBe(false)
  })

  it('keeps an icon URL but marks it non-renderable after fallback failure', () => {
    const result = state(
      { icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' },
      { fallbackFailed: true },
    )

    expect(result.iconUrl).toBe('https://cdn.example.com/icon.png')
    expect(result.hasRenderableIcon).toBe(false)
  })

  it('exposes local cache read decisions as a pure helper', () => {
    expect(shouldReadBookmarkLocalIconCache({
      bookmark: bookmark({ icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' }),
      iconInView: true,
    })).toBe(true)

    expect(shouldReadBookmarkLocalIconCache({
      bookmark: bookmark({ icon: 'mdi:home', icon_source: 'iconify' }),
      iconInView: true,
    })).toBe(false)

    const base = deriveBookmarkCardIconBase({
      bookmark: bookmark({ icon: 'data:image/png;base64,raw', icon_source: 'custom' as IconSource }),
      iconInView: true,
      shouldWaitForLocalIconCache: true,
    })

    expect(base.shouldWaitForLocalIconCache).toBe(true)
    expect(base.shouldReadLocalIconCache).toBe(false)
  })
})

// 私密书签（含私密分类下的书签）的图标必须带授权 key，否则服务端按匿名口径返回
// 兜底图——首页就会出现「登录了却只看到占位图标」。同时不能复用本地图标缓存：
// 匿名态缓存过的兜底图会让登录后继续显示兜底。
describe('private bookmark icon access', () => {
  const cachedRemote = { icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' as IconSource, icon_cached: 1 }

  it('adds the access key to the proxied icon URL when authorized', () => {
    const result = state(cachedRemote, { iconAccessKey: 'grant-token' })

    expect(result.requiresIconAccess).toBe(true)
    expect(result.proxiedHttpIconUrl).toContain('/api/icon/42')
    expect(result.proxiedHttpIconUrl).toContain('key=grant-token')
    expect(result.iconUrl).toBe(result.proxiedHttpIconUrl)
  })

  it('never reads or reuses the local icon cache while authorized', () => {
    const result = state(cachedRemote, {
      iconAccessKey: 'grant-token',
      syncLocalCachedIconUrl: 'blob:stale-anonymous-fallback',
      localCachedIconUrl: 'blob:stale-anonymous-fallback',
    })

    expect(result.shouldReadLocalIconCache).toBe(false)
    expect(result.iconUrl).toBe(result.proxiedHttpIconUrl)
  })

  it('changes the icon state key so a failed anonymous load does not block the authorized URL', () => {
    const anonymous = state(cachedRemote)
    const authorized = state(cachedRemote, { iconAccessKey: 'grant-token' })

    expect(anonymous.nextIconStateKey).not.toBe(authorized.nextIconStateKey)
  })

  it('keeps the anonymous path byte-for-byte unchanged without a key', () => {
    const result = state(cachedRemote)

    expect(result.requiresIconAccess).toBe(false)
    expect(result.proxiedHttpIconUrl).not.toContain('key=')
    expect(result.shouldReadLocalIconCache).toBe(true)
  })
})
