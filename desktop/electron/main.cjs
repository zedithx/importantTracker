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
const captureShortcut =
  process.env.CAPTURE_SHORTCUT || 'CommandOrControl+Shift+S'

let mainWindow = null

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

function registerShortcuts() {
  const ok = globalShortcut.register(captureShortcut, () => {
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
    mainWindow.webContents.send('shortcut:capture', { shortcut: captureShortcut })
  })

  if (!ok) {
    console.error(`Failed to register shortcut: ${captureShortcut}`)
  }
}

app.whenReady().then(() => {
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
