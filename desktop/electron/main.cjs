const fs = require('node:fs')
const path = require('node:path')
const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen
} = require('electron')

require('dotenv').config({ path: path.join(__dirname, '../.env') })

const isDev = !app.isPackaged
const rendererURL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
const defaultCaptureShortcut =
  process.env.CAPTURE_SHORTCUT || 'CommandOrControl+Shift+S'

let mainWindow = null
let captureShortcut = defaultCaptureShortcut

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'snaprecall-settings.json')
}

function loadCaptureShortcut() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8')
    const parsed = JSON.parse(raw)

    if (
      parsed &&
      typeof parsed.captureShortcut === 'string' &&
      parsed.captureShortcut.trim() !== ''
    ) {
      return parsed.captureShortcut.trim()
    }
  } catch (_err) {
    return defaultCaptureShortcut
  }

  return defaultCaptureShortcut
}

function saveCaptureShortcut(shortcutValue) {
  try {
    fs.writeFileSync(
      getSettingsPath(),
      JSON.stringify({ captureShortcut: shortcutValue }, null, 2),
      'utf8'
    )
  } catch (err) {
    console.error('Failed to persist shortcut settings:', err)
  }
}

function focusMainWindow() {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  mainWindow.focus()
}

function triggerCapture(shortcutValue) {
  if (!mainWindow) {
    return
  }

  focusMainWindow()
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

  if (
    nextShortcut === captureShortcut &&
    globalShortcut.isRegistered(nextShortcut)
  ) {
    return {
      ok: true,
      shortcut: nextShortcut
    }
  }

  const previousShortcut = captureShortcut
  if (previousShortcut) {
    globalShortcut.unregister(previousShortcut)
  }

  const registered = globalShortcut.register(nextShortcut, () => {
    triggerCapture(nextShortcut)
  })

  if (!registered) {
    if (previousShortcut && previousShortcut !== nextShortcut) {
      const restored = globalShortcut.register(previousShortcut, () => {
        triggerCapture(previousShortcut)
      })
      if (restored) {
        captureShortcut = previousShortcut
      }
    }

    return {
      ok: false,
      error: `Failed to register shortcut: ${nextShortcut}`
    }
  }

  captureShortcut = nextShortcut
  return {
    ok: true,
    shortcut: captureShortcut
  }
}

function registerShortcuts() {
  const result = registerCaptureShortcut(captureShortcut)
  if (!result.ok) {
    console.error(result.error)
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

  if (isDev) {
    mainWindow.loadURL(rendererURL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

async function capturePrimaryDisplay() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const width = Math.floor(primaryDisplay.size.width)
  const height = Math.floor(primaryDisplay.size.height)

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

  return target.thumbnail.toDataURL()
}

app.whenReady().then(() => {
  captureShortcut = loadCaptureShortcut()

  createWindow()
  registerShortcuts()

  ipcMain.handle('capture-screen', async () => {
    return capturePrimaryDisplay()
  })

  ipcMain.handle('app:get-info', async () => {
    return {
      captureShortcut
    }
  })

  ipcMain.handle('shortcut:update', async (_event, nextShortcut) => {
    const result = registerCaptureShortcut(nextShortcut)
    if (result.ok) {
      saveCaptureShortcut(result.shortcut)
      if (mainWindow) {
        mainWindow.webContents.send('shortcut:updated', {
          shortcut: result.shortcut
        })
      }
    }

    return result
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
