const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

const CURRENT_LEVEL = normalizeLevel(import.meta.env.VITE_LOG_LEVEL || 'info')
const SENSITIVE_KEYS = [
  'authorization',
  'token',
  'password',
  'secret',
  'api_key',
  'openai_api_key',
  'telegram_bot_token',
  'image_base64',
  'ocr_text'
]

function normalizeLevel(raw) {
  const level = String(raw || '').trim().toLowerCase()
  return LEVELS[level] ? level : 'info'
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[CURRENT_LEVEL]
}

function looksSensitive(key) {
  const normalized = String(key || '').trim().toLowerCase()
  return SENSITIVE_KEYS.some((candidate) => normalized.includes(candidate))
}

function sanitizeValue(value, key = '', depth = 0) {
  if (looksSensitive(key)) {
    const text = String(value || '')
    return `[redacted len=${text.length}]`
  }

  if (value == null) {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || ''
    }
  }

  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 300)}...[truncated]` : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array len=${value.length}]`
    }
    return value.slice(0, 20).map((item) => sanitizeValue(item, key, depth + 1))
  }

  if (typeof value === 'object') {
    if (depth >= 2) {
      return '[object]'
    }
    const out = {}
    Object.entries(value).forEach(([entryKey, entryValue]) => {
      out[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1)
    })
    return out
  }

  return String(value)
}

function emit(level, event, data = {}) {
  if (!shouldLog(level)) {
    return
  }

  const entry = {
    ts: new Date().toISOString(),
    source: 'renderer',
    level,
    event,
    data: sanitizeValue(data)
  }

  if (typeof window !== 'undefined' && window.electronAPI?.logEvent) {
    try {
      window.electronAPI.logEvent(entry)
    } catch {
      // Ignore IPC logging failures and keep console logging available.
    }
  }

  const consoleMethod =
    level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'info'

  console[consoleMethod](`[SnapRecall] ${event}`, entry.data)
}

export function maskEmail(raw) {
  const email = String(raw || '').trim()
  if (!email) {
    return ''
  }

  const [local, domain] = email.split('@')
  if (!local || !domain) {
    return '***'
  }

  return `${local.slice(0, 1)}***@${domain}`
}

export function summarizeError(err) {
  if (!err) {
    return ''
  }
  if (err instanceof Error) {
    return sanitizeValue(err)
  }
  return sanitizeValue(String(err))
}

export const appLogger = {
  debug(event, data) {
    emit('debug', event, data)
  },
  info(event, data) {
    emit('info', event, data)
  },
  warn(event, data) {
    emit('warn', event, data)
  },
  error(event, data) {
    emit('error', event, data)
  }
}
