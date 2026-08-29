<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { CardStyle, DescriptionDisplayMode, PublicBookmark } from '../../shared/types'
  import BookmarkCardCompact from './BookmarkCardCompact.svelte'
  import { publicStore } from '../lib/stores'
  import { api } from '../lib/api'
  import BookmarkCardInfo from './BookmarkCardInfo.svelte'
  import BookmarkContextMenu from './BookmarkContextMenu.svelte'
  import BookmarkLinkModal from './BookmarkLinkModal.svelte'
  import { getIconCardTrackWidth } from '../lib/bookmarkCardLayout'
  import { buildIconStyle } from '../lib/bookmarkIconDisplay'
  import {
    BOOKMARK_CONTEXT_MENU_OPEN_EVENT,
    canOpenBookmarkContextMenu,
    createBookmarkContextMenuOpenEvent,
    isExternalContextMenuOpenEvent,
    shouldBlockCardNavigation,
    shouldOpenBookmarkModal,
  } from '../lib/bookmarkCardInteractions'
  import {
    deriveBookmarkCardIconBase,
    deriveBookmarkCardIconUrl,
  } from '../lib/bookmarkCardIconState'
  import { observeIconVisibility } from '../lib/iconVisibility'
  import {
    fetchCachedBookmarkIconUrl,
    readCachedBookmarkIconDataUri,
    revokeLocalIconUrl,
  } from '../lib/localBookmarkIconCache'

  type AsyncVoid<T = void> = T | Promise<T>

  export let bookmark: PublicBookmark
  export let style: CardStyle = 'info'
  export let iconSize: number = 100
  export let showDescription: boolean = true
  export let descriptionMode: DescriptionDisplayMode = showDescription ? 'always' : 'hidden'
  export let showIconTitle: boolean = true
  export let width: number = 200
  export let height: number = 0
  export let canEdit = false
  export let sortMode = false
  export let preview = false
  export let themeOverride: 'light' | 'dark' | null = null
  export let onEdit: ((bookmark: PublicBookmark) => AsyncVoid) | undefined = undefined

  let cachedIconFailed = false
  let fallbackFailed = false
  let localCachedIconUrl = ''
  let syncLocalCachedIconUrl = ''
  let localCachePending = false
  let localCacheRequestId = 0
  let iconInView = false
  let shellElement: HTMLDivElement | null = null
  let stopIconVisibilityObserver: (() => void) | null = null
  let contextMenuOpen = false
  let modalOpen = false
  let iconStateKey = ''
  let windowListenersAttached = false
  let contextMenuInstanceId = Math.random().toString(36).slice(2)

  $: openInNewTab = bookmark.open_method === 1
  $: iconBaseState = deriveBookmarkCardIconBase({
    bookmark,
    iconInView,
  })
  $: cachedIcon = iconBaseState.cachedIcon
  $: iconText = iconBaseState.iconText
  $: nextIconStateKey = iconBaseState.nextIconStateKey
  $: localCacheKey = iconBaseState.localCacheKey
  $: shouldReadLocalIconCache = iconBaseState.shouldReadLocalIconCache
  $: shouldWaitForLocalIconCache = iconBaseState.shouldWaitForLocalIconCache
  $: syncLocalCachedIconUrl = iconInView && !iconBaseState.hasEmbeddedIcon
    ? readCachedBookmarkIconDataUri(localCacheKey) ?? ''
    : ''
  $: iconUrlState = deriveBookmarkCardIconUrl({
    bookmark,
    baseState: iconBaseState,
    cachedIconFailed,
    fallbackFailed,
    syncLocalCachedIconUrl,
    localCachedIconUrl,
    localCachePending,
  })
  $: iconUrl = iconUrlState.iconUrl
  $: hasRenderableIcon = iconUrlState.hasRenderableIcon
  $: infoCardHeight = height > 0 ? height : 70
  $: infoIconInset = infoCardHeight <= 56 ? 6 : 8
  $: infoIconSize = Math.max(32, Math.min(infoCardHeight - infoIconInset * 2, width - infoIconInset * 2))
  $: compactIconSize = Math.max(0, iconSize)
  $: compactShellWidth = getIconCardTrackWidth(compactIconSize, showIconTitle)
  $: iconBackgroundColor = bookmark.icon_background_color || ''
  $: hasCustomIconBackground = Boolean(iconBackgroundColor)
  $: infoIconStyle = buildIconStyle(infoIconSize, { customBackground: iconBackgroundColor })
  $: compactIconStyle = buildIconStyle(compactIconSize, {
    compact: true,
    customBackground: iconBackgroundColor,
  })
  $: tooltipText = bookmark.description ? `${bookmark.title}\n${bookmark.description}` : bookmark.title
  $: cardShellStyle =
    style === 'info'
      ? `--card-configured-min-width: ${Math.max(0, width)}px; ${height > 0 ? `height: ${height}px;` : ''}`
      : `width: ${compactShellWidth}px;`
  $: cardLinkStyle = height > 0 ? `height: ${height}px;` : ''
  $: if (nextIconStateKey !== iconStateKey) {
    iconStateKey = nextIconStateKey
    cachedIconFailed = false
    fallbackFailed = false
    resetLocalCachedIconUrl()
    if (shouldReadLocalIconCache) {
      void loadLocalCachedIcon(localCacheKey, shouldWaitForLocalIconCache)
    } else {
      localCachePending = false
    }
  }
  $: syncWindowListeners(contextMenuOpen || modalOpen)

  function resetLocalCachedIconUrl() {
    if (localCachedIconUrl) {
      revokeLocalIconUrl(localCachedIconUrl)
      localCachedIconUrl = ''
    }
  }

  async function loadLocalCachedIcon(cacheKey: string, waitForLocalCache: boolean) {
    if (waitForLocalCache) {
      localCachePending = true
    }

    const result = await fetchCachedBookmarkIconUrl(cacheKey, { current: localCacheRequestId })
    if (result.stale) return
    if (result.url) {
      resetLocalCachedIconUrl()
      localCachedIconUrl = result.url
    }
    localCachePending = false
  }

  function handleIconError() {
    if (localCachedIconUrl) {
      resetLocalCachedIconUrl()
      return
    }

    if (!cachedIconFailed && /^data:image\//i.test(cachedIcon)) {
      cachedIconFailed = true
      return
    }

    fallbackFailed = true
  }

  function handleIconLoad() {
    localCachePending = false
    fallbackFailed = false
  }

  function closeContextMenu() {
    contextMenuOpen = false
  }

  function notifyContextMenuOpen() {
    window.dispatchEvent(createBookmarkContextMenuOpenEvent(contextMenuInstanceId))
  }

  function handleContextMenuOpenEvent(event: Event) {
    if (isExternalContextMenuOpenEvent(event, contextMenuInstanceId)) {
      closeContextMenu()
    }
  }

  function handleContextMenu(event: MouseEvent) {
    if (shouldBlockCardNavigation(sortMode)) {
      event.preventDefault()
      return
    }
    if (!canOpenBookmarkContextMenu({ sortMode, canEdit, hasEditHandler: Boolean(onEdit) })) return
    event.preventDefault()
    event.stopPropagation()
    notifyContextMenuOpen()
    contextMenuOpen = true
  }

  async function handleEditClick() {
    closeContextMenu()
    await onEdit?.(bookmark)
  }

  function handleLinkClick(event: MouseEvent) {
    if (preview) {
      event.preventDefault()
      return
    }
    if (shouldBlockCardNavigation(sortMode)) {
      event.preventDefault()
      return
    }

    // Register click both locally and on server
    publicStore.incrementClick(bookmark.id)
    void api.public.registerClick(bookmark.id)

    if (!shouldOpenBookmarkModal({ sortMode, openMethod: bookmark.open_method })) return
    event.preventDefault()
    modalOpen = true
  }

  function closeModal() {
    modalOpen = false
  }

  function handleWindowClick() {
    if (contextMenuOpen) closeContextMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (modalOpen && event.key === 'Escape') closeModal()
    if (contextMenuOpen && event.key === 'Escape') closeContextMenu()
  }

  function markIconInView() {
    iconInView = true
    disconnectIconObserver()
  }

  function disconnectIconObserver() {
    stopIconVisibilityObserver?.()
    stopIconVisibilityObserver = null
  }

  function setupIconObserver() {
    disconnectIconObserver()
    if (iconInView) return

    if (shellElement) {
      stopIconVisibilityObserver = observeIconVisibility(shellElement, markIconInView)
    } else {
      iconInView = true
    }
  }

  function syncWindowListeners(active: boolean) {
    if (typeof window === 'undefined') return

    if (active && !windowListenersAttached) {
      window.addEventListener('click', handleWindowClick)
      window.addEventListener('keydown', handleDocumentKeydown)
      window.addEventListener(BOOKMARK_CONTEXT_MENU_OPEN_EVENT, handleContextMenuOpenEvent)
      windowListenersAttached = true
      return
    }

    if (!active && windowListenersAttached) {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('keydown', handleDocumentKeydown)
      window.removeEventListener(BOOKMARK_CONTEXT_MENU_OPEN_EVENT, handleContextMenuOpenEvent)
      windowListenersAttached = false
    }
  }

  onMount(() => {
    setupIconObserver()
  })

  onDestroy(() => {
    localCacheRequestId += 1
    disconnectIconObserver()
    resetLocalCachedIconUrl()
    syncWindowListeners(false)
  })
