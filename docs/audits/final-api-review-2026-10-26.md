# API 修复终审（2026-10-26）

## 结论与范围

对当前工作区 classroom/auth/admin/teaching/runs/workspace、Drizzle schema 与 0006/0007 迁移、worker compiler profile 修改进行独立只读审查。**未发现应以新增 P1 回归、跨角色越权或确定丢数据阻断交付的问题。** 本结论是代码审查，不替代 root 的真实验收和 browser 收尾；本审查未创建账号/课堂/草稿、未调用业务写接口、未执行代码、未重跑检查。只新增本文档。

## 关键修复核对

- **身份隔离与密码重置**：新增用户名使用 teacher UUID + 学号摘要，长度 69，低于登录 username 的 80 字符上限。不同教师同号不会自动合并；同一教师复用时核对姓名和 created_by，停用账号被拒绝。reset SQL 同时约束本课堂 active、student、created_by 等于当前教师、未停用，按用户 ID 锁行，全量匹配后才写密码。原 A01 的任意教师复用学号后接管账号路径已关闭。旧账号 created_by 保持 null，不猜测回填授权，属保守恢复策略。
- **事务与锁**：入队最终复核在事务中按 classroom→exercise→membership→user 锁定；课堂更新/练习关闭/成员移除先锁课堂，重置亦先课堂后有序用户，管理员改密锁用户后更新 runs。未发现本轮新增的确定锁顺序环。用户锁保证单账号活动任务校验串行，队列 advisory lock 与 worker 共用。关闭/撤权先完成时，新入队拒绝；入队先持有课堂锁时，撤权等待其提交后能扫描到新任务。
- **练习一致性**：创建默认尾部 position；关闭、重排、编辑均递增 version；变草稿/关闭会清推荐并请求停止该题运行；推荐设置仅允许本课堂已发布题目。旧编辑不再无条件覆盖关闭/重排结果。
- **提交**：同用户同题 advisory lock 串行判断；相同 revision 重试返回既有快照，禁止重交时不同 revision 被拒绝。分页过滤 SQL 的 $1..$5 与参数一致，LIMIT/OFFSET 为 $6/$7；空页回查 total 使用同过滤参数。exact submissionId 仍受课堂、学生角色自身过滤约束，不可凭 UUID 获取他人提交。
- **求助与工作区**：学生 GET help 强制 user.id；更新求助在同用户同题锁内；resolve 必须给 requestId 或 exerciseId 且查询同时绑定课堂/学生。workspace 返回自身提交/求助状态；教师指定 student 前校验课堂教师所有权，草稿查询带课堂和练习。
- **全局活动运行**：scope=all 仅在 active=true 且目标为当前 actor 本人时开启，不能通过 student 参数查询其他人的跨课堂任务。常规 run GET 仍绑定课堂，控制接口要求运行归本人。
- **交互输入**：对 run 行加锁后检查活动交互状态和 eof；累计输入字节在锁内计算，EOF 与输入插入同事务，后续 EOF/输入会拒绝。未发现此次改动放宽他人输入控制的路径。
- **投屏**：runId/submissionId 互斥且分别查对应表；课堂、学生、练习均绑定。snapshot 有 kind 与快照元信息，GET/撤销继续限课堂所属教师。
- **导出**：repeatable read read only 保持表间快照；源代码/日志在传给 API 前由 PostgreSQL 统计累计条数和字节，超过 10000 条或 64 MiB 拒绝。表名由固定枚举生成，筛选值参数化。roster 最大课堂容量 50，未计入主体容量不构成绕过大代码限制。
- **迁移与编译信息**：0006 仅新增可空 created_by 外键，0007 仅新增可空 compiler_profile，journal 有对应版本，不删表、不重置既有数据。worker 从同一 settings 对象记录 compiler_profile 并选编译标准；历史 null 不伪装为已知环境。未核验部署环境迁移状态。

## 补充并发复核：R01 / R02 已关闭

### R01 / 已修复 / 登录与改密的交错

复核最终 `auth.ts:login`：密码读取/校验、插入 session 均在同一事务内，通过 users FOR UPDATE 与个人改密、管理员/教师重置互斥，commit 后才设置 cookie。登录先锁定时，后续重置会删除该登录建立的会话；重置先提交时，后续登录读取新 hash，旧密码失败。原交错路径已关闭。

已阅读 `login-race.test.ts` 的三个确定性测试：登录与个人改密竞争、提交失败不设置 cookie、失败登录保留尝试计数并释放事务。root/accounts 报告三个测试及相关 focused 11 项通过；本审查未自行重跑，不将模型测试标成真实 PostgreSQL 登录并发实测。

### R02 / 已修复并有真实 PostgreSQL 时序证据 / 撤权与在途写入

复核 `ClassroomService.lockWritable`：按 classroom SHARE → exercise SHARE → student membership SHARE → user SHARE 获取并持有事务锁，最终复查课堂/题目状态、成员 active、账号未停用/角色及教师所有权。workspace 的完整 CAS、help 的更新/插入、submit 的幂等判断/插入均在调用该 helper 的同一事务内执行。run admission 保留相同顺序并直接 user FOR UPDATE，不先取得 user SHARE 再升级。

未发现新增锁升级环：helper 后续不更新 users/classrooms/exercises/memberships；提交重复取得 exercise SHARE 不涉及升级；草稿/求助/提交外键检查需要的 KEY SHARE 与既有 SHARE 兼容。help/submit 的专用 advisory lock 没有其他流程反向取得；课堂变更先 classroom UPDATE，账号停用/改密先 user UPDATE，写入入口在最终锁取得后持有到提交。run 的 user UPDATE 没有 SHARE 升级竞争。

已阅读 `scripts/revocation-acceptance.mjs` 与 root 提供的 `.local/revocation-acceptance-result.json`：8 个真实 PostgreSQL 阻塞时序（membership/disabled × save/help/submit/run）均通过，脚本用 pg_blocking_pids 确认请求已阻塞在最终权限锁，再提交撤权，预期全部 403，并核对草稿 revision 不变、无求助/提交/运行新增。结果记录 `noCodeExecuted: true`。这是 root 执行的隔离合成数据证据，本审查只读复核脚本及结果，未重新执行。

## 不计入阻断的事项

旧账号不能由教师重置、教师创建账号可用于加入其他课堂、教师仍可看本课堂已移除成员历史作品，均与当前明确授权/历史保留模型一致；未据此报告越权。分页 count 与 items 非一致性快照可能在实时数据变化时短暂不同，不是丢数据。兼容旧客户端的无分页列表仍存在，不等同新分页失效。macOS 引擎检查不作为原生 Linux 生产隔离证明。
