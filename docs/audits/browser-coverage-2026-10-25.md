# 浏览器截图覆盖核对

隔离 HEAD 原版本审查，不是新版本修复验收。以 `apps/web/src/main.ts` 声明和本轮截图文件交叉核对。17个Vue view均有浏览器截图；对应25个具体非重定向页面变体均有桌面/手机证据（AdminView按4个section展开）。不能据此宣称所有动态状态或写操作覆盖。

| Vue view             | 路由变体                                          | 截图前缀（audit内）                                      |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| ClassesView          | teacher/classes、student/classes                  | platform/teacher-classes、student-classes                |
| OverviewView         | teacher/overview                                  | teacher-browser/overview                                 |
| ExercisesView        | teacher/exercises                                 | teacher-browser/exercises                                |
| ExerciseEditorView   | teacher/exercises/new、teacher/exercises/:id/edit | teacher-browser/exercises-new、exercise-edit             |
| TeachingView         | teacher/teach                                     | teacher-browser/teach                                    |
| MonitorWindowView    | teacher/monitor                                   | teacher-browser/monitor                                  |
| StudentDetailView    | teacher/students/:id、teacher/inspect/:id         | platform/student-detail、student-inspect                 |
| RosterView           | teacher/roster                                    | accounts-browser/roster-all、online、pending             |
| SettingsView         | teacher/settings                                  | teacher-browser/settings及environment/policy/archive     |
| SubmissionsView      | teacher/submissions                               | teacher-browser/submissions                              |
| WorkspaceView        | student/workspace                                 | platform/student-workspace                               |
| HistoryView          | student/history                                   | platform/student-history                                 |
| ProjectionView       | projection/:id                                    | platform/projection-draft                                |
| AuthView             | login、recover、join                              | accounts-browser/auth-login、recover、join-authenticated |
| PlatformSettingsView | admin/settings                                    | accounts-browser/admin-settings                          |
| AdminView            | admin/health、teachers、tasks、backups            | accounts-browser/admin-health、teachers、tasks、backups  |
| GuideView            | guide（teacher和student角色均拍）                 | platform/guide、teacher-guide                            |

重定向 `/`、`/admin/environment`、未知路径fallback不计入view页面覆盖，未找到逐项独立截图证据；未登录join的登录重定向已验证。`/admin/:section`未知section不是明确导航页面，未独立检查。

状态局限：无真实在线学生、无真实提交的页面只检查相应空态；投屏截图为草稿而非完整提交/运行结果变体；mock空课堂/无练习、recover/join成功状态不证明服务器写操作。其余未覆盖错误/慢请求/竞争与写交互以各专项报告为准。

本地索引：`output/playwright/audit/index.html`，99张图片，95张默认预览；隐藏1张明确fullPage伪影 `teacher-browser/preview-mobile.png` 和3张早期联系图（单张原图后来有重拍）。可选择显示排除项，但不生成其缩略预览。
