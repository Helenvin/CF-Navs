import { describe, expect, it } from 'vitest'
import type { PublicCategory } from '../../shared/types'
import { getPublicCategoryIds } from '../../worker/lib/db/aggregates'

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
})
