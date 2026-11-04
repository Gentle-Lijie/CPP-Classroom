import { t } from '@/i18n'

// Data-layer status values are shared enum codes (snake_case) with the API;
// this maps them to locale keys for display. Unknown values are returned
// unchanged.
const statusKeys: Record<string, string> = {
  finished: 'status.finished',
  published: 'status.published',
  ongoing: 'status.ongoing',
  resolved: 'status.resolved',
  normal: 'status.normal',
  submitted: 'status.submitted',
  compile_error: 'status.compile_error',
  runtime_error: 'status.runtime_error',
  platform_error: 'status.platform_error',
  resource_limited: 'status.resource_limited',
  timeout: 'status.timeout',
  draft: 'status.draft',
  help_requested: 'status.help_requested',
  running: 'status.running',
  not_started: 'status.not_started',
  not_run: 'status.not_run',
  queued: 'status.queued',
  compiling: 'status.compiling',
  stopped: 'status.stopped',
  closed: 'status.closed',
  archived: 'status.archived',
}

export function statusLabel(value: string): string {
  const key = statusKeys[value]
  return key ? t(key) : value
}
