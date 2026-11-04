export default {
  api: {
    timeout:
      'The request timed out. Check whether it completed before retrying; keep your input for now.',
    disconnected: 'Cannot reach the server. Check your network and retry; keep your input for now.',
    invalidResponse:
      'The server returned an invalid response. Please try again later; keep your input for now.',
    requestFailed: 'Request failed',
  },
  display: {
    pythonStdlib: 'Python 3 · standard library',
    unknownProfile: 'Runtime not recorded',
  },
  csv: {
    emptyRoster: 'Please enter or select a student roster',
    quoteFormat: 'Invalid CSV quoting; please use the roster template',
    unclosedQuote: 'The CSV contains an unclosed quote',
    headerUnsupported:
      'Roster headers only support name, student number, and optional username and password columns',
    headerDuplicate: 'The username and password columns in the roster header cannot repeat',
    noStudents: 'There are no students in the roster',
    tooMany: 'You can import at most 50 students per batch; please import in batches',
    rowIncomplete: 'Row {row} needs both a complete name and student number',
    columnMismatch:
      'Row {row} has a mismatched column count; only name, student number, and optional username and password columns are supported',
    rowTooLong: 'The name or student number in row {row} exceeds 50 characters',
    numberDuplicate: 'Student number {number} appears more than once in the roster; please check',
    usernameInvalid:
      "The username in row {row} may only contain up to 80 letters, digits, and . _ {'@'} -",
    usernameDuplicate: 'Username {username} appears more than once in the roster; please check',
    passwordTooLong: 'The password in row {row} exceeds 200 characters',
  },
  localFiles: {
    diskConflict: 'The file on disk was modified by another program',
    fileTooLarge: 'The file exceeds 1 MB; please select a single source file',
    invalidName: 'Invalid source file name',
    codeTooLarge: 'The code exceeds 1 MB; disk writing has been paused',
  },
  archive: {
    tooManyFiles: 'Too many files; please export in batches',
    invalidEntryName: 'Invalid export file name',
    tooLarge: 'The export exceeds 128 MiB; please export per exercise or per student',
    unnamed: 'Untitled',
  },
  clangd: {
    unsupported:
      'This browser lacks SharedWorker / WebAssembly JSPI; please use a recent Chrome or Edge.',
    loading: 'Loading browser clangd and the C++ standard library…',
    markerSource: 'clangd · browser',
    readyLabel: 'C++17 · in-browser analysis',
    analyzing: 'Analyzing your code…',
    notInitialized: 'clangd did not finish initializing',
    encodingMismatch: 'Incompatible clangd character position encoding',
    stopped: 'clangd stopped: {message}',
  },
  pyright: {
    canceled: 'Python language service startup was canceled',
    loadFailed: 'The Python language service could not load; check your network and retry',
    timeout: 'Python language service startup timed out; check your network and retry',
  },
  import: {
    chooseFile: 'Please choose a .md, .markdown, or exercise backup .json file',
    fileTooLarge: 'The file is too large; the maximum is 1 MiB',
    utf8: 'Cannot read the file; please use UTF-8 encoding',
    invalidChars: 'The file contains invalid characters; please upload a text file',
    invalidJson: 'Invalid JSON; please upload an exercise backup file',
    notBackup: 'This is not a valid exercise backup file',
    unsupportedLanguage: 'Unsupported programming language; please use cpp or python',
    invalidStarters: 'Invalid starter code format',
    startersInvalid: 'Invalid starter code format or it exceeds 100000 characters',
    nullChar: 'The exercise contains invalid null characters; please fix the file and upload again',
    fieldLimit: '{label} exceeds {limit} characters; please shorten it and upload again.',
    filenameInvalid:
      'Invalid source file name or it does not match the language; use a C++ .cpp, .cc, .cxx or a Python .py file name',
    readFailed: 'Failed to read the file',
    filenameInUse: 'Source file name "{filename}" is already used in this classroom',
    filenameDuplicate:
      'The selected files have duplicate source file name "{filename}" (case-insensitive)',
  },
  fields: {
    title: 'Exercise title',
    topic: 'Topic',
    filename: 'Student source file name',
    description: 'Problem statement',
    input: 'Input description',
    output: 'Output description',
    sampleInput: 'Sample input',
    sampleOutput: 'Sample output',
    code: 'Starter code',
  },
  markdown: {
    skippedProse:
      'Explanatory text in "{label}" was skipped; only code blocks were imported, please review.',
    mergedSections: '"{label}" appears more than once and was merged in order; please review.',
    unsupportedLanguage: 'Unsupported programming language; please use C++ or Python.',
    fieldLimit: '{label} exceeds {limit} characters; please split or shorten it and upload again.',
    filenameInvalid:
      'Invalid source file name; please use a C++ .cpp, .cc, .cxx or a Python .py file name and upload again.',
    empty: 'The file has no importable content.',
  },
  teachingWindows: {
    blocked:
      'The browser blocked the separate window; please allow pop-ups for this site and retry',
  },
  sensitive: {
    access: 'Enrollment method',
    capacity: 'Capacity',
    join: 'New member joins',
    run: 'Compile and run permission',
    resubmit: 'Resubmission permission',
    archiveAccess: 'Access after archiving',
  },
  platform: {
    urlInvalid:
      'The node address only supports HTTP(S). Configure credentials on the server; the address must not contain credentials, query parameters, or fragments.',
    urlExample: 'Please enter a valid go-judge address, for example http://10.10.0.20:5050.',
    profileRequired: 'Please choose a controlled compilation environment.',
    range: 'Please check the value ranges: {key} must be an integer between {min} and {max}.',
  },
  copy: {
    copied: 'Copied',
    copy: 'Copy',
    failed: 'Copy failed. Please allow clipboard access, or select the text to copy.',
  },
  localDirectory: {
    notConnected: 'Not connected to a local directory',
    fileDeleted: 'The file was deleted or replaced; please relink. The browser draft is kept',
    permissionLost: 'Directory permission has expired; please grant it again',
    ioFailed: 'Local file operation failed; the browser draft is kept',
    conflictPaused: 'File conflict · automatic writing paused',
    synced: 'Synced to disk',
    writing: 'Writing to disk…',
    pendingWrite: 'Waiting to write the latest changes…',
    waitingWrite: 'Waiting to write to disk…',
    invalidFilename: 'The exercise file name is invalid; please contact the teacher',
    linking: 'Linking {filename}',
    noPermission:
      'Read/write permission for the directory was not granted; the browser draft is kept',
    rememberFailed: 'The directory was authorized, but the browser cannot remember it',
    diskLoaded: 'Disk version loaded · auto-save connected',
    notLinked: 'Current file not linked · browser draft kept',
    disconnectRememberFailed: 'Directory disconnected, but the browser could not clear the record',
    disconnected: 'Directory disconnected · browser draft kept',
    changed: 'The exercise or file name changed; please link the current file',
    rememberedReauth: 'Directory remembered; please click to re-authorize',
    rememberedRelink: 'Directory remembered; please link the current file',
    externalChange: 'External change loaded · {time}',
  },
  health: {
    readFailed:
      'Could not read the health result of the API service; please check the API and the reverse proxy.',
    liveOk: 'API liveness check passed.',
  },
}
