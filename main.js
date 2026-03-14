const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const os    = require('os')
const http  = require('http')
const { spawn, execSync } = require('child_process')

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CFG_DIR  = path.join(os.homedir(), '.lumina')
const CFG_PATH = path.join(CFG_DIR, 'config.json')
const SERVER_URL = 'https://SEU-APP.squarecloud.app'  // ← troque pela sua URL
const REDIRECT_PORT = 7842

function loadCfg() {
  try { if(fs.existsSync(CFG_PATH)) return JSON.parse(fs.readFileSync(CFG_PATH,'utf8')) } catch(e) {}
  return {}
}
function saveCfg(d) {
  if(!fs.existsSync(CFG_DIR)) fs.mkdirSync(CFG_DIR,{recursive:true})
  fs.writeFileSync(CFG_PATH, JSON.stringify(d,null,2))
}

let cfg = loadCfg()
let mainWindow, loginWindow, splashWindow, backendProcess
let oauthServer = null

// ── SPLASH ────────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width:420, height:280, frame:false, transparent:true,
    alwaysOnTop:true, center:true, skipTaskbar:true,
    webPreferences:{nodeIntegration:true,contextIsolation:false}
  })
  splashWindow.loadFile('splash.html')
}

// ── LOGIN WINDOW ──────────────────────────────────────────────────────────────
function createLogin() {
  loginWindow = new BrowserWindow({
    width:420, height:560, frame:false,
    backgroundColor:'#03050f', center:true,
    webPreferences:{nodeIntegration:true,contextIsolation:false}
  })
  loginWindow.loadFile('login.html')
}

// ── MAIN WINDOW ───────────────────────────────────────────────────────────────
function createMain() {
  mainWindow = new BrowserWindow({
    width:1400, height:900, minWidth:900, minHeight:600,
    frame:false, backgroundColor:'#03050f', show:false,
    webPreferences:{nodeIntegration:true,contextIsolation:false,webviewTag:true,partition:'persist:main'}
  })
  mainWindow.loadFile('index.html')
  mainWindow.once('ready-to-show', () => {
    if(splashWindow&&!splashWindow.isDestroyed()) {
      setTimeout(()=>{ splashWindow.destroy(); mainWindow.show() }, 2200)
    } else {
      mainWindow.show()
    }
    // Envia user info pro renderer
    mainWindow.webContents.send('user-info', cfg.user)
  })
}

// ── OAUTH SERVER (local) ──────────────────────────────────────────────────────
function startOAuthServer(provider) {
  if(oauthServer) { try{oauthServer.close()}catch(e){} }

  oauthServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`)
    const code = url.searchParams.get('code')

    res.writeHead(200, {'Content-Type':'text/html'})
    res.end(`<html><body style="background:#03050f;color:#00BFFF;font-family:Consolas;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center"><div style="font-size:36px;font-weight:bold;letter-spacing:8px;margin-bottom:16px">LUMINA</div>
      <div>Login realizado! Pode fechar esta janela.</div></div></body></html>`)

    if(code) {
      oauthServer.close()
      oauthServer = null
      processOAuthCode(provider, code)
    }
  })

  oauthServer.listen(REDIRECT_PORT)
}

async function processOAuthCode(provider, code) {
  try {
    if(loginWindow) loginWindow.webContents.send('oauth-status', 'Verificando conta...')

    const res  = await fetch(`${SERVER_URL}/auth/${provider}/token`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({code})
    })
    const data = await res.json()

    if(data.error) throw new Error(data.error)

    // Salva token e user
    cfg.token = data.token
    cfg.user  = data.user
    saveCfg(cfg)

    // Fecha login e abre main
    if(loginWindow && !loginWindow.isDestroyed()) loginWindow.destroy()
    createSplash()
    createMain()

  } catch(e) {
    if(loginWindow) loginWindow.webContents.send('oauth-error', `Erro: ${e.message}`)
  }
}

// ── IPC OAUTH ─────────────────────────────────────────────────────────────────
ipcMain.on('oauth-login', async (e, provider) => {
  try {
    startOAuthServer(provider)
    const res  = await fetch(`${SERVER_URL}/auth/${provider}/url`)
    const data = await res.json()
    shell.openExternal(data.url)
  } catch(err) {
    if(loginWindow) loginWindow.webContents.send('oauth-error', 'Servidor offline.')
  }
})

// ── STARTUP ───────────────────────────────────────────────────────────────────
function setStartup(enable) {
  const plt = process.platform
  try {
    if(plt === 'win32') {
      const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      if(enable) execSync(`reg add "${key}" /v "LUMINA" /t REG_SZ /d "${process.execPath}" /f`)
      else        execSync(`reg delete "${key}" /v "LUMINA" /f`)

    } else if(plt === 'darwin') {
      const plist = path.join(os.homedir(), 'Library','LaunchAgents','com.starkindustries.lumina.plist')
      if(enable) {
        fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.starkindustries.lumina</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>`)
      } else {
        if(fs.existsSync(plist)) fs.unlinkSync(plist)
      }

    } else {
      // Linux — XDG autostart
      const autostartDir  = path.join(os.homedir(), '.config', 'autostart')
      const desktopFile   = path.join(autostartDir, 'lumina.desktop')
      if(enable) {
        if(!fs.existsSync(autostartDir)) fs.mkdirSync(autostartDir, { recursive: true })
        fs.writeFileSync(desktopFile,
          `[Desktop Entry]\nType=Application\nName=Lumina\nExec=${process.execPath}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n`)
      } else {
        if(fs.existsSync(desktopFile)) fs.unlinkSync(desktopFile)
      }
    }
  } catch(e) { console.log('[STARTUP]', e.message) }
}

