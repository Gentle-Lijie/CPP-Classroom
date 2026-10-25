# 修复后账号与管理端 AI 复验

验证时间：2026-10-25 UTC / 2026-10-26 上海时间。当前工作区 Vite `http://127.0.0.1:5174`，独立 Playwright session `accounts-validation`；不是5180原HEAD基线。仅操作 `.local/product-browser-fixtures.json` 的合成课堂和本轮额外创建学生，未改动主fixture学生的密码。截图目录 `output/playwright/validation/accounts/`；1440×900和390×844，视口切换等待300ms，首尾滚动，截图经view_image逐张或联系图审看。凭据密码单元格已mask，未将密码写入报告或日志。下载CSV仅保留在忽略的本地Playwright输出，不纳入交付文档。

## 本轮发现并修复

- RosterView和AdminView的格式化后多语句模板@click缺语句边界，Vite编译失败；改为显式箭头函数块，Prettier重跑后仍合法。
- Roster手机长登录账号列被压到80px，69字符账号导致首行高301px。账号单元格改显式class并设min-width200px/max-width220px，保留换行及表格局部滚动；首行降至114px。显式class同时避免待审批/已移除没有checkbox列时nth-child错列。
- Admin任务UUID列被压到60px，手机单行高306px，8条任务页面高2977px。任务列设200–240px，修复后页面1113px，表格局部横滑，文档宽390。
- Admin登录账号设200–260px并换行，手机局部横滚宽983降至644px；凭据对话框账号列和密码列增加最小宽，防止长值逐字换行；手机凭据表内部scroll739/client318，行高118px。

改动文件：`apps/web/src/views/RosterView.vue`、`apps/web/src/views/AdminView.vue`、`apps/web/src/components/classroom/CredentialDialog.vue`。未改API和共享CSS。

## 真实合成数据交互通过

| 流程              | 证据/结果                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 名册分页          | 初始23人，每页10，1/3到3/3显示21–23且3行；不是全量长表                                                                                                                                                                          |
| 新建学生与凭据    | 额外新建“浏览器凭据验收”，生成凭据对话框；真实CSV下载download.failure=null                                                                                                                                                      |
| 凭据关闭/刷新     | 关闭后可重开，刷新后仍1份，第二次真实下载完成                                                                                                                                                                                   |
| 凭据清除          | 点击清除弹独立确认；取消后1份仍在；再次确认后清除且对话框关闭。`credential-clear-confirm-mobile.png`                                                                                                                            |
| 选页批量重置      | 搜索仅本轮额外学生→勾选本页→确认重置1人，成功生成1份新凭据。未重置students[0]或其余主fixture学生                                                                                                                                |
| 导入模板          | 实际下载“学生名单模板.csv”完成                                                                                                                                                                                                  |
| 部分失败与重试    | 两行合成导入：第1行真实创建成功，第2行浏览器mock409；显示成功1/失败1并只保留失败行。移除mock后重试，真实创建失败行且内容清空；成功行没有重复导入。`import-partial-mock-mobile.png`。这是混合真实/mock验证，不能冒充真实后端故障 |
| 已移除恢复        | 仅本轮额外学生移除→已移除页可见1行→恢复课堂访问→全部成员搜索可见1行                                                                                                                                                             |
| 管理账号分页/筛选 | 292账号，默认20/页，共15页；第2页21–40；teacher筛选重置第1页且13行均教师；无匹配搜索0行                                                                                                                                         |
| 恢复申请关闭      | 对合成fixture teacher提交恢复申请，HTTP201；管理员打开该申请填写合成处理原因关闭；审计展开图显示该teacher用户名及处理原因。未修改密码                                                                                           |
| 未知管理section   | `/admin/not-a-real-section`重定向`/admin/health`                                                                                                                                                                                |
| 管理创建对话框    | 双尺寸打开与Escape关闭；本轮未再创建管理员账号                                                                                                                                                                                  |

## Mock状态与视觉通过

- recover mock201成功后点击返回登录，URL/login且重新出现2个账号密码输入框，原A04复现不再存在；不声称该mock测试写入真实恢复申请。
- join pending mock：文案“课堂列表会显示待审批状态”，按钮“查看申请状态”；active mock：文案“已经是课堂成员”，按钮“进入课堂列表”。双尺寸截图`auth-join-{pending,active}-mock-*`。
- login/recover、名册四tab、凭据、admin health/teachers/settings/tasks/backups以及创建对话框双尺寸均已截图。正文/说明与状态有可见层级，主按钮蓝色、危险操作红色、凭据说明橙色，长账号不扩大文档宽度。
- 管理五页双视口document.scrollWidth均等于1440/390。手机：账号表client356/scroll644，任务表client356/scroll892，均为局部横滑；名册client356/scroll788。未把这些局部区域误报为页面overflow。
- 审计记录现在371–372条按20条分页（19页）；手机页面约2820px，展开JSON仍document390，无旧基线JSON裁切问题。仅只读打开详情，未创建备份。
- 平台配置手机约2750px、桌面1570px，已滚到底确认保存区域可达；未保存配置。平台概况只读，不能以UI状态替代原生Linux执行验证。

## 验证与边界

- `pnpm --filter @classroom/web typecheck`通过；三个改动文件Prettier check通过。全仓`pnpm check/test/build`由root统一跑，避免共享dist构建触发API watch重启干扰并行验收。
- 起初公共AppShell编译错误与API重启502曾阻断，修复/重新加载身份后恢复；有一条导入mock409预期console error，不标为产品故障。
- 手机input computed14px已通知root公共CSS owner考虑16px以免iOS自动缩放；本轮桌面Chromium不等于真实iOS测试。
- 不声称生产Linux、真实短信/邮件、所有权限组合、真实外部故障或所有并发状态已验收。
