# 修复后浏览器验收覆盖核对

当前验收来自工作区5174，不是原HEAD5180审查。按最新AGENTS规范，桌面教学/编程流程是验收范围；已有390px截图保留作补充，不作为实现或验收要求。

本地截图索引 `output/playwright/validation/index.html`，图片清单 `output/playwright/validation/manifest.json`；默认只显示桌面，可按teacher/accounts/student/shared、视口和状态筛选。模拟成功、模拟失败、真实校验错误、真实合成空态均单独标明。旧 `teacher/submission-deeplink-mobile.png` 为已修缺陷现场，默认排除；以 `submission-v1-fixed-desktop.png` 为修后证据。联系图仅辅助，默认排除。

## 17个View与25个页面变体

| Vue View             | 路由变体                                          | 桌面截图（validation内）                                                                       |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ClassesView          | teacher/classes；student/classes                  | shared/teacher-classes-desktop；student/student-classes-1440                                   |
| OverviewView         | teacher/overview                                  | teacher/overview-desktop                                                                       |
| ExercisesView        | teacher/exercises                                 | teacher/exercises-desktop                                                                      |
| ExerciseEditorView   | teacher/exercises/new；teacher/exercises/:id/edit | teacher/exercises-new-desktop；shared/exercise-edit-desktop                                    |
| TeachingView         | teacher/teach                                     | teacher/teach-desktop                                                                          |
| MonitorWindowView    | teacher/monitor                                   | teacher/monitor-desktop                                                                        |
| StudentDetailView    | teacher/students/:id；teacher/inspect/:id         | teacher/students-…-desktop；shared/student-inspect-desktop                                     |
| RosterView           | teacher/roster                                    | accounts/roster-all-desktop等四tab                                                             |
| SettingsView         | teacher/settings                                  | teacher/settings-desktop                                                                       |
| SubmissionsView      | teacher/submissions                               | teacher/submissions-desktop                                                                    |
| WorkspaceView        | student/workspace                                 | student/student-workspace-1440；real-linux-run；real-interactive-eof                           |
| HistoryView          | student/history                                   | student/student-history-1440；history-after-100                                                |
| ProjectionView       | projection/:id                                    | teacher/projection-draft-desktop；projection-submission-desktop；shared/projection-run-desktop |
| AuthView             | login；recover；join                              | accounts/auth-login-desktop；auth-recover-desktop；auth-join-active/pending-mock-desktop       |
| PlatformSettingsView | admin/settings                                    | accounts/admin-settings-desktop                                                                |
| AdminView            | admin/health；teachers；tasks；backups            | accounts/admin-{health,teachers,tasks,backups}-desktop                                         |
| GuideView            | guide                                             | student/guide-1440                                                                             |

当前17/17个Vue View有新版桌面证据。具体25个非重定向页面变体25/25有新版桌面证据；独立inspect窗口已单独补拍，不用普通详情代替。AdminView按四个导航section展开计数。

`/`、`/admin/environment`、fallback是重定向，不计入25个页面变体；未知admin section→health已实际验证。运行投屏、草稿投屏、提交投屏是一个route的不同状态，不重复增加route计数。

## 证据限制

- 截图只表示浏览器页面/状态覆盖，不表示所有操作、权限组合、并发、生产Linux或数据迁移都已验收。
- 本轮流程修改仅合成验收数据；真实交互通过和mock状态区别详见各专项报告。
- recover成功→login以及join active/pending通过浏览器mock验证；导入部分失败由真实成功行与mock409失败行混合验证，不能写成真实外部服务故障。
- shared bootstrap/connection截图为预设503验证，不是当前服务正常画面，也不能据图认定当前服务仍故障。

最终扫描：110张图片，默认桌面50张、已有窄屏56张，其余4张为辅助联系图；teacher33、accounts50、student15、shared12。前次107张扫描时，gallery浏览器强制加载全部未排除图片后brokenimg=0，目录/视口/模拟失败筛选通过；最终补入3张桌面图仅刷新清单，未扩大浏览器验收。

Root补充桌面课堂12项分页、第2页及trim搜索证据：`shared/teacher-classes-page2-desktop.png`、`shared/teacher-class-search-desktop.png`。已有编辑、独立inspect、运行投屏补图均有1440宽页面几何且errors=[]，以rootshared结果记录为准。

最终追加：`shared/platform-unsaved-desktop.png`、`teacher/teach-mock-long-desktop.png`、`teacher/exercises-mock-long-desktop.png`；两个长内容图明确标“模拟长内容”，不混为正常真实数据或模拟成功写操作。总验收结论与机器检查见`validation-summary-2026-10-26.md`。
