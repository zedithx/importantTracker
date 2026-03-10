const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  updateCaptureShortcut: (shortcut) =>
    ipcRenderer.invoke('shortcut:update', shortcut),
  onCaptureShortcut: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('shortcut:capture', listener)

    return () => {
      ipcRenderer.removeListener('shortcut:capture', listener)
    }
  },
  onShortcutUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('shortcut:updated', listener)

    return () => {
      ipcRenderer.removeListener('shortcut:updated', listener)
    }
  }
})