</script>

<div
  class="bookmark-card-shell"
  class:is-info={style === 'info'}
  class:is-icon={style !== 'info'}
  class:sort-mode={sortMode}
  style={cardShellStyle}
  bind:this={shellElement}
>
  {#if style === 'info'}
    <BookmarkCardInfo
      {bookmark}
      {openInNewTab}
      {sortMode}
      {cardLinkStyle}
      {showDescription}
      {descriptionMode}
      {tooltipText}
      iconUrl={hasRenderableIcon ? iconUrl : ''}
      {iconText}
      {infoIconSize}
      {infoIconStyle}
      {hasCustomIconBackground}
      {preview}
      {themeOverride}
      onLinkClick={handleLinkClick}
      onContextMenu={handleContextMenu}
      onIconError={handleIconError}
      onIconLoad={handleIconLoad}
    />
  {:else}
    <BookmarkCardCompact
      {bookmark}
      {openInNewTab}
      {sortMode}
      {tooltipText}
      {compactIconSize}
      {compactIconStyle}
      {showIconTitle}
      iconUrl={hasRenderableIcon ? iconUrl : ''}
      {iconText}
      {hasCustomIconBackground}
      {preview}
      {themeOverride}
      onLinkClick={handleLinkClick}
      onContextMenu={handleContextMenu}
      onIconError={handleIconError}
      onIconLoad={handleIconLoad}
    />
  {/if}

  {#if canEdit && onEdit}
    <button
      type="button"
      class="bookmark-edit-button"
      aria-label={`编辑书签：${bookmark.title}`}
      title="编辑书签"
      on:click|stopPropagation={handleEditClick}
    >
      编辑
    </button>
  {/if}

  {#if contextMenuOpen}
    <BookmarkContextMenu onEdit={handleEditClick} />
  {/if}

  {#if modalOpen}
    <BookmarkLinkModal title={bookmark.title} url={bookmark.url} onClose={closeModal} />
  {/if}
</div>

<style>
  .bookmark-card-shell {
    position: relative;
    min-width: 0;
    contain: layout style;
  }

  .bookmark-card-shell.is-info {
    width: 100%;
    min-width: var(--card-configured-min-width, 200px);
  }

  .bookmark-card-shell.is-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 auto;
  }

  .bookmark-edit-button {
    position: absolute;
    top: 50%;
    right: 0.65rem;
    z-index: 3;
    min-height: 2rem;
    padding: 0.28rem 0.68rem;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.7rem;
    color: var(--card-text-color, #334155);
    background: rgba(255, 255, 255, 0.88);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-50%);
    transition: opacity var(--transition-fast), transform var(--transition-fast);
  }

  .bookmark-card-shell.is-info .bookmark-edit-button {
    right: 0.72rem;
  }

  .bookmark-card-shell:hover .bookmark-edit-button,
  .bookmark-card-shell:focus-within .bookmark-edit-button,
  .bookmark-edit-button:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .bookmark-edit-button:hover {
    border-color: rgba(37, 99, 235, 0.35);
    color: #1d4ed8;
    transform: translateY(-50%) scale(1.02);
  }

  :global([data-theme='dark']) .bookmark-edit-button {
    border-color: rgba(148, 163, 184, 0.28);
    color: #e2e8f0;
    background: rgba(30, 41, 59, 0.92);
  }

  @media (hover: none), (max-width: 720px) {
    .bookmark-edit-button {
      opacity: 1;
      pointer-events: auto;
    }
  }

  @media (max-width: 500px) {
    .bookmark-card-shell.is-info {
      min-width: 0;
    }

    .bookmark-edit-button {
      right: 0.55rem;
      min-height: 1.9rem;
      padding: 0.24rem 0.56rem;
      font-size: 0.74rem;
    }
  }

</style>

