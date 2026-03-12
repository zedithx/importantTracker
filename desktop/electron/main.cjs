const fs = require('node:fs')
const path = require('node:path')
const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  screen
} = require('electron')

require('dotenv').config({ path: path.join(__dirname, '../.env') })

const isDev = !app.isPackaged
const rendererURL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
const defaultCaptureShortcut = process.env.CAPTURE_SHORTCUT || 'CommandOrControl+Shift+S'

let mainWindow = null
let captureShortcut = defaultCaptureShortcut

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'snaprecall-settings.json')
}

function getLogFilePath() {
  return path.join(app.getPath('userData'), 'logs', 'desktop.log')
}

function sanitizeLogValue(value, depth = 0) {
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
    return value.length > 400 ? `${value.slice(0, 400)}...[truncated]` : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array len=${value.length}]`
    }
    return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    if (depth >= 2) {
      return '[object]'
    }

    const out = {}
    for (const [key, entryValue] of Object.entries(value)) {
      const normalizedKey = String(key || '').toLowerCase()
      if (
        normalizedKey.includes('token') ||
        normalizedKey.includes('password') ||
        normalizedKey.includes('secret') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('image_base64') ||
        normalizedKey.includes('ocr_text')
      ) {
        out[key] = '[redacted]'
      } else {
        out[key] = sanitizeLogValue(entryValue, depth + 1)
      }
    }
    return out
  }

  return String(value)
}

function writeLogLine(entry) {
  try {
    const logFilePath = getLogFilePath()
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true })
    fs.appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8')
  } catch (err) {
    console.error('Failed to write desktop log file:', err)
  }
}

function logEvent(level, event, data = {}, source = 'main') {
  const entry = {
    ts: new Date().toISOString(),
    source,
    level,
    event,
    data: sanitizeLogValue(data)
  }

  writeLogLine(entry)

  const consoleMethod =
    level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'info'
  console[consoleMethod](`[SnapRecall] ${event}`, entry.data)
}

function showNativeErrorPopup(title, detail) {
  const message = String(detail || 'Unexpected desktop error.').trim() || 'Unexpected desktop error.'

  try {
    dialog.showErrorBox(title, message)
  } catch (err) {
    console.error('Failed to show native error dialog:', err)
  }
}

function loadAppSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8')
    const parsed = JSON.parse(raw)

    const loadedShortcut =
      parsed &&
      typeof parsed.captureShortcut === 'string' &&
      parsed.captureShortcut.trim() !== ''
        ? parsed.captureShortcut.trim()
        : defaultCaptureShortcut

    logEvent('info', 'settings_loaded', { captureShortcut: loadedShortcut })
    return {
      captureShortcut: loadedShortcut
    }
  } catch (err) {
    logEvent('debug', 'settings_defaulted', { error: err })
    return {
      captureShortcut: defaultCaptureShortcut
    }
  }
}

function saveAppSettings() {
  try {
    fs.writeFileSync(
      getSettingsPath(),
      JSON.stringify(
        {
          captureShortcut
        },
        null,
        2
      ),
      'utf8'
    )
    logEvent('info', 'settings_saved', { captureShortcut })
  } catch (err) {
    logEvent('error', 'settings_save_failed', { error: err })
  }
}

function triggerCapture(shortcutValue) {
  if (!mainWindow) {
    logEvent('warn', 'shortcut_capture_skipped', { reason: 'missing_window' })
    return
  }

  logEvent('info', 'shortcut_capture_triggered', { shortcut: shortcutValue })
  mainWindow.webContents.send('shortcut:capture', { shortcut: shortcutValue })
}

function registerCaptureShortcut(shortcutValue) {
  const nextShortcut = String(shortcutValue || '').trim()
  if (!nextShortcut) {
    return {
      ok: false,
      error: 'Shortcut cannot be empty.'
    }
  }

  if (nextShortcut === captureShortcut && globalShortcut.isRegistered(nextShortcut)) {
    logEvent('debug', 'shortcut_already_registered', { shortcut: nextShortcut })
    return {
      ok: true,
      shortcut: nextShortcut
    }
  }

  const previousShortcut = captureShortcut
  if (previousShortcut) {
    globalShortcut.unregister(previousShortcut)
    logEvent('debug', 'shortcut_unregistered', { shortcut: previousShortcut })
  }

  const registered = globalShortcut.register(nextShortcut, () => {
    triggerCapture(nextShortcut)
  })

  if (!registered) {
    logEvent('error', 'shortcut_register_failed', { shortcut: nextShortcut })
    if (previousShortcut && previousShortcut !== nextShortcut) {
      const restored = globalShortcut.register(previousShortcut, () => {
        triggerCapture(previousShortcut)
      })
      if (restored) {
        captureShortcut = previousShortcut
        logEvent('warn', 'shortcut_restored', { shortcut: previousShortcut })
      }
    }

    return {
      ok: false,
      error: `Failed to register shortcut: ${nextShortcut}`
    }
  }

  captureShortcut = nextShortcut
  logEvent('info', 'shortcut_registered', { shortcut: captureShortcut })
  return {
    ok: true,
    shortcut: captureShortcut
  }
}

function registerShortcuts() {
  const result = registerCaptureShortcut(captureShortcut)
  if (!result.ok) {
    logEvent('error', 'shortcut_register_failed', { error: result.error })
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    title: 'SnapRecall',
    backgroundColor: '#f4f6f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  logEvent('info', 'window_created', { isDev, rendererURL })

  mainWindow.maximize()

  if (isDev) {
    mainWindow.loadURL(rendererURL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('focus', () => {
    logEvent('debug', 'window_focused')
  })

  mainWindow.on('closed', () => {
    logEvent('info', 'window_closed')
    mainWindow = null
  })

  mainWindow.webContents.on('did-finish-load', () => {
    logEvent('info', 'window_loaded')
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logEvent('error', 'renderer_process_gone', details)
    showNativeErrorPopup(
      'SnapRecall renderer crashed',
      `The app window stopped responding (${details?.reason || 'unknown reason'}). Reload or reopen SnapRecall to continue.`
    )
  })
}

async function capturePrimaryDisplay(options = {}) {
  const startedAt = Date.now()
  const shouldHideWindow =
    Boolean(options.hideWindow) &&
    Boolean(mainWindow) &&
    !mainWindow.isDestroyed() &&
    mainWindow.isVisible()

  logEvent('info', 'screen_capture_started', { hideWindow: shouldHideWindow })

  if (shouldHideWindow && mainWindow) {
    mainWindow.hide()
    await sleep(160)
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const width = Math.floor(primaryDisplay.size.width)
  const height = Math.floor(primaryDisplay.size.height)

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })

    const byPrimary = sources.find(
      (source) => String(source.display_id) === String(primaryDisplay.id)
    )
    const target = byPrimary || sources[0]

    if (!target) {
      throw new Error('No display source found for capture')
    }

    logEvent('info', 'screen_capture_completed', {
      duration_ms: Date.now() - startedAt,
      sourceCount: sources.length,
      selectedDisplayId: target.display_id || ''
    })

    return target.thumbnail.toDataURL()
  } catch (err) {
    logEvent('error', 'screen_capture_failed', {
      error: err,
      duration_ms: Date.now() - startedAt
    })
    throw err
  } finally {
    if (shouldHideWindow && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      await sleep(80)
    }
  }
}

process.on('uncaughtException', (err) => {
  logEvent('error', 'uncaught_exception', { error: err })
  showNativeErrorPopup('SnapRecall encountered an error', err?.message || 'Uncaught exception')
})

process.on('unhandledRejection', (reason) => {
  logEvent('error', 'unhandled_rejection', { reason })
  showNativeErrorPopup(
    'SnapRecall encountered an error',
    reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection')
  )
})

app.whenReady().then(() => {
  logEvent('info', 'app_ready', {
    isDev,
    logFilePath: getLogFilePath()
  })

  const settings = loadAppSettings()
  captureShortcut = settings.captureShortcut

  createWindow()
  registerShortcuts()

  ipcMain.on('log:event', (_event, entry) => {
    if (!entry || typeof entry !== 'object') {
      return
    }
    logEvent(entry.level || 'info', entry.event || 'renderer_log', entry.data || {}, entry.source || 'renderer')
  })

  ipcMain.handle('capture-screen', async () => {
    return capturePrimaryDisplay()
  })

  ipcMain.handle('capture-screen-selection', async () => {
    return capturePrimaryDisplay({ hideWindow: true })
  })

  ipcMain.handle('app:get-info', async () => {
    logEvent('debug', 'app_info_requested')
    return {
      captureShortcut
    }
  })

  ipcMain.handle('shortcut:update', async (_event, nextShortcut) => {
    logEvent('info', 'shortcut_update_requested', { shortcut: nextShortcut })
    const result = registerCaptureShortcut(nextShortcut)
    if (result.ok) {
      saveAppSettings()
      if (mainWindow) {
        mainWindow.webContents.send('shortcut:updated', {
          shortcut: result.shortcut
        })
      }
    }

    return result
  })

  app.on('activate', () => {
    logEvent('debug', 'app_activate')
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  logEvent('info', 'app_will_quit')
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  logEvent('info', 'window_all_closed', { platform: process.platform })
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
