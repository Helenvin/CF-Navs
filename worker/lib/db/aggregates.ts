// 跨表聚合读取：公开首页数据源与后台聚合数据

import {
  type AdminData,
  type Bookmark,
  type Category,
  type PublicBookmark,
  type PublicCategory,
  type Settings,
  type SiteConfig,
} from '../../../shared/types'
import {
  BOOKMARK_AGGREGATE_LIST_SQL,
  CATEGORY_LIST_SQL,
  PRIVATE_BOOKMARK_LIST_SQL,
  PUBLIC_BOOKMARK_LIST_SQL,
  PUBLIC_CATEGORY_LIST_SQL,
  PUBLIC_DATA_SETTINGS_LIST_SQL,
  PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_LIST_SQL,
  SETTINGS_LIST_SQL,
} from './sql'
import { withSchemaRetry } from './schema'
import { settingsFromRows } from '../settingsData'

export async function getPublicDataSource(db: D1Database, siteConfig?: SiteConfig, includePrivate = false): Promise<{
  categories: PublicCategory[]
  bookmarks: PublicBookmark[]
  settings: Settings
}> {
  return await withSchemaRetry(db, async () => {
    const settingsSql = siteConfig
      ? PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_LIST_SQL
      : PUBLIC_DATA_SETTINGS_LIST_SQL
    const [settingsResult, categoriesResult, bookmarksResult] = await db.batch([
      db.prepare(settingsSql),
      db.prepare(PUBLIC_CATEGORY_LIST_SQL),
      db.prepare(includePrivate ? PRIVATE_BOOKMARK_LIST_SQL : PUBLIC_BOOKMARK_LIST_SQL),
    ])

    return {
      categories: (categoriesResult.results ?? []) as PublicCategory[],
      bookmarks: (bookmarksResult.results ?? []) as PublicBookmark[],
      settings: settingsFromRows((settingsResult.results ?? []) as Array<{ key: string; value: string | null }>, siteConfig),
    }
  })
}

export async function getAdminData(db: D1Database): Promise<AdminData> {
  return await withSchemaRetry(db, async () => {
    const [categoriesResult, bookmarksResult, settingsResult] = await db.batch([
      db.prepare(CATEGORY_LIST_SQL),
      db.prepare(BOOKMARK_AGGREGATE_LIST_SQL),
      db.prepare(SETTINGS_LIST_SQL),
    ])

    return {
      categories: (categoriesResult.results ?? []) as Category[],
      bookmarks: (bookmarksResult.results ?? []) as Bookmark[],
      settings: settingsFromRows((settingsResult.results ?? []) as Array<{ key: string; value: string | null }>),
    }
  })
}
