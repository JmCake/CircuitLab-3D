# CI 与本地验证

## 触发策略

| 事件 | 类型检查、162 项单元/集成测试、构建 | 四套浏览器回归 | 网站发布 |
| --- | --- | --- | --- |
| 开发分支 push，尚未创建 PR | 本地执行 `npm run check` | 可本地执行 | 否 |
| 草稿 PR 创建、更新、重新打开 | 是 | 否 | 否 |
| PR 转为草稿 | 是；取消该 PR 过时运行 | 否 | 否 |
| 非草稿 PR 创建、更新、重新打开、准备评审 | 是 | 基础检查成功后全部执行 | 否 |
| main push | 是 | 否；合并前由 PR 验证 | 基础检查和汇总检查成功后发布 |
| 手动 workflow_dispatch | 是 | 基础检查成功后全部执行 | 仅 main，所有检查成功后发布 |

开发分支 push 不再单独触发远程 CI；使用草稿 PR 获取轻量检查，准备评审后执行完整浏览器回归。非草稿 PR 的每次更新仍必须通过全部四套回归，不需要标签或手动放行。

同一 PR/分支共用 concurrency group，新的 PR 或非 main 手动运行取消过时运行。main 不取消正在执行的运行，以免中断发布；等待中的旧 main 运行会被更新的运行替换。原有 web-production 发布锁和发布脚本的 main SHA 校验继续防止旧版本覆盖新版本。

保留 `typecheck-test-build`、`browser-*` 和 `browser-checks` 检查名称。`browser-checks` 只有在基础检查成功、且必需的浏览器测试全部成功时才通过；草稿 PR 和 main push 明确允许浏览器任务跳过。取消、失败或非预期跳过不会被视为浏览器验证成功。发布条件显式检查依赖结果，避免 GitHub 默认的 skipped 传播导致 main 无法发布。

截图仅在浏览器失败且运行未取消时上传，保留一天。上传失败继续不会掩盖原始测试结果。既有额度用尽或历史 artifacts 不会因为修改 YAML 立即恢复；本次不修改账户通知设置、不删除历史记录。

## 失败记录分析（2026-11-14）

- [最近两次重复运行](https://github.com/JmCake/CircuitLab-3D/actions/runs/43600574915)及[同 SHA 的 push](https://github.com/JmCake/CircuitLab-3D/actions/runs/43600570517)：均为 `55f055e7`，前者 PR、后者 push。最新任务没有执行步骤，下载 job 日志返回 BlobNotFound，不能当作应用测试失败的证据，也不能仅凭此确认计算分钟额度耗尽。
- [较早的真实类型错误](https://github.com/JmCake/CircuitLab-3D/actions/runs/43598982529)：sceneStore 引用了尚未定义的 breadboard-pro、trainer-box 和 importSceneWorkspace。最新开发分支已经补齐相应类型与接口；本次通过本地 typecheck、现有 162 项测试和生产构建复核，不放宽类型检查。
- [交互回归失败及截图额度错误](https://github.com/JmCake/CircuitLab-3D/actions/runs/43595803358)：旋钮位置断言失败，且上传截图报告 Artifact storage quota has been hit。后续已有提交 `7778a04` 将位置断言改为与实际初始位置比较；本次保留电压变化和器材位置不变两项断言并重新运行原始测试，不删除测试。
- 四套浏览器任务以前与基础检查并行，即使 typecheck 已失败仍继续消耗。现在它们依赖基础检查，并仅在完整验证场景启动。

## 验证方式

以开发分支 `feat/three-lab-scenes` 的 `55f055e79b0c43f934bb00a91beb594e2e1cc8c9` 为基线。使用 Node.js（CI 为 22）、锁定依赖和本机 Chrome：

```sh
npm ci
npm run typecheck
npm test
npm run build:web
npm run test:e2e
npm run test:e2e:advanced
npm run test:e2e:wires
npm run test:e2e:instruments
actionlint -shellcheck= -pyflakes= .github/workflows/ci.yml
git diff --check
```

本次本地验证结果：类型检查、16 个文件共 162 项测试、build:web、四套原始浏览器回归、actionlint 1.7.12 和 git diff --check 全部通过。另从 YAML 提取汇总检查的实际 Bash 脚本，验证必需/可跳过浏览器测试及 success/failure/skipped/cancelled 的 32 种结果组合，全部符合预期。本机为 Windows / Node.js 24.14.0 / Chrome，远程为 Ubuntu / Node.js 22；尚未通过远程执行验证相同运行环境。本地浏览器验证使用软件渲染，与 CI 脚本相同。发布构建可本地验证；实际跨仓库推送依赖 GitHub 的 PAGES_DEPLOY_KEY，不在本地执行。初次本地验证阶段未推送、未重跑 Actions，也未执行网站发布。后续授权推送后，草稿 PR 先运行基础检查，再在开发分支手动运行完整回归，实际结果记录在 PR。合并后的首次远程运行仍需核实 GitHub 事件调度、分支保护和发布凭据。

GitHub 跳过依赖任务的语义参考：[官方工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。
