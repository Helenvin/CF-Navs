// 私密对象判定（前端统一口径）。
//
// 服务端口径见 `worker/lib/db/aggregates.ts` 的 `getPublicCategoryIds` / 
// `isBookmarkIconAnonymouslyVisible`：私密分类自身及其全部后代对匿名访客不可见，
// 挂在它们下面的公开书签图标同样不可见（PROB-20）。因此登录态在首页显示这类
// 对象时，图标请求必须带上 icon-access key，判定口径必须与服务端逐条一致——
// `tests/unit/publicVisibility.test.ts` 有前后端交叉断言防止两侧漂移。

export type CategoryPrivacyLike = {
  id: number | string
  parent_id: number | string | null
  is_private?: boolean | number | null
}

export type BookmarkPrivacyLike = {
  category_id: number | string
  is_private?: boolean | number | null
}

function toId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** D1 里私密既可能落成 1 也可能落成 true，两种都算私密。 */
export function isPrivateFlag(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1
}

/**
 * 自身或任一祖先私密的分类 id 集合。
 * 环状父子关系按「不可见」处理，与 worker 侧一致，避免死循环。
 */
export function getPrivateCategoryIds(categories: readonly CategoryPrivacyLike[]): Set<number> {
  const byId = new Map<number, CategoryPrivacyLike>()
  for (const category of categories) {
    const id = toId(category.id)
    if (id !== null) byId.set(id, category)
  }

  const hidden = new Set<number>()

  for (const category of categories) {
    const rootId = toId(category.id)
    if (rootId === null) continue

    const visited = new Set<number>()
    let current: CategoryPrivacyLike | undefined = category

    while (current) {
      const currentId = toId(current.id)
      if (currentId === null || visited.has(currentId)) {
        hidden.add(rootId)
        break
      }
      visited.add(currentId)
      if (isPrivateFlag(current.is_private)) {
        hidden.add(rootId)
        break
      }
      const parentId = toId(current.parent_id)
      current = parentId === null ? undefined : byId.get(parentId)
    }
  }

  return hidden
}

/** 私密分类本身、以及私密分类的后代，都需要图标授权。 */
export function categoryNeedsIconAccess(categoryId: number | string, privateCategoryIds: Set<number>): boolean {
  const id = toId(categoryId)
  return id === null ? true : privateCategoryIds.has(id)
}

/**
 * 书签图标是否需要授权：私密书签本身，或挂在私密分类（含后代）下。
 * 分类已被删除时同样按需要授权处理——服务端对这种情况也返回兜底图标。
 */
export function bookmarkNeedsIconAccess(
  bookmark: BookmarkPrivacyLike,
  privateCategoryIds: Set<number>,
): boolean {
  if (isPrivateFlag(bookmark.is_private)) return true
  return categoryNeedsIconAccess(bookmark.category_id, privateCategoryIds)
}
