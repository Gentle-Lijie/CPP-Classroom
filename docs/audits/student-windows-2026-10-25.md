# 学生与独立教学窗口审计（2026-10-25）

范围：Workspace、History、StudentDetail（含 inspect 独立窗口）、Teaching、MonitorWindow、Projection、Guide；CodeEditor、RunOutput、LocalDirectoryPanel、useLocalDirectory；相关 workspace、teaching、runs API。

本阶段只定位、不修改业务代码。定位以工作区审计时源码为准；浏览器使用隔离 HEAD 原版本 `http://127.0.0.1:5180`。下述“静态确认”表示源码执行路径明确存在，并不冒充浏览器复现。截图证据与实测补充见文末。

## P1：数据与关键流程

### S01 教师示范代码切题/离页丢失或串题〔静态确认〕

- 定位：`apps/web/src/views/TeachingView.vue:49`、`:72`、`:93`、`:126`。
- 触发：编辑后 600ms 内切题；或编辑后立即离页。保存定时器没有按题捕获 ID，离页仅清除定时器。
- 影响：上一题代码可能写进下一题，或最后修改未保存。
- 验收：延迟保存中切题/离页须 flush 或拦截；每次保存绑定原题 ID 与 revision，不丢修改、不串题。

### S02 教师切题读取结果竞争〔静态确认〕

- 定位：`apps/web/src/views/TeachingView.vue:49`。
- 触发：模拟网络延迟，快速 A→B，A 请求晚于 B 返回。
- 影响：A 的代码和 revision 覆盖 B 的工作区。
- 验收：过期响应不能写入当前题；显示正确题目的草稿与保存状态。

### S03 教师加载草稿被当成编辑自动回写〔静态确认〕

- 定位：`apps/web/src/views/TeachingView.vue:57`、`:67`。
- 触发：读取远端赋值 teacherCode 后 finally 同步设置 loading=false；Vue watch 随后执行。
- 影响：只查看也可能触发 PUT、增加 revision；多窗口冲突、归档课堂产生错误。
- 验收：仅打开/切题且未编辑不能 PUT；dirty 必须来源于用户编辑。

### S04 学生草稿读取阶段仍允许编辑和提交〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:67`、`:81`。
- 触发：减慢 workspace GET，在返回前编辑/运行/提交；loading 非响应式且未纳入 readonly。
- 影响：用户输入被远端覆盖，甚至可能先保存空草稿。
- 验收：读取期间明确加载态，禁止编辑/运行/提交；成功加载后才开放。

### S05 学生快速切题与旧轮询结果串题〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:81`、`:95`、`:262`、`:271`。
- 触发：A→B 请求逆序返回；旧 run GET 在切题后返回。
- 影响：旧题代码、缓存、revision、结果可能进入新题上下文。
- 验收：异步链捕获课堂/题目键；过期响应不 commit；快速切题后所有数据一致。

### S06 撤销重置跨练习污染〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:58`、`:81`、`:240`、`:393`。
- 触发：重置 A 后切 B，点击仍存在的“撤销重置”。
- 影响：A 代码写进 B；原代码为空时因 v-if="undo" 无法撤销。
- 验收：恢复区按题隔离或切题清空，空文件也可撤销。

### S07 运行中切题丢失活动任务控制〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:86`、`:113`、`:262`；`apps/api/src/modules/runs.ts:55`。
- 触发：A 交互运行时切 B；loadCode 清空 run 且只查 B 历史。
- 影响：A 无法从当前题停止；后端全局单任务限制又阻止 B 运行。
- 验收：切题前提供停止/保留运行提示；跨题活动任务始终可见、可停止。

### S08 查看学生的异步结果串人〔静态确认〕

- 定位：`apps/web/src/views/StudentDetailView.vue:50`、`:97`。
- 触发：A reload 进行中切 B；B 因 loading 返回，A 结果随后写入。
- 影响：B 标题下显示 A 代码，可能误下载/误投屏。
- 验收：切人清旧状态，按 student+exercise generation 校验，旧请求绝不写入。

### S09 有学生无练习时学生详情崩溃〔静态确认〕

- 定位：`apps/web/src/views/StudentDetailView.vue:40`、`:142`、`:156`。
- 触发：课堂有学生但无练习，进入学生详情；模板只 guard student。
- 影响：读取 exercise.title/filename 时出现 undefined 错误。
- 验收：展示“尚无练习”空态与创建练习入口，页面不报错。

### S10 提交快照投屏必然失败〔静态确认〕

