export default {
  roles: {
    student: '学生',
    teacher: '教师',
    admin: '管理员',
  },
  view: {
    headingMeta: '{role}工作台 · 使用导览',
    title: '几步熟悉课堂工作流',
    eyebrow: '{role}专属导览',
    introStudent: '用模拟工作区，试一遍编程流程',
    introTeacher: '从准备课堂，到授课、巡视与作品管理',
    introAdmin: '从平台状态，到账号、执行配置与备份',
    totalSteps: '共 {count} 步',
    start: '开始导览',
    lockedNotice: '部分章节需要先{prerequisite}。完整导览会先介绍当前可用的章节。',
    prerequisiteStudent: '加入课堂并等待教师发布练习',
    prerequisiteOther: '选择课堂并准备练习',
    sectionsTitle: '只看需要的环节',
    stepsCount: '{count} 步',
    requiresExercises: ' · 需要课堂中有可访问的练习',
    requiresClassroom: ' · 需要先选择课堂',
    startChapter: '开始',
    startChapterAria: '开始{title}导览',
    reasonNoClassroom: '请先选择课堂',
    reasonNoExercises: '请先在课堂中准备可访问的练习',
    footnote: '← → 切换步骤，Esc 退出；导览不会替你运行、提交或修改数据。',
  },
  spotlight: {
    topline: '{role}导览 · {chapter}',
    exit: '退出导览',
    progress: '导览进度',
    contentsLabel: '导览章节',
    locating: '正在定位…',
    fallback: '当前页面暂无此功能区域；数据加载完成或满足使用条件后可查看。',
    contents: '目录',
    stepsCount: '{count} 步',
    previous: '上一步',
    next: '下一步',
    finish: '完成导览',
    retry: '重试定位',
    reasonLocating: '正在定位导览内容，请稍候',
    firstStep: '已经是导览的第一步',
    navigateError: '当前页面暂时无法进入。请先处理未保存内容，或退出导览后选择可用章节。',
    loadError: '页面读取失败，请检查连接后重试此步骤。',
    keyboardInteractive: '可操作聚光区域 · 全部为模拟数据 · Esc 退出',
    keyboardMock: '模拟数据演示 · ← → 切换 · Esc 退出',
    keyboardDefault: 'Esc 退出 · ← → 切换 · 导览不会自动执行功能操作',
  },
  workspace: {
    ariaLabel: '学生工作区模拟演示',
    bannerTitle: '模拟导览 · 示例课堂',
    bannerBody: '所有代码、文件和结果均为模拟，可放心尝试',
    className: 'C++ 入门 · 示例课堂',
    switchExercise: '切换示例题目',
    selectExercise: '选择课堂练习',
    saved: '已同步到服务器',
    workdir: '工作目录',
    helpSent: '模拟求助已发送',
    help: '求助',
    submitted: '模拟作品已提交',
    submit: '提交作品',
    run: '编译运行',
    tabProblem: '题目说明',
    tabHistory: '运行历史',
    problemArea: '① 题目区 · 练习 {index}',
    interactiveDesc: '逐行读取整数并输出累计值；读到输入结尾后输出总和。',
    inputTitle: '输入说明',
    inputHintSum: '两个整数 a 和 b，以空格或换行分隔。',
    inputHintName: '一个名字，例如 Ada。',
    outputTitle: '输出说明',
    outputHintSum: '输出 a + b 的结果。',
    outputHintName: '输出 Hello, 名字!。',
    sample: '样例',
    sampleInput: '样例输入',
    sampleOutput: '样例输出',
    teacherVisible: '教师可查看本课堂的代码与运行记录，为你提供辅导。',
    historyTitle: '本题运行快照 · 示例',
    statusDone: '运行完成',
    statusFailed: '编译失败',
    statusRunning: '运行中／可输入',
    snapshotBTitle: '补上分号后的版本',
    snapshotBMeta: '示例记录 B · stdout: 5',
    snapshotATitle: '第 5 行缺少分号',
    snapshotAMeta: '示例记录 A · 保留原始编译诊断',
    historyNote: '每条快照保留当次代码、输入与结果，和当前草稿分别保存。',
    areaCode: '② 代码区',
    missingSemicolon: '缺少分号 ;',
    footnoteDiag: '示例诊断：第 5 行语句未结束',
    footnoteNormal: 'clangd · 可选的浏览器补全与诊断',
    autosave: '草稿自动保存',
    areaInput: '③ 输入',
    fillSample: '填入样例',
    mockStdin: '模拟标准输入',
    sentInput: '已发送的输入',
    sentInputLabel: '已发送输入',
    newlineNote: '发送会在每一行末尾加上换行符。',
    runtimeReason: '此开关由当前模拟场景决定，请切换导览场景',
    runtimeInput: '运行时输入',
    mockRun: '模拟运行',
    compileDiag: '编译诊断',
    areaOutput: '④ 运行输出',
    failed: '失败',
    outputLabel: '运行输出',
    fixedTitle: '修正后编译成功',
    fixTitle: '修正提示',
    fixedBody: '模拟程序已执行，输出 5。原来的失败快照会保留在历史中。',
    fixBody:
      'sum.cpp:5:36 表示文件名、第 5 行、第 36 列。该行末尾缺少 ;，编译器因此无法继续解析下一行。',
    fixButton: '补上分号并重新编译（模拟）',
    mockRuntimeInput: '模拟运行时输入',
    inputPlaceholder: '输入一个整数…',
    runEndedReason: '本次模拟运行已结束，请重新运行后操作',
    send: '发送',
    stop: '停止',
    stdinClosed: 'stdin 已关闭 · 本次模拟已结束',
    programStopped: '程序已停止。',
    dirTitle: '本地工作目录',
    dirSubtitle: '把网页草稿与自己电脑上的源文件关联起来',
    dirPath: 'C++练习 / {file}',
    disconnect: '断开模拟目录',
    connect: '模拟选择工作目录',
    dirConnected: '已授权 · 已关联 {file} · 已同步到模拟磁盘',
    dirNotConnected: '尚未关联 · 点击按钮演示授权与文件关联',
    webEditor: '网页编辑器',
    authorizedDir: '授权的目录',
    fromWeb: '从网页修改',
    fromWebDesc: '编辑后自动写入关联文件，服务器草稿独立保存。',
    fromOthers: '从其他编辑器修改',
    fromOthersDesc: '每 2 秒检查磁盘；网页没有未保存改动时读取外部版本。',
    reopen: '换题或重新打开',
    reopenDesc: '按当前题目文件名重新关联；权限失效时需重新授权。',
    dirBrowserNote:
      '实际目录读写需要支持此能力的浏览器（如 Chrome / Edge）；本演示不请求任何磁盘权限。',
    conflictTitle: '磁盘与编辑器都有修改',
    conflictSubtitle: '自动写入已暂停 · {file} · 模拟冲突',
    editorDraft: '编辑器草稿',
    diskFile: '磁盘文件',
    codeLabel: '代码',
    keepBackup: '保留模拟草稿备份',
    overwriteDisk: '用草稿覆盖模拟磁盘',
    readDisk: '读取模拟磁盘文件',
    backupKept: '模拟草稿备份已保留。',
    noAutoOverwrite: '没有版本会被自动覆盖，请对照后选择。',
    statusSynced: '已同步 · 模拟草稿',
  },
  chapters: {
    student: {
      workspace: {
        title: '认识工作区',
        description: '先看布局，再切题和编写代码。',
        steps: {
          overview: {
            title: '先看工作区全貌',
            description:
              '左侧读题，右侧写代码，下方准备输入、查看结果；顶部负责切题、工作目录、运行与提交。接下来的内容都是可操作的模拟演示。',
          },
          exercises: {
            title: '左上角切换题目',
            description:
              '这里切换课堂内的题目，题面、文件名和代码会随题目切换。试着选择另一道示例题；真实使用时，切题前会保存当前草稿。',
          },
          editor: {
            title: '编写代码与保存草稿',
            description:
              '代码区对应当前题目的源文件，工具栏提供字号、下载和补全设置。草稿会自动同步到服务器；工作目录则是可选的本地文件同步。',
          },
        },
      },
      directory: {
        title: '理解工作目录',
        description: '演示目录授权、文件同步与版本冲突。',
        steps: {
          directory: {
            title: '工作目录怎样同步文件',
            description:
              '选择目录并授权后，平台按题目指定的文件名关联或创建文件。编辑后自动写入磁盘，并每 2 秒检查外部修改；切题后需关联新文件。本步可以模拟选择目录。',
          },
          conflict: {
            title: '两个版本不同时，由你决定',
            description:
              '已有同名文件，或磁盘和编辑器都被修改时，自动写入会暂停。对照版本后选择保留哪一份；读取磁盘前的草稿会留作备份。这里的选择只改变模拟文件。',
          },
        },
      },
      execution: {
        title: '输入、输出与调试',
        description: '试运行、逐行输入，并修正一次编译错误。',
        steps: {
          batch: {
            title: '预填输入，一次运行',
            description:
              '左侧的文本作为程序的标准输入 stdin；程序通过 cin 读取，cout 的内容显示在右侧 stdout。试着修改两个整数并模拟运行，输入结束后会自动关闭 stdin。',
          },
          interactive: {
            title: '交互输入：发送一行，读取一行',
            description:
              '运行前勾选“运行时输入”，程序启动后 stdin 保持打开。这里可发送整数并观察累计结果；EOF 只关闭输入，程序读到结尾后完成，停止则直接结束运行。',
          },
          diagnostics: {
            title: '看懂编译错误和修正提示',
            description:
              '这次模拟编译因第 5 行缺少分号而失败，程序尚未执行。诊断给出文件名、行列和原因；按提示补上分号，再模拟编译，观察结果变化。',
          },
        },
      },
      records: {
        title: '求助、提交与回看',
        description: '区分草稿、提交与运行快照。',
        steps: {
          submission: {
            title: '求助与提交作品',
            description:
              '遇到问题可附上说明向教师求助；完成后主动提交固定版本。自动保存草稿不等于提交，提交也不等于判题通过。这里的求助和提交都只作模拟。',
          },
          history: {
            title: '回看每一次尝试',
            description:
              '运行历史保存当次代码、输入与结果，可以对照失败和修正后的版本。查看快照不会覆盖当前草稿。退出导览后会回到原来的页面。',
          },
        },
      },
    },
    teacher: {
      classes: {
        title: '准备课堂',
        description: '创建课堂并安排学生加入。',
        steps: {
          create: {
            title: '创建或选择课堂',
            description: '先创建课堂，再准备学生名单与练习；课堂列表用于切换不同教学班。',
          },
        },
      },
      roster: {
        title: '安排学生入班',
        description: '导入名单、交付账号或审批申请。',
        steps: {
          credentials: {
            title: '学生与账号交付',
            description:
              '可添加或导入学生并交付登录凭据，也可审批课堂码入班申请。忘记密码时核实身份后再重置。',
          },
        },
      },
      exercises: {
        title: '准备练习',
        description: '编写题目、发布并设置推荐。',
        steps: {
          compose: {
            title: '编排并发布练习',
            description:
              '创建题面、样例与初始代码，预览后发布。推荐练习用于引导学生进入当前讲解的题目。',
            condition: '创建第一道练习后，这里会展示题目列表与预览。',
          },
        },
      },
      teaching: {
        title: '授课与巡视',
        description: '讲解题目、查看进度并处理求助。',
        steps: {
          stage: {
            title: '讲解题目与示范代码',
            description:
              '按讲解需要切换题面、代码或同时展示；顶部可打开独立巡视窗口，关注学生进度。',
          },
        },
      },
      overview: {
        title: '关注学生进度',
        description: '从总览定位问题，进入学生详情辅导。',
        steps: {
          stats: {
            title: '先看课堂状态',
            description:
              '在线、提交、编译失败和求助统计帮助你判断进度，点击统计卡片可筛选对应学生。',
          },
          detail: {
            title: '进入详情辅导',
            description:
              '从学生列表进入详情，查看草稿、运行快照和求助上下文，再选择需要讲解的作品。',
          },
        },
      },
      submissions: {
        title: '收集课堂作品',
        description: '查看提交并导出作品。',
        steps: {
          export: {
            title: '查看提交与导出作品',
            description:
              '这里收集学生主动提交的固定版本，可按练习、学生或所选记录导出。归档课堂前可先保存作品。',
          },
        },
      },
      settings: {
        title: '管理课堂状态',
        description: '设置开放状态、邀请和课堂策略。',
        steps: {
          archive: {
            title: '开放、设置与归档',
            description:
              '在这里管理课堂状态、邀请和提交策略。归档会停止运行并关闭加入、编辑和提交，作品与历史保留。',
          },
        },
      },
    },
    admin: {
      health: {
        title: '查看平台状态',
        description: '了解课堂、在线人数和任务队列。',
        steps: {
          overview: {
            title: '先看平台概况',
            description:
              '关注开放课堂、在线成员、排队任务和平台失败数量，再按需要进入配置或任务详情。',
          },
        },
      },
      accounts: {
        title: '管理账号',
        description: '创建账号，处理密码与恢复申请。',
        steps: {
          recovery: {
            title: '账号与身份恢复',
            description:
              '在这里创建和管理账号。停用、重设密码或处理恢复申请前，先核实身份并妥善交付凭据。',
          },
        },
      },
      platform: {
        title: '检查执行环境',
        description: '检查服务连接，配置运行限额。',
        steps: {
          connections: {
            title: '检查服务连接',
            description: '查看业务服务、数据库与执行节点的连接状态。连接正常仅代表服务可达。',
          },
          limits: {
            title: '配置编译与运行限额',
            description:
              '统一设置 C++ 标准、资源限制和执行并发，调整后主动保存。执行节点地址由服务端管理。',
          },
        },
      },
      tasks: {
        title: '排查失败任务',
        description: '查看失败原因与诊断详情。',
        steps: {
          diagnose: {
            title: '定位平台执行问题',
            description: '查看失败任务的状态、原因和详情，区分学生程序问题与平台执行环境问题。',
          },
        },
      },
      backups: {
        title: '备份与追溯',
        description: '验证备份并查看管理记录。',
        steps: {
          verify: {
            title: '备份与恢复验证',
            description:
              '创建备份后会在独立临时数据库验证恢复，保留现有数据。下方管理记录可追溯备份与其他管理操作。',
          },
        },
      },
    },
  },
}
