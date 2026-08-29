// 书签 CRUD、批量排序、图标数据读取与 icon_blob 写入

import { type Bookmark, type BookmarkUpsertReq } from '../../../shared/types'
import { BOOKMARK_LIST_SQL } from './sql'
import { withSchemaRetry } from './schema'
import { sortRowsByIds } from './sort'

export async function listBookmarks(db: D1Database): Promise<Bookmark[]> {
  return await withSchemaRetry(db, async () => {
    const { results } = await db
      .prepare(BOOKMARK_LIST_SQL)
      .all<Bookmark>()
    return results ?? []
  })
}

export interface BookmarkIconData {
  title: string
  url: string
  icon: string | null
  icon_source: Bookmark['icon_source']
  icon_blob: string | null
}

export async function getBookmarkIconData(db: D1Database, id: number): Promise<BookmarkIconData | null> {
  return await withSchemaRetry(db, async () => (
    await db
      .prepare('SELECT title, url, icon, icon_source, icon_blob FROM bookmarks WHERE id = ?')
      .bind(id)
      .first<BookmarkIconData>()
  ))
}

export async function createBookmark(db: D1Database, req: BookmarkUpsertReq): Promise<Bookmark | null> {
  const now = Date.now()
  const open_method: 1 | 2 | 3 = req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : 1
  return await withSchemaRetry(db, async () => (
    await db
      .prepare(
        `INSERT INTO bookmarks (
           category_id, title, url, internal_url, icon, icon_source, icon_background_color,
           description, description_mode, open_method, is_private, sort, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort) FROM bookmarks WHERE category_id = ?), -1) + 1, ?
         WHERE EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id, category_id, title, url, internal_url, icon, icon_source, icon_background_color, icon_blob, description, description_mode, open_method, is_private, sort, click_count, created_at`,
      )
      .bind(
        req.category_id,
        req.title,
        req.url,
        req.internal_url ?? null,
        req.icon ?? null,
        req.icon_source ?? null,
        req.icon_background_color ?? null,
        req.description ?? null,
        req.description_mode ?? null,
        open_method,
        req.is_private ? 1 : 0,
        req.category_id,
        now,
        req.category_id,
      )
      .first<Bookmark>()
  ))
}

export async function updateBookmark(
  db: D1Database,
  id: number,
  req: BookmarkUpsertReq,
): Promise<Bookmark | null> {
  const nextIcon = req.icon ?? null
  const nextIconSource = req.icon_source ?? null
  const openMethod: 1 | 2 | 3 | null =
    req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : req.open_method === 1 ? 1 : null
  const hasDescriptionMode = Object.prototype.hasOwnProperty.call(req, 'description_mode')
  return await withSchemaRetry(db, async () => (
    await db
      .prepare(
        `UPDATE bookmarks
         SET category_id = ?,
             title = ?,
             url = ?,
             internal_url = ?,
             icon_blob = CASE
               WHEN ((icon IS NULL AND ? IS NULL) OR icon = ?)
                AND ((icon_source IS NULL AND ? IS NULL) OR icon_source = ?)
               THEN icon_blob
               ELSE NULL
             END,
             icon = ?,
             icon_source = ?,
             icon_background_color = ?,
             description = ?,
             description_mode = CASE WHEN ? = 0 THEN description_mode ELSE ? END,
             open_method = COALESCE(?, open_method),
             is_private = ?
         WHERE id = ? AND EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id, category_id, title, url, internal_url, icon, icon_source, icon_background_color, icon_blob, description, description_mode, open_method, is_private, sort, click_count, created_at`,
      )
      .bind(
        req.category_id,
        req.title,
        req.url,
        req.internal_url ?? null,
        nextIcon,
        nextIcon,
        nextIconSource,
        nextIconSource,
        nextIcon,
        nextIconSource,
        req.icon_background_color ?? null,
        req.description ?? null,
        hasDescriptionMode ? 1 : 0,
        req.description_mode ?? null,
        openMethod,
        req.is_private ? 1 : 0,
        id,
        req.category_id,
      )
      .first<Bookmark>()
  ))
}

export async function deleteBookmark(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run()
  return (res.meta.changes ?? 0) > 0
}

export async function batchDeleteBookmarks(db: D1Database, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const results = await db.batch(ids.map((id) => db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id)))
  return results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0)
}

export async function sortBookmarks(db: D1Database, ids: number[]): Promise<void> {
  await sortRowsByIds(db, 'bookmarks', ids)
}

export async function reorganizeBookmarks(
  db: D1Database,
  categoryOrders: Array<{ category_id: number; ids: number[] }>,
): Promise<void> {
  const categoryIds = new Set<number>()
  const bookmarkToCategory = new Map<number, number>()

  for (const order of categoryOrders) {
    if (categoryIds.has(order.category_id)) throw new Error('duplicate category order')
    categoryIds.add(order.category_id)
    for (const id of order.ids) {
      if (bookmarkToCategory.has(id)) throw new Error('duplicate bookmark order')
      bookmarkToCategory.set(id, order.category_id)
    }
  }

  const { results: categories } = await db.prepare('SELECT id FROM categories').all<{ id: number }>()
  const { results: bookmarks } = await db.prepare('SELECT id FROM bookmarks').all<{ id: number }>()

  const existingCategoryIds = new Set((categories ?? []).map((category) => category.id))
  if ([...categoryIds].some((id) => !existingCategoryIds.has(id))) throw new Error('category not found')

  const existingBookmarkIds = new Set((bookmarks ?? []).map((bookmark) => bookmark.id))
  if (existingBookmarkIds.size !== bookmarkToCategory.size || [...existingBookmarkIds].some((id) => !bookmarkToCategory.has(id))) {
    throw new Error('bookmark order must include every bookmark')
  }

  const updates = [...bookmarkToCategory].map(([bookmarkId, categoryId]) => (
    db.prepare('UPDATE bookmarks SET category_id = ? WHERE id = ?').bind(categoryId, bookmarkId)
  ))
  for (let start = 0; start < updates.length; start += 50) {
    await db.batch(updates.slice(start, start + 50))
  }

  for (const order of categoryOrders) {
    await sortRowsByIds(db, 'bookmarks', order.ids)
  }
}

export async function setIconBlob(db: D1Database, id: number, blob: string | null): Promise<void> {
  await db
    .prepare("UPDATE bookmarks SET icon_blob = ? WHERE id = ?")
    .bind(blob, id)
    .run()
}

export async function incrementBookmarkClick(db: D1Database, id: number): Promise<boolean> {
  return await withSchemaRetry(db, async () => {
    const res = await db
      .prepare("UPDATE bookmarks SET click_count = COALESCE(click_count, 0) + 1 WHERE id = ?")
      .bind(id)
      .run()
    return (res.meta.changes ?? 0) > 0
  })
}