- 定位：`apps/web/src/views/StudentDetailView.vue:74`、`:111`、`:288`；`apps/api/src/modules/teaching.ts:139`。
- 触发：选择提交记录后点击投屏，submission ID 被传为 runId。
- 影响：API 只查 runs，返回运行记录不存在。
- 验收：区分 submission/run/current 草稿类型；允许的每类投屏均正确，禁止项明确说明。

### S11 学生操作缺少防重复提交〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:189`、`:226`、`:245`。
- 触发：网络慢时双击运行、确认提交或发送求助。
- 影响：重复提交作品/求助；重复运行冲突；没有明确等待反馈。
- 验收：各操作 pending 禁用与 loading 文案；失败保留表单；重复点击只产生一次操作。

### S12 离页忽略本地目录 flush 失败〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:303`。
- 触发：云端已保存，但本地磁盘冲突或写入失败，随后离页。
- 影响：flush=false 被忽略，仍可离开；本地文件未按用户预期保存。
- 验收：本地 flush 失败必须提示、允许备份并拦截离开，处理逻辑与切题一致。

## P2：历史、反馈与教学状态

### S13 运行历史无记录/加载失败为白板〔静态确认〕

- 定位：`apps/web/src/views/HistoryView.vue:10`、`:33`。
- 触发：新学生无运行，或 runs 请求失败。
- 影响：只有标题与禁用下载，无法区分加载、失败或空记录。
- 验收：loading/error/empty 分开，失败可重试，空态有前往课堂/编程入口。

### S14 历史永久截断100条而宣称全部〔静态确认〕

- 定位：`apps/web/src/views/HistoryView.vue:40`；`apps/api/src/modules/runs.ts:109`。
- 触发：学生在课堂产生超过100条运行。
- 影响：旧记录不可访问，客户端分页不能弥补服务端截断。
- 验收：服务端总数/分页或游标可访问所有历史，前端分页筛选与真实数据一致。

### S15 历史页切课堂仍显示旧课堂记录〔静态确认〕

- 定位：`apps/web/src/views/HistoryView.vue:10`。
- 触发：保持 History 路由，在 shell 切课堂；仅 mounted 加载一次。
- 影响：课堂上下文与作品不一致。
- 验收：课堂键变化清选择、重载记录，过期响应不回填。

### S16 提交状态刷新即丢失且不反映禁止重交〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:87`、`:226`、`:344`；`apps/api/src/modules/teaching.ts:79`。
- 触发：提交后刷新；或教师关闭 allowResubmit 后再次进入。
- 影响：前端不知道已提交，仍提供会被API拒绝的操作。
- 验收：显示服务端提交状态/时间；禁止重交时禁用并说明，允许重交时明确版本关系。

### S17 求助状态跨题共享且“更新”实际追加〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:245`；`apps/web/src/data/demo.ts` 的 demo.helpSent。
- 触发：A 求助后切 B，或再次点击“更新求助”。
- 影响：B 错显已求助；更新实际新增请求，不是修改既有。
- 验收：求助状态按用户/课堂/题目来自服务端；更新与新增文案/行为一致。

### S18 解决当前题求助会清除全课堂求助〔静态确认〕

- 定位：`apps/web/src/views/StudentDetailView.vue:87`、`:123`；`apps/api/src/modules/teaching.ts:64`。
- 触发：学生在多题求助，教师详情仅标“关联当前练习”，点击解决。
- 影响：全课堂该学生所有未解决求助被一起解决。
- 验收：展示题目与请求时间，按请求或明确题目范围解决；批量解决须明确告知。

### S19 巡视当前题标题配上其他题运行/提交状态〔静态确认〕

- 定位：`apps/api/src/modules/teaching.ts:26`、`:27`；`apps/web/src/views/MonitorWindowView.vue:48`。
- 触发：学生 A 题失败/提交后，转到 B。
- 影响：B 标题下显示 A 的编译失败或已提交，误导辅导决策。
- 验收：当前题状态关联 exercise_id；课堂累计信息独立标注。

### S20 学生详情轮询放大为全课堂数据请求〔静态确认〕

- 定位：`apps/web/src/views/StudentDetailView.vue:57`、`:105`。
- 触发：多位学生详情窗口同时打开，每秒各4请求，其中 help/submissions 取全课堂。
- 影响：长课堂、大量提交、多窗口导致不必要传输和数据库压力。
- 验收：聚合或按学生题目过滤，提交分页；后台降频，保持正确实时性。

### S21 所有编译错误固定指向第10行〔静态确认〕

