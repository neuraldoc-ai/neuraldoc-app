// One line per event on stdout/stderr, so `docker logs` and Docker Desktop show what happened.
// Never pass keys, document text or code into a log line.
const QUIET = process.env.NODE_ENV === 'test' || process.argv.some((a) => a.includes('--test'))
const LEVELS = { info: 'log', warn: 'warn', error: 'error' }

function write(level, scope, message, fields) {
  if (QUIET && level !== 'error') return
  const extra = fields ? Object.entries(fields).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${typeof v === 'string' && /\s/.test(v) ? JSON.stringify(v) : v}`).join(' ') : ''
  console[LEVELS[level]](`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${extra ? ' ' + extra : ''}`)
}

export const log = {
  info: (scope, message, fields) => write('info', scope, message, fields),
  warn: (scope, message, fields) => write('warn', scope, message, fields),
  error: (scope, message, fields) => write('error', scope, message, fields),
}

/** Logs an error with its status; programming errors (TypeError etc.) also with the stack. */
export function logError(scope, error, fields) {
  const unexpected = error && !['Error', 'DraftError'].includes(error.constructor?.name)
  write(unexpected || (error?.status ?? 500) >= 500 ? 'error' : 'warn', scope, error?.message || String(error), { ...fields, ...(error?.status ? { status: error.status } : {}) })
  if (unexpected && error?.stack) console.error(error.stack)
}
