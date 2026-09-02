# Contributing to Team Agent

感谢参与 Team Agent。项目是一个 pnpm workspace，提交前请在仓库根目录运行：

```bash
pnpm install
pnpm exec biome check .
pnpm typecheck
pnpm test
pnpm build
```

功能变更请同时补充对应测试和文档。Coordinator 与 Runner 的协议类型统一维护在 `packages/shared`。