- 定位：`apps/web/src/views/HistoryView.vue:73`、`StudentDetailView.vue:225`、`WorkspaceView.vue:421`。
- 触发：任意其他行编译失败后查看代码。
- 影响：假错误定位误导学生。
- 验收：使用真实文件/行号；无法解析时不伪造高亮。

### S22 保存失败仍用成功图标/同步绿点且手机隐藏状态〔静态确认，布局待浏览器〕

- 定位：`apps/web/src/views/WorkspaceView.vue:337`、`:547`。
- 触发：断网/保存失败；在窄屏查看。
- 影响：CloudCheck 和服务器同步绿点误示成功；手机无法看到保存异常。
- 验收：所有屏宽可见同步状态；pending/error/conflict 使用对应图标/语义色与重试。

### S23 读取失败伪装成版本冲突并提供错误恢复动作〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:114`、`:170`。
- 触发：切题时 workspace GET 网络失败。
- 影响：旧题或空代码残留；被称作“本机修改”并可下载，混淆真实草稿。
- 验收：加载错误与409冲突分离；未成功加载时只提供明确重试，不拿旧题冒充当前草稿。

### S24 本机存储异常可中断自动保存调度〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:75`、`:161`。
- 触发：localStorage 禁用或满，backup 抛异常。
- 影响：watch 在设保存定时器前中断；无可靠备份错误反馈。
- 验收：本机备份 best-effort，异常显示；云端保存继续工作，不出现未捕获异常。

### S25 原始时间/完整UUID降低可扫读性〔静态确认，视觉待浏览器〕

- 定位：`apps/web/src/views/HistoryView.vue:50`、`StudentDetailView.vue:196`、`:284`、`apps/web/src/components/classroom/RunOutput.vue:75`。
- 触发：正常浏览多条运行、详情和输出。
- 影响：ISO时间及长UUID拥挤，不能快速识别记录。
- 验收：本地化时间与短记录号；完整ID可复制/查看，不撑开布局。

### S26 编译标准信息硬编码互相矛盾〔静态确认〕

- 定位：`apps/web/src/views/HistoryView.vue:66`、`StudentDetailView.vue:218`、`TeachingView.vue:180`、`WorkspaceView.vue:413`；`CodeEditor.vue:246`。
- 触发：平台改为 C++20，或查看不同编译配置的历史。
- 影响：当前环境、编辑器提示、快照标签不一致。
- 验收：历史保留实际编译配置；当前标签来自真实配置；不将当前配置套到旧快照。

## 投屏与输出

### S27 投屏加载/网络失败被说成不存在〔静态确认〕

- 定位：`apps/web/src/views/ProjectionView.vue:14`、`:17`、`:26`、`:75`。
- 触发：首次加载或瞬时断网。
- 影响：有效快照被清空，每3秒重复报错，投屏中断。
- 验收：加载、404/过期、网络异常区分；网络中断保留最后快照，过期停止无效轮询。

### S28 投屏DTO与RunRecord不匹配〔静态确认〕

- 定位：`apps/api/src/modules/teaching.ts:141`、`:155`、`:177`；`apps/web/src/views/ProjectionView.vue:14`、`:72`。
- 触发：从当前草稿投屏；或运行快照投屏。
- 影响：草稿没有 status/output/exit，运行快照缺 id/time；RunOutput 显示空标签、缺元信息与退出原因。
- 验收：projection DTO 区分草稿/运行/提交；无运行时不渲染伪运行结果；必要元信息完整。

### S29 投屏控制缺少可读标签和忙碌状态〔静态确认〕

- 定位：`apps/web/src/views/ProjectionView.vue:28`、`:48`、`:52`。
- 触发：键盘/屏幕阅读器操作字号按钮，或慢网连点撤销。
- 影响：图标操作无意义标签，达到字号边界无反馈，撤销无进行中状态。
- 验收：aria-label、字号边界禁用、撤销 pending 防重并可见错误。

### S30 交互输入失败即丢失内容〔静态确认〕

- 定位：`apps/web/src/components/classroom/RunOutput.vue:101`。
- 触发：发送时断网、超过API4096字符限制，或连续Enter。
- 影响：emit后立即清空；失败无法恢复，可能重复输入。
- 验收：成功确认后才清空，失败保留；pending防重；明确单次长度限制。

### S31 EOF后仍能继续发送〔静态确认〕

