import type { PublicBookmark } from '../../shared/types'
import { createIconVersion } from './bookmarkIconDisplay'
import { iconifyProxyIcon, isIconifyIconUrl, logoSurfIcon } from './icons'
import { withIconAccessKey } from './iconAccessKey'
import { createBookmarkIconCacheKey } from './localBookmarkIconCache'

export type BookmarkCardIconStateInput = {
  bookmark: PublicBookmark
  iconInView: boolean
  cachedIconFailed: boolean
  fallbackFailed: boolean
  syncLocalCachedIconUrl?: string
  localCachedIconUrl?: string
  localCachePending?: boolean
  shouldWaitForLocalIconCache?: boolean
  iconAccessKey?: string
}

export type BookmarkCardIconBaseInput = {
  bookmark: PublicBookmark
  iconInView: boolean
  shouldWaitForLocalIconCache?: boolean
  // 私密书签（或挂在私密分类下）的图标需要短期授权 key。非空时图标只走带授权的
  // 代理 URL，并**完全跳过本地图标缓存**：匿名态写进去的兜底图会让登录后仍显示
  // 兜底，反过来带 key 取到的真实图标也不该落到同一台机器的共享缓存里（PROB-20）。
  iconAccessKey?: string
}

export type BookmarkCardIconBaseState = {
  iconInView: boolean
  rawIcon: string
  cachedIcon: string
  customTextIcon: string
  iconText: string
  localCacheKey: string
  hasEmbeddedIcon: boolean
  hasCachedRemoteIcon: boolean
  iconifyRemoteUrl: string
  canUseRawHttpIconFallback: boolean
  shouldReadLocalIconCache: boolean
  shouldUseIconProxy: boolean
  shouldWaitForLocalIconCache: boolean
  proxiedHttpIconUrl: string
  requiresIconAccess: boolean
  nextIconStateKey: string
}

export type BookmarkCardIconUrlInput = {
  bookmark: PublicBookmark
  baseState: BookmarkCardIconBaseState
  cachedIconFailed: boolean
  fallbackFailed: boolean
  syncLocalCachedIconUrl?: string
  localCachedIconUrl?: string
  localCachePending?: boolean
}

export type BookmarkCardIconUrlState = {
  iconUrl: string
  hasRenderableIcon: boolean
}

export type BookmarkCardIconState = BookmarkCardIconBaseState & BookmarkCardIconUrlState

export function createBookmarkCardIconStateKey(
  bookmark: PublicBookmark,
  iconInView: boolean,
  requiresIconAccess = false,
): string {
  // 授权态参与键：从匿名切到带 key（或反过来）时必须重置失败标记，否则匿名态的
  // 「加载失败」会挡住换 key 之后的新 URL。
  return `${bookmark.id}:${bookmark.icon_source ?? ''}:${bookmark.icon ?? ''}:${bookmark.icon_blob ?? ''}:${bookmark.title}:${bookmark.url}:${iconInView}:${requiresIconAccess ? 'auth' : 'anon'}`
}

export function deriveBookmarkCardIconBase(input: BookmarkCardIconBaseInput): BookmarkCardIconBaseState {
  const { bookmark, iconInView, shouldWaitForLocalIconCache = false, iconAccessKey = '' } = input
  const requiresIconAccess = Boolean(iconAccessKey)
  const rawIcon = bookmark.icon?.trim() ?? ''
  const cachedIcon = bookmark.icon_blob?.trim() ?? ''
  const customTextIcon =
    rawIcon &&
    bookmark.icon_source !== 'logo_surf' &&
    bookmark.icon_source !== 'iconify' &&
    !isIconifyIconUrl(rawIcon) &&
    !/^data:image\//i.test(rawIcon) &&
    !/^https?:\/\//i.test(rawIcon)
      ? rawIcon
      : ''
  const iconText = customTextIcon || bookmark.title.trim().slice(0, 1) || '书'
  const localCacheKey = createBookmarkIconCacheKey({
    id: bookmark.id,
    icon: rawIcon,
    iconSource: bookmark.icon_source,
  })
  const hasEmbeddedIcon = /^data:image\//i.test(cachedIcon)
  const hasCachedRemoteIcon = Boolean(bookmark.icon_cached) && !hasEmbeddedIcon
  const iconifyRemoteUrl =
    bookmark.icon_source === 'iconify' || isIconifyIconUrl(rawIcon)
      ? iconifyProxyIcon(rawIcon)
      : ''
  const canUseRawHttpIconFallback =
    /^https?:\/\//i.test(rawIcon) &&
    !iconifyRemoteUrl &&
    !customTextIcon
  const shouldReadLocalIconCache =
    !requiresIconAccess &&
    iconInView &&
    (canUseRawHttpIconFallback || hasCachedRemoteIcon) &&
    !iconifyRemoteUrl &&
    !hasEmbeddedIcon &&
    !customTextIcon
  const shouldUseIconProxy = hasCachedRemoteIcon
  const proxiedHttpIconUrl = shouldUseIconProxy
    ? withIconAccessKey(
      `/api/icon/${encodeURIComponent(String(bookmark.id))}?v=${createIconVersion(`${bookmark.id}:${rawIcon}:${bookmark.title}:${bookmark.url}`)}`,
      iconAccessKey,
    )
    : ''

  return {
    iconInView,
    rawIcon,
    cachedIcon,
    customTextIcon,
    iconText,
    localCacheKey,
    hasEmbeddedIcon,
    hasCachedRemoteIcon,
    iconifyRemoteUrl,
    canUseRawHttpIconFallback,
    shouldReadLocalIconCache,
    shouldUseIconProxy,
    shouldWaitForLocalIconCache,
    proxiedHttpIconUrl,
    requiresIconAccess,
    nextIconStateKey: createBookmarkCardIconStateKey(bookmark, iconInView, requiresIconAccess),
  }
}

