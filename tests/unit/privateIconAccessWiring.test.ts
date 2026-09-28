import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

// 首页曾经从不带 icon-access key：私密分类及其下书签的图标请求按匿名口径被判成
// 「不可见」，服务端返回兜底图，于是登录用户在首页看到的是占位图标（后台却有真实
// 图标）。这些断言锁住每个挂载点都真的把 key 传下去了。
describe('private icon access wiring', () => {
  it('Sidebar 给私密分类的图标挂上授权 key', () => {
    const source = read('src/components/Sidebar.svelte')

    expect(source).toContain('privateCategoryIds.has(item.categoryId) ? $iconAccessKey')
    expect(source.match(/iconAccessKey={getCategoryIconAccessKey\(item\)}/g)).toHaveLength(2)
    expect(source.match(/iconAccessKey={getCategoryIconAccessKey\(child\)}/g)).toHaveLength(2)
  })

  it('Home 计算私密分类集合并下发到侧栏、分类区块与分类 tab', () => {
    const home = read('src/views/Home.svelte')

    expect(home).toContain('$: privateCategoryIds = getPrivateCategoryIds(categories)')
    expect(home).toContain('categoryNeedsIconAccess(category.id, privateCategoryIds) ? $iconAccessKey')
    // Sidebar + 5 处 CategorySection + HomeCategoryScope
    expect(home.match(/\{privateCategoryIds\}/g)).toHaveLength(7)
  })

  it('分类区块、分类 tab 与 Spotlight 结果行都按私密性传入 key', () => {
    expect(read('src/components/CategorySection.svelte')).toContain(
      'bookmarkNeedsIconAccess(bookmark, privateCategoryIds) ? $iconAccessKey',
    )
    expect(read('src/components/CategorySection.svelte')).toContain(
      'categoryNeedsIconAccess(category.id, privateCategoryIds) ? $iconAccessKey',
    )
    expect(read('src/components/HomeCategoryScope.svelte')).toContain(
      'categoryNeedsIconAccess(rootId, privateCategoryIds) ? $iconAccessKey',
    )
    expect(read('src/components/SearchSpotlight.svelte')).toContain(
      'bookmarkNeedsIconAccess(bookmark, privateCategoryIds) ? $iconAccessKey',
    )
  })

  it('卡片与 Spotlight 图标把 key 交给同一套图标状态推导', () => {
    expect(read('src/components/BookmarkCard.svelte')).toContain('iconAccessKey,')
    expect(read('src/components/SpotlightBookmarkIcon.svelte')).toContain('iconAccessKey,')
  })

  it('匿名访客拿到的是空集合，不会给公开图标平白带上 key', () => {
    // 只在命中私密集合时才取 $iconAccessKey，公开对象继续走可被边缘缓存的匿名路径。
    for (const file of [
      'src/components/Sidebar.svelte',
      'src/components/CategorySection.svelte',
      'src/components/HomeCategoryScope.svelte',
      'src/views/Home.svelte',
      'src/components/SearchSpotlight.svelte',
    ]) {
      expect(read(file)).toMatch(
        /(?:NeedsIconAccess\([^;]*?privateCategoryIds\)|privateCategoryIds\.has\([^)]*\)) \? \$iconAccessKey : ''/,
      )
    }
  })
})
