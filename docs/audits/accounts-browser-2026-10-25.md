# 账号、名册与管理端浏览器审计（2026-10-25）

## 范围与方法

只读审计隔离 HEAD 预览 `http://127.0.0.1:5180`。Playwright session `accounts-browser2`；1440×900、390×844；截图目录 `output/playwright/audit/accounts-browser/`。不修改业务源码，不创建账号、不审批、不删除、不停用、不真实恢复、不保存配置、不创建备份。恢复和加入成功状态仅通过浏览器 route fulfill mock（恢复复现用 HTTP 201）验证，未写服务器。

覆盖 login、recover、未登录 join 重定向、已登录 join、mock 成功；teacher roster 全部/在线/待审批和添加/导入弹窗；admin health/teachers/settings/tasks/backups 首尾滚动及创建账号弹窗。截图已通过 view_image/联系图检查。视口变化后等待350ms，消除侧栏 CSS 动画瞬时截图；隐藏 offcanvas 不计为溢出。

## 已证实问题

1. **P1 /login 无法登录：recover 成功后 mode 切换残留 done**。mock `/api/auth/recover` 返回201 → 点击成功按钮“返回登录” → URL 是 `/login`，标题“登录码上课堂”，正文仍为“恢复申请已记录，请联系平台管理员”，无账号密码表单；再点“返回登录”仍在相同地址。证据 `auth-recover-to-login-stale-mobile.png`。对应 `apps/web/src/views/AuthView.vue` 的 done 未随 route/mode 重置（与静态 A04 一致）。
2. **P2 管理账号全量表无查找/分页**。真实数据库249行，桌面文档17502px、手机17522px；从顶部定位尾部老师账号需长距离滚动。界面侧栏叫“教师账号”，内容实际包括学生/管理员。证据 `admin-teachers-{desktop,mobile}.png` 及 `-bottom.png`。注意这是 HEAD 预览；当前工作区 AdminView 已有搜索/分页，不能据此声称当前工作区未实现。
3. **P2 管理记录全量铺开且手机 JSON 截断**。backups 页面桌面35154px、手机35186px；手机首条JSON的classroomId右端超出卡片并被裁切（内容元素right435 > viewport390，页面宽仍390）；记录没有可见分页/筛选。证据 `admin-backups-mobile.png`、`admin-backups-mobile-bottom.png`。不将其误报为整个页面横向溢出。
4. **P3 在线成员空状态文案不对应**。零在线成员点击“在线成员0”，空态“没有匹配的成员 / 新申请会显示在这里”，不是在线状态提示。证据 `roster-online-mobile.png`。已等待UI更新重新截图，未误将切换前离线行当成筛选错误。
5. **P3 recover成功重复返回登录入口**。成功按钮和下方链接同时“返回登录”。证据 `auth-recover-mock-success-mobile.png`。

## 通过与边界

- Auth login/recover/join两尺寸无页面横向溢出；已登录 join 表单和mock成功均可读。未登录 join 重定向至 `/login?redirect=/join`，正常。
- Roster手机表格内部横向滚动（全部成员 client352/scroll570，在线空态352/398）；页面宽390，不是页面横向溢出。添加与导入弹窗两尺寸可见，Escape关闭，无真实提交。
- Admin health和settings两尺寸未发现页面横向溢出；settings手机需纵向滚动约2713px，底部保存按钮可达；没有保存。admin tasks手机表格内部横向滚动，不误报为页面溢出。
- 管理端五页巡查未捕获 pageerror；初始未登录及身份切换时出现预期 `/api/session` 401，不能据此推断受保护页面业务错误。未运行代码执行/生产Linux验证。
- 尚未验证真实恢复/入班/创建/密码重置/停用/备份写操作，以及错误/加载慢/大型弹窗内容状态。当前范围只有页面与无副作用交互审计，不表示这些功能已验证。
