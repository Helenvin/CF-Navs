import { Hono } from 'hono'
import { ErrCode, type BatchDeleteReq, type CategorySortReq, type CategoryUpsertReq } from '../../shared/types'
import {
  CategoryConflictError,
  CategoryValidationError,
  createCategory,
  deleteCategory,
  batchDeleteCategories,
  listCategories,
  sortCategories,
  touchDataVersion,
  updateCategory,
} from '../lib/db'
import { invalidatePublicDataCache } from '../lib/cache'
import { fail, ok } from '../lib/response'
import {
  badRequest,
  isNonEmptyString,
  isOptionalString,
  parseBatchIds,
  parseId,
  parseSortIds,
  readJson,
  type AppContext,
} from '../lib/routeHelpers'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import type { HonoEnv } from '../types'

function parseParentId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined
}

export const categoriesRoutes = new Hono<HonoEnv>()

function categoryWriteError(c: AppContext, error: unknown, fallback: string) {
  if (error instanceof CategoryValidationError) return badRequest(c, error.message)
  if (error instanceof CategoryConflictError) return c.json(fail(ErrCode.CONFLICT, error.message))
  return c.json(fail(ErrCode.SERVER_ERROR, fallback))
}

categoriesRoutes.get('/', async (c) => {
  try {
    return c.json(ok(await listCategories(c.env.DB)))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to list categories'))
  }
})

categoriesRoutes.post('/', async (c) => {
  const body = await readJson<CategoryUpsertReq>(c)
  const parentId = parseParentId(body?.parent_id)
  if (!body || !isNonEmptyString(body.title) || !isOptionalString(body.icon) ||
      (body.parent_id !== undefined && parentId === undefined) ||
      (body.is_private !== undefined && typeof body.is_private !== 'boolean')) {
    return badRequest(c, 'invalid category payload')
  }

  try {
    const category = await createCategory(c.env.DB, {
      title: body.title.trim(),
      icon: body.icon ?? null,
      parent_id: parentId ?? null,
      is_private: body.is_private === true,
    })
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(category))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to create category')
  }
})

categoriesRoutes.put('/:id', async (c) => {
  const id = parseId(c)
  if (id == null) return badRequest(c, 'invalid category id')

  const body = await readJson<CategoryUpsertReq>(c)
  const parentId = parseParentId(body?.parent_id)
  if (!body || !isNonEmptyString(body.title) || !isOptionalString(body.icon) ||
      (body.parent_id !== undefined && parentId === undefined) ||
      (body.is_private !== undefined && typeof body.is_private !== 'boolean')) {
    return badRequest(c, 'invalid category payload')
  }

  try {
    const category = await updateCategory(c.env.DB, id, {
      title: body.title.trim(),
      icon: body.icon ?? null,
      parent_id: body.parent_id === undefined ? undefined : parentId,
      is_private: body.is_private,
    })
    if (!category) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(category))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to update category')
  }
})

categoriesRoutes.delete('/:id', async (c) => {
  const id = parseId(c)
  if (id == null) return badRequest(c, 'invalid category id')

  try {
    const deleted = await deleteCategory(c.env.DB, id)
    if (!deleted) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(null))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to delete category')
  }
})

categoriesRoutes.post('/batch-delete', async (c) => {
  const body = await readJson<BatchDeleteReq>(c)
  const ids = parseBatchIds(body?.ids)
  if (!ids) return badRequest(c, 'invalid batch delete payload')
  try {
    const result = await batchDeleteCategories(c.env.DB, ids)
    if (result.deleted > 0 || result.deleted_bookmarks > 0) {
      await touchDataVersion(c.env.DB)
      invalidateRuntimeDataCache()
      invalidatePublicDataCache(c, c.req.url)
    }
    return c.json(ok(result))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to batch delete categories')
  }
})

categoriesRoutes.post('/sort', async (c) => {
  const body = await readJson<CategorySortReq>(c)
  const ids = parseSortIds(body?.ids)
  const parentId = parseParentId(body?.parent_id)
  if (!ids || parentId === undefined) {
    return badRequest(c, 'invalid sort payload')
  }

  try {
    await sortCategories(c.env.DB, { parent_id: parentId, ids })
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(null))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to sort categories')
  }
})

export default categoriesRoutes
