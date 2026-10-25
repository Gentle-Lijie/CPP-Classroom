# 浏览器内 C++ 语言服务

统一组件 `apps/web/src/components/classroom/CodeEditor.vue` 在底部显示 clangd 开关。每个实例默认关闭，开启、重试和关闭只影响当前实例；不保存全局偏好。教师示范、学生编辑、题目初始代码与只读快照均使用该组件。只读状态不会因语言服务开启而改变。

## 数据流与生命周期

Monaco → `browser-clangd.ts` → JSON-RPC MessagePort → 同源 SharedWorker → clangd WASM。源码仅进入本机浏览器虚拟文件系统，不发送给语言服务后端，也不执行学生程序。多实例共享底层运行时，但文档 URI、会话、补全 provider 和诊断分别隔离。

当前提供 C++17 补全（含成员、参数片段和附加 include 编辑）、悬浮说明和实时错误／警告。修改后 250 ms 合并同步；只接受当前 model 版本的 UTF-16 诊断，忽略过时结果。关闭开关、换文件名或离开页面时移除 provider、清空诊断并释放会话；运行时在无会话时由依赖包延迟回收。首次启动超时可重试。

## 资源与浏览器

依赖固定为 `@algoproclub/clangd-wasm@0.1.1` 与 `vscode-jsonrpc@8.2.0`，由 pnpm 锁文件管理。开启时按需加载本项目静态资源：WASM 约 26 MiB、GNU 标准库头文件约 43 MiB、系统索引约 5 MiB，以及运行时代码。生产构建自动输出这些文件；部署需允许同源 Worker 和 WebAssembly，并正确服务 `.wasm`（`application/wasm`）。缓存策略应随构建散列更新，避免混用版本。

需要 SharedWorker、Web Locks、WebAssembly JSPI；使用支持这些能力的新版桌面 Chrome／Edge。组件先做能力检测，不支持时说明原因，基础编辑仍可使用。此方案不依赖 SharedArrayBuffer，也无需为它添加 COOP／COEP。Vite 开发模式对依赖包动态 runtime import 做静态解析兼容，生产模式保留包原本的资源加载方式。

## 分析与执行的差异

当前包使用 LLVM clangd 与 AArch64 Linux GNU/GCC 13 头文件，不等于实际 go-judge 节点的 GCC 版本、目标架构和编译参数。编辑期诊断不能代替最终编译结果；平台运行配置草稿不会改变此语言服务的 C++17 参数。目前只同步当前文档及内置标准库，不同步学生目录中的自定义头文件或完整项目配置。多编辑器的性能和大课堂容量仍需独立评估。

依赖包声明 `Apache-2.0 WITH LLVM-exception`；其 `LICENSES/README.md` 尚未包含完整的第三方发行材料。公开分发前需核实并补齐 LLVM、GNU 头文件及索引相关的许可和源码提供义务。当前未把依赖包声明当作发行许可审计完成。

平台业务后端、身份与课堂权限、编译运行及交互 EOF 没有在此功能中实现。
