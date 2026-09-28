import { describe, expect, it } from 'vitest'
import type { PublicCategory } from '../../shared/types'
import { getPublicCategoryIds, isBookmarkIconAnonymouslyVisible } from '../../worker/lib/db/aggregates'
import { getHiddenCategoryIds } from '../../src/lib/adminListState'
import { bookmarkNeedsIconAccess, getPrivateCategoryIds } from '../../src/lib/categoryPrivacy'

const category = (id: number, parent_id: number | null, is_private?: boolean | number): PublicCategory => ({
  id,
  parent_id,
  title: `Category ${id}`,
  icon: null,
  ...(is_private === undefined ? {} : { is_private }),
  sort: id,
})

describe('public category visibility', () => {
  it('hides private categories and all descendants from public data', () => {
    const visible = getPublicCategoryIds([
      category(1, null),
      category(2, 1, true),
      category(3, 2),
      category(4, null),
    ])

    expect([...visible]).toEqual([1, 4])
  })

  it('treats cyclic category data as hidden instead of looping', () => {
    const visible = getPublicCategoryIds([
      category(1, 2),
      category(2, 1),
      category(3, null),
    ])

    expect([...visible]).toEqual([3])
  })

  it('keeps the admin-side hidden-category mirror in sync with the worker rule', () => {
    const tree = [
      category(1, null),
      category(2, 1, true),
      category(3, 2),
      category(4, null),
      category(5, 4, 0),
      category(6, null, 1),
    ]

    const visible = getPublicCategoryIds(tree)
    const hidden = getHiddenCategoryIds(tree.map((item) => ({
      id: item.id,
      parent_id: item.parent_id,
      title: item.title,
      is_private: item.is_private === true || item.is_private === 1,
    })))

    for (const item of tree) {
      expect(hidden.has(item.id)).toBe(!visible.has(item.id))
    }
  })

  // 首页要显示私密对象的真实图标就得带授权 key，判定必须与服务端「匿名是否可见」严格互补，
  // 否则会出现「该带 key 的没带（显示兜底图）」或「公开图标白带 key（丢掉边缘缓存）」。
  it('keeps the home-side icon-access rule complementary to the worker visibility rule', () => {
    const tree = [
      category(1, null),
      category(2, 1, true),
      category(3, 2),
      category(4, null),
      category(5, 4, 0),
      category(6, null, 1),
    ]

    const visible = getPublicCategoryIds(tree)
    const privateIds = getPrivateCategoryIds(tree)

    for (const item of tree) {
      expect(privateIds.has(item.id)).toBe(!visible.has(item.id))
    }

    // 只覆盖分类确实存在的书签：首页按分类分组渲染，孤立书签不会出现。
    const bookmarks = [
      { category_id: 1 },
      { category_id: 4 },
      { category_id: 5 },
      { category_id: 2 },
      { category_id: 3 },
      { category_id: 6 },
      { category_id: 1, is_private: true },
      { category_id: 1, is_private: 1 },
      { category_id: 1, is_private: false },
      { category_id: 1, is_private: 0 },
    ]

    for (const item of bookmarks) {
      expect(bookmarkNeedsIconAccess(item, privateIds)).toBe(!isBookmarkIconAnonymouslyVisible(item, visible))
    }
  })

  it('denies anonymous icon access to private bookmarks and to public bookmarks under private categories', () => {
    const visible = getPublicCategoryIds([
      category(1, null),
      category(2, null, true),
      category(3, 2),
    ])

    // 公开分类下的公开书签：可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1 }, visible)).toBe(true)
    // D1 里 0 与 false 都表示公开
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: 0 }, visible)).toBe(true)
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: false }, visible)).toBe(true)
    // 私密书签本身：无论所在分类是否公开都不可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: true }, visible)).toBe(false)
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: 1 }, visible)).toBe(false)
    // 公开书签挂在私密分类、或私密分类的后代下：同样不可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 2 }, visible)).toBe(false)
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 3 }, visible)).toBe(false)
    // 分类已被删除：不可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 999 }, visible)).toBe(false)
  })
})
