const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  onCaptureShortcut: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('shortcut:capture', listener)

    return () => {
      ipcRenderer.removeListener('shortcut:capture', listener)
    }
  }
})
