<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { PublicBookmark } from '../../shared/types'
  import {
    deriveBookmarkCardIconBase,
    deriveBookmarkCardIconUrl,
  } from '../lib/bookmarkCardIconState'
  import { buildIconStyle } from '../lib/bookmarkIconDisplay'
  import {
    fetchAndCacheBookmarkIconUrl,
    fetchCachedBookmarkIconUrl,
    readCachedBookmarkIconDataUri,
    revokeLocalIconUrl,
  } from '../lib/localBookmarkIconCache'
  import BookmarkIcon from './BookmarkIcon.svelte'

  const ICON_SIZE = 30

  export let bookmark: PublicBookmark
  // 私密书签的图标授权 key；非空时跳过本地图标缓存，直接走带授权的代理 URL。
  export let iconAccessKey = ''

  let cachedIconFailed = false
  let fallbackFailed = false
  let localCachedIconUrl = ''
  let syncLocalCachedIconUrl = ''
  let localCachePending = false
  let iconStateKey = ''
  const localCacheRequest = { current: 0 }

  $: iconBaseState = deriveBookmarkCardIconBase({
    bookmark,
    iconInView: true,
    shouldWaitForLocalIconCache: true,
    iconAccessKey,
  })
  $: iconText = iconBaseState.iconText
  $: localCacheKey = iconBaseState.localCacheKey
  $: syncLocalCachedIconUrl = iconBaseState.requiresIconAccess
    ? ''
    : readCachedBookmarkIconDataUri(localCacheKey) ?? ''
  $: iconUrlState = deriveBookmarkCardIconUrl({
    bookmark,
    baseState: iconBaseState,
    cachedIconFailed,
    fallbackFailed,
    syncLocalCachedIconUrl,
    localCachedIconUrl,
    localCachePending,
  })
  $: iconUrl = iconUrlState.hasRenderableIcon ? iconUrlState.iconUrl : ''
  $: iconStyle = buildIconStyle(ICON_SIZE, {
    customBackground: bookmark.icon_background_color ?? '',
  })
  $: if (iconBaseState.nextIconStateKey !== iconStateKey) {
    iconStateKey = iconBaseState.nextIconStateKey
    cachedIconFailed = false
    fallbackFailed = false
    resetLocalCachedIconUrl()
    if (iconBaseState.shouldReadLocalIconCache) {
      void loadLocalCachedIcon(
        iconBaseState.localCacheKey,
        iconBaseState.shouldWaitForLocalIconCache,
        iconBaseState.shouldUseIconProxy ? iconBaseState.proxiedHttpIconUrl : '',
      )
    } else {
      localCacheRequest.current += 1
      localCachePending = false
    }
  }

  function resetLocalCachedIconUrl(): void {
    if (!localCachedIconUrl) return
    revokeLocalIconUrl(localCachedIconUrl)
    localCachedIconUrl = ''
  }

  async function loadLocalCachedIcon(cacheKey: string, waitForLocalCache: boolean, remoteUrl: string): Promise<void> {
    if (waitForLocalCache) localCachePending = true

    const result = await fetchCachedBookmarkIconUrl(cacheKey, localCacheRequest)
    if (result.stale) return
    const requestSequence = localCacheRequest.current
    if (result.url) {
      resetLocalCachedIconUrl()
      localCachedIconUrl = result.url
      localCachePending = false
      return
    }

    if (remoteUrl) {
      const cachedRemoteUrl = await fetchAndCacheBookmarkIconUrl(cacheKey, remoteUrl)
      if (requestSequence !== localCacheRequest.current) {
        if (cachedRemoteUrl) revokeLocalIconUrl(cachedRemoteUrl)
        return
      }
      if (cachedRemoteUrl) {
        resetLocalCachedIconUrl()
        localCachedIconUrl = cachedRemoteUrl
        localCachePending = false
        return
      }
    }

    localCachePending = false
  }

  function handleIconError(): void {
    if (localCachedIconUrl) {
      resetLocalCachedIconUrl()
      return
    }

    if (!cachedIconFailed && (iconBaseState.hasEmbeddedIcon || iconBaseState.shouldUseIconProxy)) {
      cachedIconFailed = true
      return
    }

    fallbackFailed = true
  }

  function handleIconLoad(): void {
    localCachePending = false
    fallbackFailed = false
  }

  onDestroy(() => {
    localCacheRequest.current += 1
    resetLocalCachedIconUrl()
  })
</script>

<span class="spotlight-option-icon" aria-hidden="true">
  <BookmarkIcon
    title={bookmark.title}
    {iconUrl}
    {iconText}
    size={ICON_SIZE}
    {iconStyle}
    hasCustomBackground={Boolean(bookmark.icon_background_color)}
    variant="compact"
    onError={handleIconError}
    onLoad={handleIconLoad}
  />
</span>

<style>
  .spotlight-option-icon {
    display: block;
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    overflow: hidden;
    border-radius: var(--radius-sm);
  }

  .spotlight-option-icon :global(.bookmark-icon) {
    border-radius: var(--radius-sm);
  }
</style>
