export default {
  roles: {
    student: 'Student',
    teacher: 'Teacher',
    admin: 'Admin',
  },
  view: {
    headingMeta: '{role} Workspace · Guided Tour',
    title: 'Get to know the classroom workflow in a few steps',
    eyebrow: 'Tour for {role}',
    introStudent: 'Try the coding workflow in a simulated workspace',
    introTeacher: 'From preparing a class to teaching, monitoring, and managing work',
    introAdmin: 'From platform health to accounts, execution settings, and backups',
    totalSteps: '{count} steps in total',
    start: 'Start the tour',
    lockedNotice:
      'Some chapters require you to first {prerequisite}. The full tour starts with the chapters that are currently available.',
    prerequisiteStudent: 'join a class and wait for the teacher to publish exercises',
    prerequisiteOther: 'select a class and prepare exercises',
    sectionsTitle: 'Pick only what you need',
    stepsCount: '{count} steps',
    requiresExercises: ' · Requires accessible exercises in the class',
    requiresClassroom: ' · Requires selecting a class first',
    startChapter: 'Start',
    startChapterAria: 'Start the {title} tour',
    reasonNoClassroom: 'Please select a class first',
    reasonNoExercises: 'Please prepare an accessible exercise in the class first',
    footnote:
      'Use ← → to switch steps and Esc to exit; the tour never runs, submits, or changes data for you.',
  },
  spotlight: {
    topline: '{role} Tour · {chapter}',
    exit: 'Exit the tour',
    progress: 'Tour progress',
    contentsLabel: 'Tour chapters',
    locating: 'Locating…',
    fallback:
      'This feature area is not on the current page yet; it appears once data has loaded or usage conditions are met.',
    contents: 'Contents',
    stepsCount: '{count} steps',
    previous: 'Back',
    next: 'Next',
    finish: 'Finish tour',
    retry: 'Retry locating',
    reasonLocating: 'Locating tour content, please wait',
    firstStep: 'This is the first step of the tour',
    navigateError:
      'This page cannot be opened right now. Handle any unsaved content first, or exit the tour and choose an available chapter.',
    loadError: 'Failed to load the page. Check your connection and retry this step.',
    keyboardInteractive: 'Interact with the spotlighted area · All data is simulated · Esc to exit',
    keyboardMock: 'Simulated demo · ← → to switch · Esc to exit',
    keyboardDefault: 'Esc to exit · ← → to switch · The tour never performs actions automatically',
  },
  workspace: {
    ariaLabel: 'Simulated student workspace demo',
    bannerTitle: 'Guided Demo · Sample Class',
    bannerBody: 'All code, files, and results are simulated — feel free to experiment',
    className: 'C++ Basics · Sample Class',
    switchExercise: 'Switch sample exercise',
    selectExercise: 'Choose a class exercise',
    saved: 'Synced to server',
    workdir: 'Working directory',
    helpSent: 'Simulated help request sent',
    help: 'Ask for help',
    submitted: 'Simulated work submitted',
    submit: 'Submit work',
    run: 'Build & Run',
    tabProblem: 'Problem',
    tabHistory: 'Run history',
    problemArea: '① Problem area · Exercise {index}',
    interactiveDesc:
      'Read integers line by line and print the running total; print the sum once the end of input is reached.',
    inputTitle: 'Input',
    inputHintSum: 'Two integers a and b, separated by a space or a newline.',
    inputHintName: 'A name, for example Ada.',
    outputTitle: 'Output',
    outputHintSum: 'Print the value of a + b.',
    outputHintName: 'Print Hello, name!.',
    sample: 'Samples',
    sampleInput: 'Sample input',
    sampleOutput: 'Sample output',
    teacherVisible: 'The teacher can view your code and run records for this class to help you.',
    historyTitle: 'Run snapshots for this problem · Example',
    statusDone: 'Run finished',
    statusFailed: 'Build failed',
    statusRunning: 'Running / accepting input',
    snapshotBTitle: 'Version with the semicolon added',
    snapshotBMeta: 'Example record B · stdout: 5',
    snapshotATitle: 'Missing semicolon on line 5',
    snapshotAMeta: 'Example record A · Original compiler diagnostic kept',
    historyNote:
      'Each snapshot keeps the code, input, and result of that run, stored separately from the current draft.',
    areaCode: '② Code area',
    missingSemicolon: 'Missing semicolon ;',
    footnoteDiag: 'Sample diagnostic: statement on line 5 is unfinished',
    footnoteNormal: 'clangd · optional in-browser completion and diagnostics',
    autosave: 'Draft autosaved',
    areaInput: '③ Input',
    fillSample: 'Fill with sample',
    mockStdin: 'Simulated standard input',
    sentInput: 'Input sent so far',
    sentInputLabel: 'Sent input',
    newlineNote: 'Each send appends a newline at the end of the line.',
    runtimeReason:
      'This switch is controlled by the current demo scene; switch the tour scene instead',
    runtimeInput: 'Runtime input',
    mockRun: 'Simulate run',
    compileDiag: 'Build diagnostics',
    areaOutput: '④ Program output',
    failed: 'Failed',
    outputLabel: 'Program output',
    fixedTitle: 'Build succeeds after the fix',
    fixTitle: 'Fix hint',
    fixedBody:
      'The simulated program ran and printed 5. The earlier failed snapshot is kept in the history.',
    fixBody:
      'sum.cpp:5:36 means the file name, line 5, column 36. The line is missing a trailing ;, so the compiler cannot continue parsing the next line.',
    fixButton: 'Add the semicolon and rebuild (simulated)',
    mockRuntimeInput: 'Simulated runtime input',
    inputPlaceholder: 'Enter an integer…',
    runEndedReason: 'This simulated run has ended; run it again to continue',
    send: 'Send',
    stop: 'Stop',
    stdinClosed: 'stdin closed · This simulation has ended',
    programStopped: 'Program stopped.',
    dirTitle: 'Local working directory',
    dirSubtitle: 'Link the web draft with source files on your own computer',
    dirPath: 'C++ Exercises / {file}',
    disconnect: 'Disconnect simulated directory',
    connect: 'Simulate choosing a working directory',
    dirConnected: 'Authorized · Linked to {file} · Synced to the simulated disk',
    dirNotConnected: 'Not linked · Click the button to demo authorization and file linking',
    webEditor: 'Web editor',
    authorizedDir: 'Authorized directory',
    fromWeb: 'Edit from the web',
    fromWebDesc:
      'Edits are written to the linked file automatically; the server draft is saved independently.',
    fromOthers: 'Edit from another editor',
    fromOthersDesc:
      'The disk is checked every 2 seconds; external versions are read when the page has no unsaved changes.',
    reopen: 'Switching problems or reopening',
    reopenDesc:
      'Relinks using the current problem file name; re-authorization is needed if permission expires.',
    dirBrowserNote:
      'Reading and writing a real directory requires a browser that supports it (such as Chrome / Edge); this demo requests no disk permissions.',
    conflictTitle: 'Both the disk and the editor have changes',
    conflictSubtitle: 'Auto-write paused · {file} · Simulated conflict',
    editorDraft: 'Editor draft',
    diskFile: 'Disk file',
    codeLabel: 'Code',
    keepBackup: 'Keep a backup of the simulated draft',
    overwriteDisk: 'Overwrite the simulated disk with the draft',
    readDisk: 'Load the simulated disk file',
    backupKept: 'A backup of the simulated draft has been kept.',
    noAutoOverwrite: 'No version is overwritten automatically; compare them and choose.',
    statusSynced: 'Synced · Simulated draft',
  },
  chapters: {
    student: {
      workspace: {
        title: 'Know your workspace',
        description: 'See the layout first, then switch problems and write code.',
        steps: {
          overview: {
            title: 'A full view of the workspace',
            description:
              'Read the problem on the left, write code on the right, and prepare input and check results below; the top bar handles problem switching, the working directory, running, and submitting. Everything that follows is an interactive simulated demo.',
          },
          exercises: {
            title: 'Switch problems at the top left',
            description:
              'Switch between the class problems here; the statement, file name, and code change with the problem. Try selecting the other sample problem; in real use, the current draft is saved before switching.',
          },
          editor: {
            title: 'Write code and save drafts',
            description:
              'The code area maps to the source file of the current problem, and the toolbar offers font size, download, and completion settings. Drafts sync to the server automatically; the working directory is an optional local file sync.',
          },
        },
      },
      directory: {
        title: 'Understand the working directory',
        description: 'See directory authorization, file sync, and version conflicts.',
        steps: {
          directory: {
            title: 'How the working directory syncs files',
            description:
              'After you choose a directory and authorize it, the platform links or creates files using the file name specified by the problem. Edits are written to disk automatically, and external changes are checked every 2 seconds; after switching problems a new file must be linked. This step lets you simulate choosing a directory.',
          },
          conflict: {
            title: 'When two versions differ, you decide',
            description:
              'If a file with the same name already exists, or both the disk and the editor have been modified, auto-write pauses. Compare the versions and choose which one to keep; the draft from before loading the disk is kept as a backup. Choices here only change the simulated files.',
          },
        },
      },
      execution: {
        title: 'Input, output, and debugging',
        description: 'Try a run, send input line by line, and fix a build error.',
        steps: {
          batch: {
            title: 'Prefill input, run once',
            description:
              'The text on the left becomes the program standard input stdin; the program reads it via cin, and what it prints to cout appears as stdout on the right. Try changing the two integers and simulating a run; stdin closes automatically once input ends.',
          },
          interactive: {
            title: 'Interactive input: send a line, read a line',
            description:
              'Check "Runtime input" before running, and stdin stays open after the program starts. Here you can send integers and watch the running total; EOF only closes input and the program finishes after reading to the end, while Stop ends the run immediately.',
          },
          diagnostics: {
            title: 'Read build errors and fix hints',
            description:
              'This simulated build fails because line 5 is missing a semicolon, so the program has not run. The diagnostic gives the file name, position, and reason; follow the hint to add the semicolon, build again, and watch the result change.',
          },
        },
      },
      records: {
        title: 'Help requests, submissions, and review',
        description: 'Tell drafts, submissions, and run snapshots apart.',
        steps: {
          submission: {
            title: 'Ask for help and submit work',
            description:
              'When stuck, attach a note and ask the teacher for help; when done, submit to fix a version. Autosaved drafts are not submissions, and a submission is not a passed verdict. The help request and submission here are only simulated.',
          },
          history: {
            title: 'Review every attempt',
            description:
              'Run history keeps the code, input, and result of each run, so you can compare the failed and fixed versions. Viewing a snapshot never overwrites the current draft. After the tour ends you will return to the original page.',
          },
        },
      },
    },
    teacher: {
      classes: {
        title: 'Prepare your classes',
        description: 'Create a class and get students in.',
        steps: {
          create: {
            title: 'Create or select a class',
            description:
              'Create a class first, then prepare the student roster and exercises; the class list is used to switch between teaching groups.',
          },
        },
      },
      roster: {
        title: 'Enroll students',
        description: 'Import the roster, deliver accounts, or approve requests.',
        steps: {
          credentials: {
            title: 'Students and account delivery',
            description:
              'Add or import students and hand over login credentials, or approve join requests made with the class code. Reset a forgotten password only after verifying identity.',
          },
        },
      },
      exercises: {
        title: 'Prepare exercises',
        description: 'Write problems, publish, and set recommendations.',
        steps: {
          compose: {
            title: 'Compose and publish exercises',
            description:
              'Create the statement, samples, and starter code, preview, then publish. Recommended exercises guide students toward the problem currently being discussed.',
            condition:
              'Once you create your first exercise, the problem list and preview appear here.',
          },
        },
      },
      teaching: {
        title: 'Teach and monitor',
        description: 'Explain problems, watch progress, and handle help requests.',
        steps: {
          stage: {
            title: 'Explain problems and demo code',
            description:
              'Switch between the statement, the code, or both as your explanation needs; open the standalone monitor window from the top to follow student progress.',
          },
        },
      },
      overview: {
        title: 'Follow student progress',
        description: 'Locate problems from the overview, then open student details to coach.',
        steps: {
          stats: {
            title: 'Check class status first',
            description:
              'Online, submission, build-failure, and help-request statistics help you judge progress; click a stat card to filter the corresponding students.',
          },
          detail: {
            title: 'Open details to coach',
            description:
              'Open details from the student list, review drafts, run snapshots, and the help-request context, then pick the work you want to walk through.',
          },
        },
      },
      submissions: {
        title: 'Collect class work',
        description: 'Review submissions and export work.',
        steps: {
          export: {
            title: 'Review submissions and export work',
            description:
              'The fixed versions students submit on their own are collected here and can be exported by exercise, by student, or by selected records. Save the work before archiving the class.',
          },
        },
      },
      settings: {
        title: 'Manage class status',
        description: 'Set the open state, invitations, and class policies.',
        steps: {
          archive: {
            title: 'Open, configure, and archive',
            description:
              'Manage the class status, invitations, and submission policies here. Archiving stops runs and closes joining, editing, and submissions, while work and history are kept.',
          },
        },
      },
    },
    admin: {
      health: {
        title: 'Check platform health',
        description: 'See classes, online users, and the task queue.',
        steps: {
          overview: {
            title: 'Start with the platform overview',
            description:
              'Watch the number of open classes, online members, queued tasks, and platform failures, then move on to configuration or task details as needed.',
          },
        },
      },
      accounts: {
        title: 'Manage accounts',
        description: 'Create accounts and handle passwords and recovery requests.',
        steps: {
          recovery: {
            title: 'Accounts and identity recovery',
            description:
              'Create and manage accounts here. Before disabling an account, resetting a password, or handling a recovery request, verify identity and hand over credentials carefully.',
          },
        },
      },
      platform: {
        title: 'Inspect the execution environment',
        description: 'Check service connections and configure run limits.',
        steps: {
          connections: {
            title: 'Check service connections',
            description:
              'Review the connection status of the app service, the database, and the execution nodes. A healthy connection only means the service is reachable.',
          },
          limits: {
            title: 'Configure build and run limits',
            description:
              'Set the C++ standard, resource limits, and execution concurrency centrally, then save deliberately. Execution node addresses are managed server-side.',
          },
        },
      },
      tasks: {
        title: 'Investigate failed tasks',
        description: 'See failure reasons and diagnostic details.',
        steps: {
          diagnose: {
            title: 'Pin down platform execution issues',
            description:
              'Review the status, reason, and details of failed tasks, and tell student program errors apart from platform execution-environment problems.',
          },
        },
      },
      backups: {
        title: 'Backups and audit trail',
        description: 'Verify backups and review admin records.',
        steps: {
          verify: {
            title: 'Backups and restore verification',
            description:
              'After a backup is created, its restore is verified in a separate temporary database while existing data is kept. The admin records below trace backups and other administrative actions.',
          },
        },
      },
    },
  },
}