function isStartupEnabled() {
  const plt = process.platform
  try {
    if(plt === 'win32') {
      execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "LUMINA"')
      return true
    } else if(plt === 'darwin') {
      return fs.existsSync(path.join(os.homedir(), 'Library','LaunchAgents','com.starkindustries.lumina.plist'))
    } else {
      return fs.existsSync(path.join(os.homedir(), '.config','autostart','lumina.desktop'))
    }
  } catch(e) { return false }
}

// ── BACKEND LOCAL (sistema, spotify) ──────────────────────────────────────────
function findPython() {
  const plt  = process.platform
  const user = os.userInfo().username

  const candidates = plt === 'win32'
    ? [
        `C:\\Users\\${user}\\AppData\\Local\\Programs\\Python\\Python314\\python.exe`,
        `C:\\Users\\${user}\\AppData\\Local\\Programs\\Python\\Python313\\python.exe`,
        `C:\\Users\\${user}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
        `C:\\Users\\${user}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
        'python',
      ]
    : plt === 'darwin'
    ? [
        '/usr/local/bin/python3',
        '/usr/bin/python3',
        `${os.homedir()}/.pyenv/shims/python3`,
        '/opt/homebrew/bin/python3',
        'python3',
        'python',
      ]
    : [
        '/usr/bin/python3',
        '/usr/local/bin/python3',
        `${os.homedir()}/.local/bin/python3`,
        'python3',
        'python',
      ]

  for(const p of candidates) {
    try {
      const isCmd = !p.includes('/') && !p.includes('\\')
      if(isCmd) return p
      if(fs.existsSync(p)) { console.log('[PYTHON]', p); return p }
    } catch(e) {}
  }
  return 'python3'
}

function startBackend() {
  const pythonPath = findPython()
  backendProcess = spawn(pythonPath, [path.join(__dirname,'backend','server.py')], {stdio:'pipe'})
  backendProcess.stdout.on('data', d=>console.log('[BACKEND]',d.toString()))
  backendProcess.stderr.on('data', d=>console.error('[BACKEND ERR]',d.toString()))
}

// ── APP READY ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend()

  // Se tem token salvo, vai direto pro main
  if(cfg.token) {
    createSplash()
    setTimeout(createMain, 800)
  } else {
    setTimeout(createLogin, 500)
  }
})

app.on('window-all-closed', () => {
  if(backendProcess) backendProcess.kill()
  if(oauthServer) oauthServer.close()
  app.quit()
})