export function shouldReadBookmarkLocalIconCache(input: BookmarkCardIconBaseInput): boolean {
  return deriveBookmarkCardIconBase(input).shouldReadLocalIconCache
}

export function deriveBookmarkCardIconUrl(input: BookmarkCardIconUrlInput): BookmarkCardIconUrlState {
  const {
    bookmark,
    baseState,
    cachedIconFailed,
    fallbackFailed,
    syncLocalCachedIconUrl = '',
    localCachedIconUrl = '',
    localCachePending = false,
  } = input
  const {
    rawIcon,
    cachedIcon,
    customTextIcon,
    hasEmbeddedIcon,
    hasCachedRemoteIcon,
    iconifyRemoteUrl,
    shouldUseIconProxy,
    shouldWaitForLocalIconCache,
    proxiedHttpIconUrl,
  } = baseState

  const iconUrl = (() => {
    if (!baseState.iconInView) return ''
    if (!cachedIconFailed && hasEmbeddedIcon) return cachedIcon
    if (bookmark.icon_source === 'logo_surf' && !rawIcon) return logoSurfIcon(bookmark.title, bookmark.url)
    if (bookmark.icon_source === 'logo_surf' && /^data:image\//i.test(rawIcon)) return rawIcon
    // 私密对象不使用本地缓存：匿名态缓存下来的兜底图会让登录后继续显示兜底。
    if (!baseState.requiresIconAccess) {
      if (syncLocalCachedIconUrl) return syncLocalCachedIconUrl
      if (localCachedIconUrl) return localCachedIconUrl
    }
    if (localCachePending && shouldWaitForLocalIconCache) return ''
    if ((!rawIcon && !hasCachedRemoteIcon) || customTextIcon) return ''
    if (iconifyRemoteUrl) return iconifyRemoteUrl
    if (/^data:image\//i.test(rawIcon)) return rawIcon
    if (shouldUseIconProxy && !cachedIconFailed) return proxiedHttpIconUrl
    if (baseState.canUseRawHttpIconFallback) return rawIcon
    return ''
  })()

  return {
    iconUrl,
    hasRenderableIcon: Boolean(iconUrl) && !fallbackFailed,
  }
}

export function deriveBookmarkCardIconState(input: BookmarkCardIconStateInput): BookmarkCardIconState {
  const baseState = deriveBookmarkCardIconBase({
    bookmark: input.bookmark,
    iconInView: input.iconInView,
    shouldWaitForLocalIconCache: input.shouldWaitForLocalIconCache,
    iconAccessKey: input.iconAccessKey,
  })
  const urlState = deriveBookmarkCardIconUrl({
    bookmark: input.bookmark,
    baseState,
    cachedIconFailed: input.cachedIconFailed,
    fallbackFailed: input.fallbackFailed,
    syncLocalCachedIconUrl: input.syncLocalCachedIconUrl,
    localCachedIconUrl: input.localCachedIconUrl,
    localCachePending: input.localCachePending,
  })

  return {
    ...baseState,
    ...urlState,
  }
}
