// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { tick } from 'svelte'
import { cleanup, render } from '@testing-library/svelte'
import Sidebar from '../../src/components/Sidebar.svelte'
import { iconAccessKey } from '../../src/lib/iconAccessKey'

// 回归：Sidebar 曾把「是否带 key」的判定封装成 getCategoryIconAccessKey() 再在模板里
// 调用。Svelte 只追踪模板表达式里直接出现的依赖，藏进函数体的 $iconAccessKey 变了也
// 不会让那几处 {getCategoryIconAccessKey(item)} 重新求值——于是刷新页面时图标先以无
// key 的代理地址渲染（拿到的自然是服务端兜底图），几毫秒后 key 签发完成，其他挂载点
// 都换上了带 key 的地址并恢复真实图标，唯独侧栏永远停在兜底图上。
//
// 这条测试锁的是行为：key 从空变成有值后，img 的 src 必须跟着带上 key。

const navigation = { position: 'left' as const, always_expanded: true, top_layout: 'scroll' as const }

const items = [
  {
    id: 'cat-1',
    categoryId: 1,
    title: '私密分类',
    icon: 'https://example.com/private-icon.png',
    count: 2,
    children: [],
  },
]

describe('Sidebar 分类图标的授权 key 响应性', () => {
  afterEach(() => {
    cleanup()
    iconAccessKey.set('')
  })

  it('key 从空到有之后，私密分类图标的 src 自动带上 key', async () => {
    iconAccessKey.set('')
    render(Sidebar, {
      props: {
        items,
        activeId: null,
        navigation,
        privateCategoryIds: new Set([1]),
      },
    })

    const img = document.querySelector('.category-icon img') as HTMLImageElement | null
    expect(img).toBeTruthy()
    expect(img!.getAttribute('src')).toContain('/api/category-icon/1?')
    expect(img!.getAttribute('src')).not.toContain('key=')

    // 模拟 icon-access 签发完成：store 更新必须传导到 img src。
    iconAccessKey.set('k-test')
    await tick()

    expect(img!.getAttribute('src')).toContain('key=k-test')
  })

  it('公开分类即使 key 已就位也不带 key，继续走可缓存的匿名路径', async () => {
    iconAccessKey.set('k-test')
    render(Sidebar, {
      props: {
        items,
        activeId: null,
        navigation,
        privateCategoryIds: new Set<number>(),
      },
    })

    const img = document.querySelector('.category-icon img') as HTMLImageElement | null
    expect(img).toBeTruthy()
    expect(img!.getAttribute('src')).toContain('/api/category-icon/1?')
    expect(img!.getAttribute('src')).not.toContain('key=')
  })
})
