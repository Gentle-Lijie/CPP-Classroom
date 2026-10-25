# 学生与独立教学窗口修复记录（2026-10-25）

对应审计：`student-windows-2026-10-25.md` 的 S01–S40。本文件记录实现与机器检查；浏览器视觉与交互复验由主 agent 统一进行，未完成项不在此宣称通过。

## 实现

| 编号    | 修复                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01–S03 | Teaching 草稿读取、保存绑定课堂/练习/用户/generation；过期响应不写状态；读取到 nextTick 后才解除 loading，避免 GET 被自动回写。切题/上一题/下一题/离页先 flush，失败留在原题；本机 pending 备份和冲突下载恢复；关闭窗口提示未保存。 |
| S04–S05 | Workspace loading 为响应式只读；读取/保存/轮询/历史请求绑定上下文，历史分页另有 request generation。加载失败单独错误与重试，不冒充版本冲突；未载入时禁止编辑/提交/运行。                                                            |
| S06     | 重置恢复区切题清空，以 undefined 区分无恢复区和空文件，空代码也可撤销。                                                                                                                                                             |
| S07     | 当前程序运行中切题必须经确认停止并等待任务结束；全局活动任务读取 `active=true&scope=all`，异题/异课堂任务有返回控制入口，完成后轮询解除本题运行禁用。离页明确提示继续运行，并保留原任务。                                           |
| S08–S09 | StudentDetail 每次学生/练习上下文变化清旧数据、递增 generation；只提交匹配响应。无学生、无练习显示不同空态，不读取 undefined exercise。                                                                                             |
| S10     | 提交记录携带 kind，投屏 POST 传 submissionId；运行记录才传 runId。提交快照不渲染伪运行结果。API 由教师组实现。                                                                                                                      |
| S11     | 学生运行/提交/求助、教师投屏/解决求助、投屏撤销均增加 pending 防重和可见等待/失败。                                                                                                                                                 |
| S12     | 离页检查本地 flush false，阻止静默离开；disconnect 也尊重 flush false。只读课堂存在未同步修改时允许明确下载备份后离开，避免页面死锁。                                                                                               |
| S13     | History 独立 loading、error+重试、empty+课堂入口；历史刷新按钮。                                                                                                                                                                    |
| S14     | History、Workspace 历史与 StudentDetail 运行记录使用服务器 page/pageSize/total；不再把 limit100 当全部。API 由 root 实现。                                                                                                          |
| S15     | History watch课堂/练习/状态过滤，清理选择后重新加载；App上下文key由root统一。                                                                                                                                                       |
| S16     | Workspace从GET恢复 submitted/submittedAt；禁止重复提交时禁用按钮，提交确认展示上次提交时间。API字段由root实现。                                                                                                                     |
| S17     | 求助状态按当前题从服务端恢复，heartbeat更新当前题未解决请求；发送前trim并防重复；GET与更新API由教师组实现。                                                                                                                         |
| S18     | StudentDetail直接使用所选学生+练习的 workspace GET help，仅显示该题求助，切题立即清理。标签显示练习标题与时间，按钮“解决此求助”；解决传当前请求准确的requestId/exerciseId，不清除其他练习求助。API由教师组实现。                    |
| S19     | Monitor题目无匹配时不再虚构“累加求和”；当前题状态/提交关联由教师组修复overview API。                                                                                                                                                |
| S20     | StudentDetail只分页获取当前学生+练习的运行/提交，不拉全课堂提交/求助；2.5秒轮询，页面隐藏时暂停；只加载当前侧栏tab，并缓存当前题最新运行结果。                                                                                      |
| S21     | 删除三处固定第10行错误高亮。原始诊断保留，不伪造源代码错误行。                                                                                                                                                                      |
| S22     | 工作区同步状态全屏宽可见，pending/error/conflict有相应文字、图标、强调色；底栏状态不再永远显示同步成功。                                                                                                                            |
| S23     | 加载错误与409冲突分别展示；只有真实409提供本机修改下载+采用服务器版本操作。                                                                                                                                                         |
| S24     | localStorage写入增加try/catch；本机备份不可用不会中断服务器保存调度，并有可见状态。                                                                                                                                                 |
| S25     | 历史/详情/输出使用本地化时间及短ID，完整ID可通过title查看；共用root display工具。                                                                                                                                                   |
| S26     | 快照用其compilerProfile，缺失配置显示“未记录编译配置”；当前工作区/授课使用实际执行配置。浏览器clangd标签改为“浏览器分析”，不冒充运行配置。                                                                                          |
| S27     | Projection loading/过期或无权/瞬断分离，网络异常保留最后快照并重试，404/403/401停止无效轮询，不重复toast；支持手动重试。                                                                                                            |
| S28     | Projection按kind区分草稿/运行/提交，仅运行显示结果；time规范为createdAt；草稿/提交解释不代表运行成功。类型化快照由教师API提供。                                                                                                     |
| S29     | 投屏字号按钮增加aria-label与上下界禁用；撤销busy防重复。                                                                                                                                                                            |
| S30     | RunOutput调用异步sendInput确认，成功才清行；失败保留，输入和EOF发送pending；长度约束与API单次限制一致。                                                                                                                             |
| S31     | EOF成功本地即标eof并关闭输入区，显示stdin已关闭；保留停止。                                                                                                                                                                         |
| S32     | 删除固定“1”诊断计数，改“失败”徽标。                                                                                                                                                                                                 |
| S33     | 所有输出tab切换均恢复显示；清除/恢复为同一按钮，复制对应可见内容；不删除记录。                                                                                                                                                      |
| S34     | RunOutput新增readonlyContext，教师只读空态不再要求点击不存在的运行按钮。                                                                                                                                                            |
| S35     | 输出主体13px、诊断与辅助12px、交互输入13px；失败诊断/徽标红色，选中tab蓝色；本地目录辅助字号上调。                                                                                                                                  |
| S36     | 输出工具栏可换行，tab区min-width0+局部滚动；交互输入允许换行，手机stdin与输出堆叠，避免页面级横向撑开。待浏览器复验。                                                                                                               |
| S37     | 桌面授课slide明确有界高度、题面min-height0+内滚；手机取消固定高与裁切，正常纵向滚动；长标题/样例可换行或局部滚动。待浏览器复验。                                                                                                    |
| S38     | 投屏桌面代码/结果统一有界高度，各自滚动；小屏结果与代码堆叠；长标题换行。待浏览器复验。                                                                                                                                             |
| S39     | 运行历史真实分页与空态，History支持练习/状态筛选；Monitor列表分页；详情提交侧栏分页。待浏览器复验筛选/分页及滚动。                                                                                                                  |
| S40     | 教师指南改为账号密码导出、标签页再次导出和忘记密码重置重新交付；冲突说明不再暗示界面自动对比合并。                                                                                                                                  |

