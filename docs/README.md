# CF-Navs 文档

项目文档按用途分为以下几类，避免用户指南、技术契约和开发过程记录混在同一目录。

## 使用与部署指南

- [快速开始](guides/QUICKSTART.md)
- [完整部署指南](guides/DEPLOYMENT.md)
- [常见问题排查](guides/TROUBLESHOOTING.md)
- [Sun-Panel 数据导入](guides/SUNPANEL_IMPORT.md)


## 技术参考

- [项目概览](reference/PROJECT_OVERVIEW.md)
- [API 契约](reference/API_CONTRACT.md)
- [技术说明](reference/TECHNICAL_NOTES.md)
- [分类层级设计](reference/CATEGORY_HIERARCHY_DESIGN.md)
- [性能契约](reference/PERFORMANCE_CONTRACT.md)
- [性能测试](reference/PERFORMANCE_TESTING.md)

## 发布与变更记录

- [变更记录](../CHANGELOG.md)

## 开发计划与决策记录

`plans/` 保存已完成轮次的计划文档。它们不是待办清单，而是决策记录——说明当初
为什么这么改、哪些约束在后续修改中必须继续遵守，以及哪些验证还没补齐。
每份文档文首都标注了状态和对应的实现提交。

- [平台优化（加载 / 安全 / 冗余 / UI / 结构）](plans/PLATFORM_OPTIMIZATION_PLAN.md)
- [后台管理移动端布局](plans/ADMIN_MOBILE_LAYOUT_PLAN.md)
- [PR #7 合并检查（私密书签 / 跨分类排序 / 浏览器书签同步）](plans/PR7_MERGE_REVIEW_PLAN.md)

## 图片

- `screenshots/`：README 当前使用的产品截图。

本地历史记录、草稿和浏览器验证资料应放在已忽略的 `docs/history/`、`docs/local/`、`docs/drafts/` 或根目录 `_archive/`，不会进入构建、部署或 Git 提交。

`PROJECT_OVERVIEW.md` 中的维护待办只记录当前源码能够确认的未完成事项；已完成阶段计划和没有产品契约的设想不继续作为当前路线图维护。

## 项目目录

- `src/`：Svelte 前端页面、组件和浏览器端逻辑。
- `worker/`：Cloudflare Worker 路由、中间件和 D1 数据访问。
- `shared/`：前后端共享类型与设置定义。
- `public/`：PWA、Service Worker 和静态资源。
- `scripts/`：开发、部署、测试、审计和数据转换脚本，详见 [脚本说明](../scripts/README.md)。
- `tests/`：Vitest 单元与源码回归测试。
- `schema.sql`：D1 数据库结构，是部署必需文件。