- 定位：`apps/web/src/views/WorkspaceView.vue:68`、`:218`、`:457`；`RunOutput.vue:115`；`apps/api/src/modules/runs.ts:151`。
- 触发：发送EOF后程序尚未结束，再输入/EOF。
- 影响：界面继续提供必然409的操作。
- 验收：EOF成功立即显示stdin已关闭，禁用输入/重复EOF，保留停止能力。

### S32 编译诊断条数伪造为1〔静态确认〕

- 定位：`apps/web/src/components/classroom/RunOutput.vue:51`。
- 触发：存在多条编译诊断。
- 影响：徽标固定1，误导实际错误量。
- 验收：真实解析计数，或仅标“失败”而不伪造数值。

### S33 清空后标准错误tab不恢复显示〔静态确认〕

- 定位：`apps/web/src/components/classroom/RunOutput.vue:57`、`:67`、`:90`。
- 触发：清空输出后选择标准错误tab。
- 影响：仍显示已清空，与其他tab行为不同；复制却复制隐藏原始内容。
- 验收：各tab清空/恢复语义一致，复制与当前可见内容关系明确。

### S34 教师只读页面出现无效运行引导〔静态确认〕

- 定位：`apps/web/src/components/classroom/RunOutput.vue:96`。
- 触发：教师详情无运行，或草稿投屏。
- 影响：提示点击页面不存在的“编译运行”。
- 验收：按学生编辑/教师查看/投屏上下文使用不同空态。

## 视觉、滚动与使用指南

### S35 关键输出字号仅8–10px〔静态确认，视觉待浏览器〕

- 定位：`apps/web/src/styles.css:2239`、`:2263`、`:2290`。
- 触发：阅读运行时间、退出原因、交互输入。
- 影响：关键教学信息难读；失败诊断缺乏有效语义强调。
- 验收：主要信息12–14px、辅助信息11–12px；成功/警告/失败可辨，蓝色品牌保留。

### S36 输出工具栏窄宽度拥挤风险〔待浏览器验证〕

- 定位：`apps/web/src/styles.css:2206`；`RunOutput.vue:30`。
- 触发：390px手机、桌面狭窄输出栏且stderr tab出现。
- 影响：多个tab与复制/清除图标可能撑开区域。
- 验收：无页面级横向overflow；工具栏换行或局部滚动，控件可点击。

### S37 长授课题面滚动边界不明确〔待浏览器验证〕

- 定位：`apps/web/src/teaching.css:344`、`:356`。
- 触发：长题面/大量样例，在题面与对照模式滚动。
- 影响：aspect-ratio、min-height、父overflow:hidden与子height:100%组合可能裁切内容。
- 验收：桌面题面区域完整内滚；手机自然滚动；最后一行与样例可达，无横向溢出。

### S38 投屏代码/结果高度不协调〔待浏览器验证〕

- 定位：`apps/web/src/styles.css:2583`、`:2592`、`:2602`。
- 触发：长输出、长诊断或短视口投屏。
- 影响：代码最小530px，结果未明确统一max-height，可能拉长页面或挤出屏幕。
- 验收：桌面代码与输出可独立滚动；小屏堆叠且全部内容可达。

### S39 工作区/详情历史缺分页与完整空态〔静态确认，布局待浏览器〕

- 定位：`apps/web/src/views/StudentDetailView.vue:268`、`WorkspaceView.vue:529`。
- 触发：无记录或大量记录。
- 影响：长列表难导航、无法按状态筛选；空记录只有hint；API截断见S14。
- 验收：复用历史组件、清晰empty/loading/error，真实分页/筛选，选择稳定。

### S40 使用指南仍描述一次性密码交付〔静态确认〕

- 定位：`apps/web/src/views/GuideView.vue:13`。
- 触发：教师依据指南添加学生。
- 影响：忽略账号密码导出、补交付与找回路径，重复产生验收问题。
- 验收：指南与最终账号交付功能一致，明确导出、保存范围、忘记密码后的重新交付。

## 组件附加观察与边界

- LocalDirectoryPanel / useLocalDirectory 对既有文件、外部修改提供显式冲突比较，没有据此宣称必然静默覆盖；确定的流程缺口是S12。
- CodeEditor 有dispose与语言服务generation保护。Monaco动态import缺少编辑器失败UI：资源加载失败可能表现空白编辑区，待网络故障浏览器验证。
- 未触发真实运行、提交、求助、重置、草稿保存或删除；race复现应使用mock路由，不能在真实学生草稿上试验。
- 本文未将静态布局风险标为已截图复现。

## 浏览器证据

浏览器验收进行中；输出目录：`output/playwright/audit/student/`。最终只把实际产生并检查的截图、console与overflow结果列入此处。