附加：CodeEditor动态资源加载失败有独立错误状态与重试，重试不清空草稿。文件目录冲突UI仍保留原有显式比较，不增加静默覆盖。

## 验证

- `pnpm --filter @classroom/web typecheck`：通过（实现后的focused检查）。
- `pnpm --filter @classroom/web build`：通过（含真实 Vite 模板编译）。首次真实构建发现 Workspace 两个多语句事件被格式化成无效表达式，已改为命名函数；修复后对 owned 10 个 SFC 执行 compiler-sfc.parse 与 compileTemplate，0 errors，随后重新构建通过。
- 所有owned Vue与useLocalDirectory的 `pnpm exec eslint ...`：通过。
- 所有owned源码 `pnpm exec prettier --write ...`：已执行。
- 没有在本子任务运行真实学生程序、发求助或提交作品；没有修改现有学生草稿来验证race。
- 主agent统一负责全站 `pnpm check`、`pnpm test`、`pnpm build` 和真实浏览器逐页截图、窄屏overflow、滚动、关键异步流程复验。

## 复验重点

1. 慢网下A→B快速切题/切学生：代码、revision、标题、结果一致；读取不触发PUT；教师离页不丢最后修改。
2. 运行中切题：确认后停止才进入下一题；异课堂活动任务可返回原题控制；EOF后输入关闭。
3. 空历史/无练习/失联/服务器409：页面可恢复，错误与只读状态清楚；不会创建空草稿覆盖。
4. 历史超过100条可访问后页；学生详情提交快照可投屏；草稿投屏无假输出。
5. 1440×900、390×844下授课题面、工作区输入输出、投屏结果内容可达，无页面横向overflow。

## 浏览器复验后的补修

- 手机同步状态被原始CSS隐藏：使用scoped `.ide-actionbar .save-label` 明确display与足够优先级；手机整行显示且清margin，避免100%宽度叠加边距溢出。
- 学生详情切题求助误示：直接读取所选学生+练习workspace GET的help，并验证exercise_id；不再使用overview的跨题求助状态。
- 快速切题Monaco异步高亮Canceled：关闭非必要occurrencesHighlight/selectionHighlight；更换/销毁模型时先detach editor，再dispose editor/model。未添加全局异常吞噬。教师浏览器agent复验8次快速切题（120ms间隔）报告新增pageerror为[]。
- 提交深链接：按submission query初始化提交tab，精确请求并选中固定快照；同路由query更新可重新选择，找不到时明确报错。依赖API的submissionId精确过滤，由主agent补齐后再复验。
