import { Hono } from 'hono'
import { ErrCode, type BrowserSyncReq } from '../../shared/types'
import { getSettings, syncBrowserBookmarks, touchDataVersion } from '../lib/db'
import { invalidatePublicDataCache } from '../lib/cache'
import { fail, ok } from '../lib/response'
import { badRequest, readJson } from '../lib/routeHelpers'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import type { HonoEnv } from '../types'

const MAX_BATCH_SIZE = 100

export const browserSyncRoutes = new Hono<HonoEnv>()

browserSyncRoutes.post('/bookmarks', async (c) => {
  const settings = await getSettings(c.env.DB)
  if (!settings.browser_sync_enabled) {
    return c.json(fail(ErrCode.CONFLICT, 'browser bookmark sync is disabled'))
  }

  const body = await readJson<BrowserSyncReq>(c)
  if (
    !body ||
    !Array.isArray(body.bookmarks) ||
    body.bookmarks.length > MAX_BATCH_SIZE ||
    !body.bookmarks.every((bookmark) => bookmark && typeof bookmark === 'object')
  ) {
    return badRequest(c, 'invalid browser sync payload')
  }

  try {
    const result = await syncBrowserBookmarks(c.env.DB, body.bookmarks)
    if (result.created > 0) {
      await touchDataVersion(c.env.DB)
      invalidateRuntimeDataCache()
      invalidatePublicDataCache(c, c.req.url)
    }
    return c.json(ok(result))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to sync browser bookmarks'))
  }
})

export default browserSyncRoutes
