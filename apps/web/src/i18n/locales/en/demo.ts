export default {
  notify: {
    loggedInRefreshFailed:
      'Signed in, but classroom data failed to load; please retry the connection',
    loginRefreshFailed:
      'Login succeeded, but classroom data failed to load; please retry the connection',
    exerciseSavedRefreshFailed:
      'Exercise saved, but the list failed to refresh; please retry later',
    classSavedRefreshFailed:
      'Classroom settings saved, but the list failed to refresh; please retry later',
    requestFailed: 'Request failed, please retry',
  },
  bootstrap: {
    offline: 'Cannot reach the server right now; please retry and continue.',
    selectClassroom: 'Select a classroom',
    neverVisited: 'Not visited yet',
  },
  guide: {
    exercises: {
      sumTitle: 'Sum of two numbers',
      sumDescription: 'Read two integers and print their sum.',
      greetingTitle: 'Greetings',
      greetingDescription: 'Read a name and print a greeting.',
    },
    interactive: {
      prompt: 'Enter integers:',
      running: 'Running total: ',
      closed: 'Input closed, total: ',
    },
    batchError: 'This mock program needs two integers, for example 2 3.',
    inputError: 'Please enter an integer, for example 4.',
    conflictDisk: 'Loaded the mock disk file; the previous draft was kept.',
    conflictEditor: 'Overwrote the disk file with the mock draft.',
  },
}
