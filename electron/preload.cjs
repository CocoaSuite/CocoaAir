// What the desktop app adds to the page: where the shared server is, the phone link, and the
// title bar colours that follow the theme switch.
const { contextBridge, ipcRenderer } = require('electron')

const info = ipcRenderer.sendSync('desktop-info')

contextBridge.exposeInMainWorld('cocoaDesktop', {
  info,
  platform: process.platform,
  setTheme: (theme) => ipcRenderer.send('set-titlebar', theme === 'light' ? 'light' : 'dark'),
  attention: () => ipcRenderer.send('attention'),
})
