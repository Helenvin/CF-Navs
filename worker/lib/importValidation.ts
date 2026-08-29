import type { Bookmark, Category, ImportReq } from '../../shared/types'
import { normalizeCategoryParentId, validateCategoryHierarchy } from '../../shared/categoryHierarchy'
import { normalizeBookmarkUrl } from '../../shared/urlPolicy'

export type ImportValidationResult =
  | { ok: true; payload: ImportReq; droppedBookmarks: number }
  | { ok: false; message: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// 之前完全不限长度。一次超大 payload 就能打爆 Worker CPU 和 D1 语句配额，
// 而用户导入一个超大浏览器书签文件是完全正常的操作路径——现在的表现会是一个
// 没有任何解释的 500。给出明确上限，让用户知道该拆分文件。
export const MAX_IMPORT_CATEGORIES = 2000
export const MAX_IMPORT_BOOKMARKS = 20000

function isValidCategory(value: unknown): value is Category {
  if (!isPlainObject(value)) return false
  return (
    Number.isInteger(value.id) &&
    (value.id as number) > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    (value.parent_id === undefined || value.parent_id === null || (Number.isInteger(value.parent_id) && Number(value.parent_id) > 0)) &&
    (value.icon === null || value.icon === undefined || typeof value.icon === 'string')
    && (value.is_private === undefined || value.is_private === true || value.is_private === false || value.is_private === 0 || value.is_private === 1)
  )
}

function isValidBookmark(value: unknown): value is Bookmark {
  if (!isPlainObject(value)) return false
  return (
    Number.isInteger(value.id) &&
    (value.id as number) > 0 &&
    Number.isInteger(value.category_id) &&
    (value.category_id as number) > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
      typeof value.url === 'string' &&
    value.url.trim().length > 0 &&
    (value.description_mode === null || value.description_mode === undefined || value.description_mode === 'always' || value.description_mode === 'hover' || value.description_mode === 'hidden') &&
    (value.is_private === undefined || value.is_private === true || value.is_private === false || value.is_private === 0 || value.is_private === 1)
  )
}

export function validateImportPayload(body: unknown): ImportValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'invalid import payload' }
  }

  if (!Array.isArray(body.categories) || !Array.isArray(body.bookmarks)) {
    return { ok: false, message: 'categories / bookmarks must be arrays' }
  }
  if (body.categories.length > MAX_IMPORT_CATEGORIES) {
    return { ok: false, message: `too many categories, limit is ${MAX_IMPORT_CATEGORIES}` }
  }
  if (body.bookmarks.length > MAX_IMPORT_BOOKMARKS) {
    return { ok: false, message: `too many bookmarks, limit is ${MAX_IMPORT_BOOKMARKS}` }
  }
  if (!body.categories.every(isValidCategory)) {
    return { ok: false, message: 'invalid category in payload' }
  }
  if (!body.bookmarks.every(isValidBookmark)) {
    return { ok: false, message: 'invalid bookmark in payload' }
  }

  const categoryIds = new Set<number>()
  const normalizedCategories = body.categories.map((category) => ({
    ...category,
    parent_id: normalizeCategoryParentId(category.parent_id),
  }))
  for (const category of normalizedCategories) {
    if (categoryIds.has(category.id)) {
      return { ok: false, message: `duplicate category id: ${category.id}` }
    }
    categoryIds.add(category.id)
  }

  const hierarchyError = validateCategoryHierarchy(normalizedCategories)
  if (hierarchyError) return { ok: false, message: hierarchyError }

  const bookmarkIds = new Set<number>()
  for (const bookmark of body.bookmarks) {
    if (bookmarkIds.has(bookmark.id)) {
      return { ok: false, message: `duplicate bookmark id: ${bookmark.id}` }
    }
    bookmarkIds.add(bookmark.id)

    if (!categoryIds.has(bookmark.category_id)) {
      return { ok: false, message: `bookmark ${bookmark.id} references missing category ${bookmark.category_id}` }
    }
  }

  // 协议不合规的书签跳过而不是整批失败：导入来源包括用户自己的历史备份，
  // 为了一条 `javascript:` 小书签让整次恢复失败是更糟的结果。缺协议的写法
  // 会被补成 https 保住，跳过数通过 ImportResp.skipped_bookmarks 如实上报。
  const normalizedBookmarks: Bookmark[] = []
  for (const bookmark of body.bookmarks) {
    const url = normalizeBookmarkUrl(bookmark.url)
    if (url) normalizedBookmarks.push(url === bookmark.url ? bookmark : { ...bookmark, url })
  }
  const droppedBookmarks = body.bookmarks.length - normalizedBookmarks.length

  if (body.settings !== undefined && !isPlainObject(body.settings)) {
    return { ok: false, message: 'invalid settings' }
  }
  if (body.mode !== undefined && body.mode !== 'replace' && body.mode !== 'merge') {
    return { ok: false, message: 'invalid import mode' }
  }

  const payload: ImportReq = {
    categories: normalizedCategories,
    bookmarks: normalizedBookmarks,
  }
  if (body.settings !== undefined) payload.settings = body.settings
  if (body.mode !== undefined) payload.mode = body.mode
  return { ok: true, payload, droppedBookmarks }
}
