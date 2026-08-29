// 浏览器书签单向同步：所有新书签进入固定的“浏览器新增收藏”分类。

import type { BrowserSyncBookmark, BrowserSyncResp, Category } from '../../../shared/types'
import { isAllowedBookmarkUrl } from '../../../shared/urlPolicy'
import { ensureSchema } from './schema'

export const BROWSER_SYNC_CATEGORY_TITLE = '浏览器新增收藏'

export async function ensureBrowserSyncCategory(db: D1Database): Promise<Category> {
  await ensureSchema(db)

  const existing = await db
    .prepare('SELECT id, parent_id, title, icon, is_private, sort, created_at FROM categories WHERE parent_id IS NULL AND title = ? ORDER BY id ASC LIMIT 1')
    .bind(BROWSER_SYNC_CATEGORY_TITLE)
    .first<Category>()
  if (existing) return existing

  const now = Date.now()
  const created = await db
    .prepare(
      `INSERT INTO categories (parent_id, title, icon, is_private, sort, created_at)
       SELECT NULL, ?, NULL, 0, COALESCE(MAX(sort), -1) + 1, ?
       FROM categories WHERE parent_id IS NULL
       RETURNING id, parent_id, title, icon, is_private, sort, created_at`,
    )
    .bind(BROWSER_SYNC_CATEGORY_TITLE, now)
    .first<Category>()

  if (!created) throw new Error('failed to create browser sync category')
  return created
}

function normalizeSyncBookmark(value: BrowserSyncBookmark): BrowserSyncBookmark | null {
  const title = typeof value?.title === 'string' ? value.title.trim() : ''
  const url = typeof value?.url === 'string' ? value.url.trim() : ''
  if (!title || !isAllowedBookmarkUrl(url)) return null
  return { title: title.slice(0, 200), url }
}

export async function syncBrowserBookmarks(
  db: D1Database,
  input: BrowserSyncBookmark[],
): Promise<BrowserSyncResp> {
  const category = await ensureBrowserSyncCategory(db)
  const { results } = await db
    .prepare('SELECT url FROM bookmarks WHERE category_id = ?')
    .bind(category.id)
    .all<{ url: string }>()
  const existingUrls = new Set((results ?? []).map((row) => row.url))
  const seenUrls = new Set<string>()
  let created = 0
  let skipped = 0

  for (const candidate of input) {
    const bookmark = normalizeSyncBookmark(candidate)
    if (!bookmark || existingUrls.has(bookmark.url) || seenUrls.has(bookmark.url)) {
      skipped++
      continue
    }

    const row = await db
      .prepare(
        `INSERT INTO bookmarks (
           category_id, title, url, icon, icon_source, icon_background_color,
           description, description_mode, open_method, is_private, sort, created_at
         )
         SELECT ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 1, 0,
           COALESCE((SELECT MAX(sort) FROM bookmarks WHERE category_id = ?), -1) + 1, ?
         WHERE EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id`,
      )
      .bind(category.id, bookmark.title, bookmark.url, category.id, Date.now(), category.id)
      .first<{ id: number }>()

    if (row) {
      created++
      existingUrls.add(bookmark.url)
      seenUrls.add(bookmark.url)
    } else {
      skipped++
    }
  }

  return {
    category_id: category.id,
    category_title: category.title,
    created,
    skipped,
  }
}
