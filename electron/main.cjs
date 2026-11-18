// CocoaAir for Windows (and macOS/Linux): a compact window around the web app, with the
// signalling server built in so phones on the same Wi-Fi can connect by scanning a QR code.
const { app, BrowserWindow, ipcMain, nativeTheme, session, shell, Menu } = require('electron')
const path = require('path')
const http = require('http')
const { pathToFileURL } = require('url')
const { findHost, announce, lanAddresses } = require('./discovery.cjs')

const PREFERRED_PORT = 47800
const DIST = path.join(__dirname, '..', 'dist')
const SERVER = path.join(__dirname, '..', 'dist-server', 'embedded.js')
const TITLEBAR_HEIGHT = 36
const BAR = {
  dark: { color: '#121212', symbolColor: '#ececec' },
  light: { color: '#f3f5f9', symbolColor: '#101828' },
}

let win = null
let ownPort = 0
let stopAnnounce = null
let watchTimer = null
/** Where the shared signalling server is: this PC, or another PC that hosts it. */
let remote = null

function hostingInfo() {
  const lan = lanAddresses()[0]?.address
  const hostAddr = remote ? remote.address : lan
  const hostPort = remote ? remote.port : ownPort
  return {
    desktop: true,
    version: app.getVersion(),
    hosting: !remote,
    signalingUrl: remote ? `ws://${remote.address}:${remote.port}/api/ws` : null,
    phoneUrl: hostAddr ? `http://${hostAddr}:${hostPort}/` : null,
  }
}

function becomeHost() {
  remote = null
  if (!stopAnnounce) stopAnnounce = announce(ownPort)
}

/** While another PC hosts, check it is still there; if it closes, take over. */
function watchHost() {
  clearInterval(watchTimer)
  let misses = 0
  watchTimer = setInterval(() => {
    if (!remote) return clearInterval(watchTimer)
    const req = http.get({ host: remote.address, port: remote.port, path: '/api/health', timeout: 2500 }, (res) => {
      res.resume()
      misses = res.statusCode === 200 ? 0 : misses + 1
    })
    req.on('timeout', () => req.destroy())
    req.on('error', async () => {
      if (++misses < 2) return
      clearInterval(watchTimer)
      const other = await findHost()
      if (other) {
        remote = other
        watchHost()
      } else becomeHost()
      if (win) win.reload()
    })
  }, 5000)
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors
  win = new BrowserWindow({
    width: 540,
    height: 660,
    minWidth: 440,
    minHeight: 560,
    title: 'CocoaAir',
    backgroundColor: dark ? BAR.dark.color : BAR.light.color,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : { titleBarStyle: 'hidden', titleBarOverlay: { ...(dark ? BAR.dark : BAR.light), height: TITLEBAR_HEIGHT } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  })
  const origin = `http://127.0.0.1:${ownPort}`
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
    }
  })
  win.loadURL(`${origin}/`)
  win.on('closed', () => {
    win = null
  })
}

ipcMain.on('desktop-info', (e) => {
  e.returnValue = hostingInfo()
})
ipcMain.on('set-titlebar', (_e, theme) => {
  const bar = theme === 'light' ? BAR.light : BAR.dark
  if (win && process.platform !== 'darwin' && win.setTitleBarOverlay) {
    try {
      win.setTitleBarOverlay({ ...bar, height: TITLEBAR_HEIGHT })
      win.setBackgroundColor(bar.color)
    } catch {}
  }
})
ipcMain.on('attention', () => {
  if (win && !win.isFocused()) win.flashFrame(true)
})

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null)

    // The app's own page is served from this PC, so the clipboard and other secure-page features work.
    const { startEmbedded } = await import(pathToFileURL(SERVER).href)
    const server = await startEmbedded({ port: PREFERRED_PORT, staticDir: DIST })
    ownPort = server.port
    app.on('will-quit', () => {
      if (stopAnnounce) stopAnnounce()
      server.close()
    })

    remote = await findHost()
    if (remote) watchHost()
    else becomeHost()

    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(['clipboard-sanitized-write', 'clipboard-read', 'notifications', 'fullscreen'].includes(permission))
    })

    createWindow()
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
