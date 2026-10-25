# 学生、独立窗口与公共页面浏览器审查 · 2026-10-25

使用隔离 HEAD 预览5180，Playwright `platform-audit`，桌面1440×900与窄屏390×844。截图实际审看，常规页和控制响应场景分开保存。没有编辑学生代码或点击运行、提交、求助、密码重置。访问工作区会产生产品自身的在线心跳；投屏审查新增一个临时草稿快照，检查后撤销。

## 覆盖

| 页面         | 桌面截图                   | 窄屏截图                  | 观察                                                                               |
| ------------ | -------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| 学生课堂     | student-classes-1440.png   | student-classes-390.png   | 均无全页横向溢出                                                                   |
| 学生工作区   | student-workspace-1440.png | student-workspace-390.png | 桌面锁定工作区；窄屏自然堆叠，文档高1761、可滚到底；保存状态窄屏消失               |
| 学生历史     | student-history-1440.png   | student-history-390.png   | 文档高993/1304；完整UUID、ISO日期挤占列表；窄屏历史卡片为局部横滚                  |
| 学生使用导览 | guide-1440.png             | guide-390.png             | 正文为学生指南，侧栏却显示教师工作台/教师账号；明确角色错误                        |
| 教师课堂     | teacher-classes-1440.png   | teacher-classes-390.png   | 真实5课堂，窄屏文档高2309，无分页；无全页横向溢出                                  |
| 学生详情     | student-detail-1440.png    | student-detail-390.png    | 文档高1006/1380；完整UUID/ISO时间冗长，结果字号过小                                |
| 学生独立详情 | student-inspect-1440.png   | student-inspect-390.png   | 文档高1060/1428，主体可读但输出辅助信息极小                                        |
| 草稿投屏     | projection-draft-1440.png  | projection-draft-390.png  | 未执行的草稿却显示运行结果区、空状态标签、空快照编号及空退出原因；窄屏字号单位拆行 |
| 教师使用导览 | teacher-guide-1440.png     | teacher-guide-390.png     | 仍指导保存一次性密码，需随新交付流程更新                                           |

截图目录 `output/playwright/audit/platform/`。常规页两视口 document.scrollWidth 均等于视口宽。Monaco内的16M像素虚拟绘图层被编辑器裁剪，不是页面横向溢出；局部历史卡片横向滚动也单独记录，不冒充全页溢出。

## 受控空数据复现

仅对 GET exercises 响应使用浏览器route mock返回空数组，未删除或修改服务器题目。

- `mock-empty-overview.png`：主内容空白，捕获 `Cannot read properties of undefined (reading 'title')`，确认T03。
- `mock-empty-student-detail.png`：主内容空白，相同title解引用异常，确认S09。
- `mock-empty-exercises.png`：全局只剩一张“课堂还没有练习”卡，工作台导航、页眉和侧栏全部消失，确认App.vue全局空态问题。

原始指标：`student-metrics.json`、`teacher-extras-metrics.json`、`empty-metrics.json`。原始CLI执行输出也保留。mock场景不等于真实课堂数据曾被删除。

## 可读性与状态

DOM确认工作区页脚9px、窄屏部分辅助信息8px；历史诊断计数8px、记录元信息10px。桌面内容大量留白与关键细节过小并存，应提升正常阅读字号与信息层级。编译失败本身已使用红色，不能说全站完全没有语义色；成功/在线/课堂开放等仍多为灰色，应统一。

常规截图没有pageerror；这不表示切题竞态、保存失败、EOF及真实提交已验证。相关路径仍以源码证据和后续隔离功能验收为准。结果与新版本验收严格区分。