// ── IPC GERAL ─────────────────────────────────────────────────────────────────
ipcMain.on('minimize', () => { if(mainWindow) mainWindow.minimize(); if(loginWindow) loginWindow.minimize() })
ipcMain.on('maximize', () => { if(mainWindow) mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize() })
ipcMain.on('close',    () => { if(backendProcess)backendProcess.kill(); app.quit() })
ipcMain.on('logout',   () => { cfg.token=null; cfg.user=null; saveCfg(cfg); app.relaunch(); app.quit() })
ipcMain.on('set-startup', (e,on) => setStartup(on))
ipcMain.handle('is-startup', () => isStartupEnabled())
ipcMain.on('open-external', (e,url) => shell.openExternal(url))
ipcMain.on('toggle-fullscreen', () => {
  if(mainWindow) mainWindow.isFullScreen() ? mainWindow.setFullScreen(false) : mainWindow.setFullScreen(true)
})
ipcMain.on('first-run-done', () => { cfg.first_run_done=true; saveCfg(cfg) })
ipcMain.on('set-default-browser', () => {
  const plt = process.platform
  try {
    if(plt === 'win32') {
      const exePath = process.execPath
      const cmds = [
        `reg add "HKCU\\Software\\Classes\\LUMINA" /ve /d "LUMINA Browser" /f`,
        `reg add "HKCU\\Software\\Classes\\LUMINA\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\http\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\https\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\.htm" /ve /d "LUMINA" /f`,
        `reg add "HKCU\\Software\\Classes\\.html" /ve /d "LUMINA" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\LUMINA\\shell\\open\\command" /ve /d "\\"${exePath}\\"" /f`,
      ]
      for(const cmd of cmds) { try { execSync(cmd) } catch(e) {} }
      app.setAsDefaultProtocolClient('http')
      app.setAsDefaultProtocolClient('https')
      try { execSync('start ms-settings:defaultapps') } catch(e) {}

    } else if(plt === 'darwin') {
      app.setAsDefaultProtocolClient('http')
      app.setAsDefaultProtocolClient('https')
      // Abre preferências de sistema no macOS
      try { execSync('open x-apple.systempreferences:com.apple.preference.general') } catch(e) {}

    } else {
      // Linux — xdg-settings
      app.setAsDefaultProtocolClient('http')
      app.setAsDefaultProtocolClient('https')
      try {
        // Cria .desktop entry se não existir
        const appsDir    = path.join(os.homedir(), '.local','share','applications')
        const desktopFile = path.join(appsDir, 'lumina.desktop')
        if(!fs.existsSync(appsDir)) fs.mkdirSync(appsDir, { recursive: true })
        fs.writeFileSync(desktopFile,
          `[Desktop Entry]\nVersion=1.0\nName=Lumina Browser\nExec=${process.execPath} %u\nTerminal=false\nType=Application\nMimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;\nCategories=Network;WebBrowser;\nIcon=lumina\n`)
        execSync(`xdg-mime default lumina.desktop x-scheme-handler/http`)
        execSync(`xdg-mime default lumina.desktop x-scheme-handler/https`)
        execSync(`xdg-settings set default-web-browser lumina.desktop`)
      } catch(e) { console.log('[DEFAULT BROWSER Linux]', e.message) }
    }
  } catch(e) { console.log('[DEFAULT BROWSER]', e.message) }
})

// Server URL pra renderer usar
ipcMain.handle('get-server-url', () => SERVER_URL)

// ── AD BLOCKER REAL (bloqueia na camada de rede, antes de baixar) ─────────────
const AD_URLS = [
  '*://*.doubleclick.net/*','*://*.googlesyndication.com/*',
  '*://*.googleadservices.com/*','*://*.adservice.google.com/*',
  '*://*.adservice.google.com.br/*','*://*.amazon-adsystem.com/*',
  '*://*.adnxs.com/*','*://*.ads.twitter.com/*',
  '*://*.outbrain.com/*','*://*.taboola.com/*',
  '*://*.criteo.com/*','*://*.moatads.com/*',
  '*://*.scorecardresearch.com/*','*://*.hotjar.com/*',
  '*://*.fullstory.com/*','*://*.mixpanel.com/*',
  '*://*.segment.io/*','*://*.segment.com/*',
  '*://*.chartbeat.com/*','*://*.quantserve.com/*',
  '*://*.pubmatic.com/*','*://*.rubiconproject.com/*',
  '*://*.openx.net/*','*://*.smartadserver.com/*',
  '*://*.casalemedia.com/*','*://*.appnexus.com/*',
  '*://*.sharethrough.com/*','*://*.indexexchange.com/*',
  '*://*.triplelift.com/*','*://*.media.net/*',
  '*://*.advertising.com/*','*://*.yieldmanager.com/*',
  '*://pagead2.googlesyndication.com/*',
  '*://adclick.g.doubleclick.net/*',
  '*://*.33across.com/*','*://*.zemanta.com/*',
]

let adBlockOn  = true
let adsBlocked = 0

function applyAdBlock(ses) {
  if(!ses) return
  if(adBlockOn) {
    ses.webRequest.onBeforeRequest({ urls: AD_URLS }, (details, cb) => {
      adsBlocked++
      if(mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('ad-blocked', adsBlocked)
      cb({ cancel: true })
    })
  } else {
    try { ses.webRequest.onBeforeRequest(null) } catch(e) {}
  }
}

app.whenReady().then(() => {
  const { session: eSess } = require('electron')
  applyAdBlock(eSess.fromPartition('persist:main'))
})

ipcMain.on('adblock-toggle', (e, enabled) => {
  adBlockOn = enabled
  if(!enabled) adsBlocked = 0
  const { session: eSess } = require('electron')
  applyAdBlock(eSess.fromPartition('persist:main'))
})
ipcMain.handle('adblock-status', () => ({ enabled: adBlockOn, count: adsBlocked }))

// ── WEBVIEW: força user-agent de Chrome real (fix Google/Pinterest OAuth) ──────
app.on('web-contents-created', (e, contents) => {
  if(contents.getType() === 'webview') {
    const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    contents.setUserAgent(CHROME_UA)

    // Popups de OAuth (Google, Pinterest, etc.) — abre como nova janela real
    contents.setWindowOpenHandler(({ url }) => {
      if(!url || url === 'about:blank') return { action: 'deny' }
      // Deixa o renderer saber via IPC pra abrir como nova aba
      if(mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-new-tab', url)
      }
      return { action: 'deny' }
    })
  }
})
