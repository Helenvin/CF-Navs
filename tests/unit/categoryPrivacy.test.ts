import { describe, expect, it } from 'vitest'
import {
  bookmarkNeedsIconAccess,
  categoryNeedsIconAccess,
  getPrivateCategoryIds,
} from '../../src/lib/categoryPrivacy'

type Row = { id: number | string; parent_id: number | string | null; is_private?: boolean | number | null }

const row = (id: Row['id'], parent_id: Row['parent_id'], is_private?: Row['is_private']): Row => ({
  id,
  parent_id,
  ...(is_private === undefined ? {} : { is_private }),
})

describe('getPrivateCategoryIds', () => {
  it('marks private categories and every descendant', () => {
    const ids = getPrivateCategoryIds([
      row(1, null),
      row(2, 1, true),
      row(3, 2),
      row(4, 3),
      row(5, null),
    ])

    expect([...ids].sort((a, b) => a - b)).toEqual([2, 3, 4])
  })

  it('treats both the D1 integer 1 and boolean true as private', () => {
    const ids = getPrivateCategoryIds([
      row(1, null, 1),
      row(2, null, true),
      row(3, null, 0),
      row(4, null, false),
      row(5, null),
    ])

    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('treats cyclic parent links as private instead of looping forever', () => {
    const ids = getPrivateCategoryIds([
      row(1, 2),
      row(2, 1),
      row(3, null),
    ])

    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('normalizes string ids coming from the admin summaries', () => {
    const ids = getPrivateCategoryIds([
      row('1', null),
      row('2', '1', true),
      row('3', '2'),
    ])

    expect(ids.has(3)).toBe(true)
    expect(ids.has(1)).toBe(false)
  })

  it('ignores rows without a usable id', () => {
    const ids = getPrivateCategoryIds([
      { id: Number.NaN, parent_id: null, is_private: true },
      row(7, Number.NaN, true),
    ])

    expect([...ids]).toEqual([7])
  })
})

describe('icon access decisions', () => {
  it('requires access for private categories and their descendants only', () => {
    const privateIds = getPrivateCategoryIds([row(1, null), row(2, 1, true), row(3, 2)])

    expect(categoryNeedsIconAccess(1, privateIds)).toBe(false)
    expect(categoryNeedsIconAccess(2, privateIds)).toBe(true)
    expect(categoryNeedsIconAccess(3, privateIds)).toBe(true)
  })

  it('requires access for private bookmarks and for bookmarks under private categories', () => {
    const privateIds = getPrivateCategoryIds([row(1, null), row(2, null, true), row(3, 2)])

    expect(bookmarkNeedsIconAccess({ category_id: 1 }, privateIds)).toBe(false)
    expect(bookmarkNeedsIconAccess({ category_id: 1, is_private: 0 }, privateIds)).toBe(false)
    expect(bookmarkNeedsIconAccess({ category_id: 1, is_private: true }, privateIds)).toBe(true)
    expect(bookmarkNeedsIconAccess({ category_id: 1, is_private: 1 }, privateIds)).toBe(true)
    expect(bookmarkNeedsIconAccess({ category_id: 2 }, privateIds)).toBe(true)
    expect(bookmarkNeedsIconAccess({ category_id: 3 }, privateIds)).toBe(true)
  })
})
