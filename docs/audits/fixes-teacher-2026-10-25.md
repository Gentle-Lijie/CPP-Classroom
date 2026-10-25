# 教师工作流修复记录（2026-10-25）

对应审查：`teacher-pages-2026-10-25.md` 的 T01–T45。此文记录实现与已完成的机器验证；截图与实际视觉验收由主 agent 统一执行，不能以本文替代浏览器验收。

## 教师五页面

- **课堂总览**：空课堂/无练习不再解引用 undefined；分页与在线/异常/练习 ID 筛选；移除只弹提示的伪列表切换；未选择题目的学生明确显示未选择；当前题提交状态与推荐题提交进度分别统计，零人数宽度有效；求助显示真实正文、关联练习与时间，并跳转对应练习；邀请支持失效确认、实际到期时间、过期提示，写操作防重复。
- **练习管理**：搜索题目/文件名/知识点、状态过滤、列表分页；上下移动；稳定有效选中项；关闭练习有警告确认并说明会停止任务；发布绿色、关闭警告色；执行限制与标准来自平台配置；题目预览含完整输入输出说明；长样例局部滚动，按钮允许换行；推荐标识使用真实课堂字段，避免默认题目被误当作教师推荐。
- **练习编辑**：无输入题不再要求非空样例输入；保存防重复，保存期间编辑区 inert，避免请求完成后覆盖等待期间的新输入；页面/浏览器离开保护；本机自动题目备份、显式恢复提示、JSON 下载和导入；409 保留本地内容，提供本地/服务器版本对照、下载和继续编辑选择；错误不因无关字段修改自动消失；保存成功使用服务器返回 ID/version，不误用刷新失败后的旧缓存。
- **课堂设置**：顶部与页内保存统一校验名称、整数容量、现有人数；持久错误提示、未保存提示和就近保存按钮；开关保存语义明确；归档仅成功后更新状态，说明停止活动任务；支持确认恢复课堂；非进行中状态改变需确认；邀请更新确认及真实到期提示；去掉虚构学期和硬编码编译器小版本；保存期间表单 inert，离开未保存有确认。
- **提交与导出**：服务端分页，练习/学生/关键词筛选，每人每题最新提交或历史记录；正确本页全选/半选、跨页选择、筛选后清空旧选择；刷新、更新时间、持久加载错误与重试；源文件详情跳转携带 exercise/submission；草稿可独立导出，不再依赖存在主动提交；ZIP 源文件与 CSV 清单、CSV 单独清单、JSON 完整备份，JSON 可选运行上下文；导出范围、最新版本与搜索不参与导出的边界清晰说明；导出 busy 与错误不静默。

## 教学 API

`apps/api/src/modules/teaching.ts`：

- overview 最新运行和 submitted 均关联学生当前 exercise，另返回 recommendedSubmitted；返回真实 helpMessage/helpRequestId/helpExerciseId/helpCreatedAt。
- GET help：教师读课堂、学生只读自己；支持 exercise/student 过滤。POST help 通过事务 advisory lock 更新同一学生同题当前未解决请求，避免反复刷屏。
- resolve 必须明确 requestId 或 exerciseId，避免“处理一题”误清全课堂其他题。旧端到端验收脚本已同步传 exerciseId。
- submissions 查询兼容无分页参数的原数组接口，新增 page/pageSize/latest/search/exercise/student；学生即使传其他 student 也只能获得自己的记录。
- 提交以学生+题目事务锁串行，事务内重新检查课堂/题目状态；同 saved revision 重复点击幂等，allowResubmit=false 的检查与插入处于同一锁内；保留不可变代码快照。
- projection 明确 draft/run/submission 三种 kind；支持独立 submissionId，与 runId 互斥；快照保留来源 ID、版本、时间、文件名等，去除学生/课堂身份字段；draft 不伪造运行状态或输出；过期时间和撤销支持保持。
- export 使用 REPEATABLE READ 一致性只读事务，支持按 exercise/student 和作品种类筛选、排除运行上下文。查询正文前在 PG 聚合总记录数和 JSON 字节数，超过一万条或 64 MiB 提示分批，避免先把巨大正文拉到 API 内存才检查。

课堂 API 相关 T09/T10/T11/T33（追加题目顺序、版本与推荐状态、关闭任务、容量）由账号 agent 修改；共享路由页面重建、成功写入后刷新失败的通知、类型与公共组件由主 agent 修改，非本 agent 单独完成。

## 导出实现与依赖

新增 `apps/web/src/lib/source-archive.ts`：无第三方依赖的标准 ZIP stored entries，UTF-8 文件名、CRC32、中央目录；清理跨平台文件名和路径穿越，附作品 CSV 清单；未新增包或联网安装依赖。

CSV 使用账号 agent 的 `csvDocument`，包含 UTF-8 BOM、引号转义、电子表格公式防护。

## 验证证据

已完成：

1. `pnpm --filter @classroom/api typecheck` 通过。
2. `pnpm --filter @classroom/web typecheck` 通过。
3. owned Vue/API/ZIP/验收脚本 ESLint 通过；owned 文件已 Prettier 格式化。
4. `pnpm exec vitest run apps/web/src/lib/source-archive.test.ts`：2 个测试通过，覆盖标准 CRC32、UTF-8 ZIP 头/目录/偏移、内容、路径穿越。
5. 独立 Python `zipfile` 对真实生成 ZIP 解包验证通过：中文文件名、CRC、源文件内容、中央目录均有效。
6. 新增 `scripts/product-acceptance.mjs`，创建独立合成课堂与学生，不执行学生代码，不改原有课堂，结束后归档。主 agent 执行的 `.local/product-acceptance-result.json`（2026-10-25 23:44:10 上海时间）记录六组通过：无输入题发布；6 并发同版本提交幂等/禁止重交/快照；分页最新/过滤/学生隔离；求助更新及分题处理/统计；提交与草稿投屏/权限/撤销；草稿筛选导出/权限。

注意：API 回归结果生成后 export 的边界实现从“读取后校验”加强为“数据库预检再读取”，主 agent 已被告知最终复测需覆盖 export。全项目 check/test/build、迁移、队列、浏览器截图和视觉复验由主 agent 汇总，本文不提前宣称这些均通过。
