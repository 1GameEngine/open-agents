Summary: 目标是在 `packages-publish/` 新增 `@1game/engine-bundle`，把内部类型导出并产出可被 `cli` / `cli-gameplay` 消费的 bundle 构建产物；当前阻塞点是仓库里尚不存在你提到的目录与包，需要先确认落地边界。

Context:
- 当前 workspace 仅包含 `apps/*` 与 `packages/*`，不存在 `packages-publish/*` 配置。
- 仓库内未发现 `@1game/*`、`cli`、`cli-gameplay`、`engine-bundle` 相关包或路径。
- 现有 `packages/*` 都是 private workspace 包，`exports` 直接指向源码（`.ts/.tsx`），默认仅 `typecheck`，没有统一库构建产物流程。
- `turbo.json` 的 `build.outputs` 为 `dist/**`，但当前只有 `apps/web` 有 `build` 脚本。

System Impact (初步):
- 若新增 `packages-publish/*`，至少要改根 `package.json` 的 `workspaces.packages`，并更新 `bun.lock`。
- 若 `cli` / `cli-gameplay` 要消费 bundle 产物，需要明确产物契约（包名、入口、format、输出目录、是否单文件）。
- 若要“导出私有包类型”，需要定义哪些类型是 public API、哪些仍保持 internal，避免后续重复/冲突导出。

Clarifications Needed:
1. 你说的 `cli` 和 `cli-gameplay` 当前是在**另一个仓库/分支**，还是希望我在这个仓库里新建？
2. 是否确认要在本仓库新增全新目录 `packages-publish/`（并接入 Bun workspace）？
3. “将私有包类型 export”具体是哪些包的类型？请给包名清单（例如 `@1game/engine`、`@1game/core` 等）。
4. “所有依赖包打包为 bundle”期望是：
   - a) 运行时依赖全部内联进 `engine-bundle`（类似单包分发）；
   - b) 仅 workspace 私有包内联，第三方依赖 external；
   - c) 其他（请说明）？
5. 目标产物格式是否为 `esm + cjs + d.ts`，以及默认入口是否用 `dist/index.js`？
6. `cli` / `cli-gameplay` 期望依赖方式是 npm package dependency（`@1game/engine-bundle`）还是本地文件路径产物引用？

Next Step:
- 你确认以上问题后，我会把本文件更新为可执行的最终方案（含改动文件清单、系统影响、验证步骤），再等你批准进入实现。
