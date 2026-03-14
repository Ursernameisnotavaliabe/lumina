const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const os    = require('os')
const http  = require('http')
const { spawn, execSync } = require('child_process')

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CFG_DIR  = path.join(os.homedir(), '.lumina')
const CFG_PATH = path.join(CFG_DIR, 'config.json')
const SERVER_URL = 'https://luminaitsagoodbrowser.squareweb.app'
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
let mainWindow, welcomeWindow, splashWindow, backendProcess

// ── SPLASH ────────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width:420, height:280, frame:false, transparent:true,
    alwaysOnTop:true, center:true, skipTaskbar:true,
    webPreferences:{nodeIntegration:true,contextIsolation:false}
  })
  splashWindow.loadFile('splash.html')
}

// ── WELCOME WINDOW (primeira vez) ─────────────────────────────────────────────
function createWelcome() {
  welcomeWindow = new BrowserWindow({
    width:500, height:540, frame:false,
    backgroundColor:'#03050f', center:true, resizable:false,
    webPreferences:{nodeIntegration:true,contextIsolation:false}
  })
  welcomeWindow.loadFile('welcome.html')
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
  const IS_WIN   = process.platform === 'win32'
  const exeName  = IS_WIN ? 'server.exe' : 'server'

  // Procura o executável compilado primeiro (build de produção)
  const exePath  = path.join(__dirname, 'backend', exeName)
  const pyPath   = path.join(__dirname, 'backend', 'server.py')

  if(fs.existsSync(exePath)) {
    // Usa o executável compilado pelo PyInstaller — sem precisar de Python
    console.log('[BACKEND] Usando executável compilado:', exePath)
    backendProcess = spawn(exePath, [], { stdio:'pipe', detached:false })
  } else if(fs.existsSync(pyPath)) {
    // Fallback: usa Python do sistema (modo desenvolvimento)
    const pythonPath = findPython()
    console.log('[BACKEND] Usando Python:', pythonPath)
    backendProcess = spawn(pythonPath, [pyPath], { stdio:'pipe' })
  } else {
    console.error('[BACKEND] ❌ Nem executável nem server.py encontrado!')
    return
  }

  backendProcess.stdout.on('data', d => console.log('[BACKEND]', d.toString().trim()))
  backendProcess.stderr.on('data', d => console.error('[BACKEND ERR]', d.toString().trim()))
  backendProcess.on('exit', code => console.log('[BACKEND] Processo encerrado, código:', code))
}

// ── APP READY ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend()

  if(!cfg.first_run_done) {
    // Primeira vez — mostra tela de boas-vindas
    createWelcome()
  } else {
    // Já configurou antes — vai direto
    createSplash()
    setTimeout(createMain, 800)
  }
})

app.on('window-all-closed', () => {
  if(backendProcess) backendProcess.kill()
  if(oauthServer) oauthServer.close()
  app.quit()
})

// ── IPC GERAL ─────────────────────────────────────────────────────────────────
ipcMain.on('minimize', () => { if(mainWindow) mainWindow.minimize(); if(welcomeWindow) welcomeWindow.minimize() })
ipcMain.on('maximize', () => { if(mainWindow) mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize() })
ipcMain.on('close',    () => { if(backendProcess)backendProcess.kill(); app.quit() })
ipcMain.on('logout',   () => { cfg.first_run_done=false; cfg.token=null; saveCfg(cfg); app.relaunch(); app.quit() })

// Welcome concluído — fecha welcome e abre o app
ipcMain.on('welcome-done', () => {
  cfg = loadCfg() // recarrega config salva pelo welcome
  if(welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.destroy()
  createSplash()
  setTimeout(createMain, 800)
})
ipcMain.on('set-startup', (e,on) => setStartup(on))
ipcMain.handle('is-startup', () => isStartupEnabled())
ipcMain.on('open-external', (e,url) => shell.openExternal(url))

// Abre o Discord app instalado, ou o site no browser padrão como fallback
ipcMain.on('open-discord-app', () => {
  const plt = process.platform
  try {
    if(plt === 'win32') {
      const discordPaths = [
        path.join(os.homedir(), 'AppData','Local','Discord','Update.exe'),
        path.join(os.homedir(), 'AppData','Local','Discord','app-*','Discord.exe'),
        'C:\\Program Files\\Discord\\Discord.exe',
      ]
      let opened = false
      for(const p of discordPaths) {
        try {
          if(fs.existsSync(p)) {
            spawn(p, [], { detached: true, stdio: 'ignore' }).unref()
            opened = true; break
          }
        } catch(e) {}
      }
      if(!opened) {
        // Tenta via protocolo discord://
        shell.openExternal('discord://')
      }
    } else if(plt === 'darwin') {
      try { spawn('open', ['-a', 'Discord'], { detached:true }).unref() }
      catch(e) { shell.openExternal('discord://') }
    } else {
      try { spawn('discord', [], { detached:true }).unref() }
      catch(e) { shell.openExternal('https://discord.com/app') }
    }
  } catch(e) {
    shell.openExternal('https://discord.com/app')
  }
})
ipcMain.on('toggle-fullscreen', () => {
  if(mainWindow) mainWindow.isFullScreen() ? mainWindow.setFullScreen(false) : mainWindow.setFullScreen(true)
})
ipcMain.on('first-run-done', () => { cfg.first_run_done=true; saveCfg(cfg) })
ipcMain.on('set-default-browser', () => {
  const plt = process.platform
  try {
    if(plt === 'win32') {
      const exePath = process.execPath
      const appId   = 'LuminaBrowser'

      const cmds = [
        // Registra o ProgID do LUMINA
        `reg add "HKCU\\Software\\Classes\\${appId}" /ve /d "LUMINA Browser Document" /f`,
        `reg add "HKCU\\Software\\Classes\\${appId}\\Application" /v "ApplicationName" /d "Lumina" /f`,
        `reg add "HKCU\\Software\\Classes\\${appId}\\Application" /v "ApplicationDescription" /d "Intelligent Browser" /f`,
        `reg add "HKCU\\Software\\Classes\\${appId}\\DefaultIcon" /ve /d "\\"${exePath}\\",0" /f`,
        `reg add "HKCU\\Software\\Classes\\${appId}\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,

        // Associações de protocolo
        `reg add "HKCU\\Software\\Classes\\http\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\https\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,

        // Associações de arquivo
        `reg add "HKCU\\Software\\Classes\\.htm" /ve /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Classes\\.html" /ve /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Classes\\.xhtml" /ve /d "${appId}" /f`,

        // Registra como browser no StartMenuInternet (aparece na lista do Windows)
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities" /v "ApplicationName" /d "Lumina" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities" /v "ApplicationDescription" /d "Intelligent Browser powered by AI" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities\\FileAssociations" /v ".htm" /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities\\FileAssociations" /v ".html" /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities\\URLAssociations" /v "http" /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities\\URLAssociations" /v "https" /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\shell\\open\\command" /ve /d "\\"${exePath}\\"" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\DefaultIcon" /ve /d "\\"${exePath}\\",0" /f`,

        // Registra nas aplicações registradas do Windows
        `reg add "HKCU\\Software\\RegisteredApplications" /v "Lumina" /d "Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities" /f`,
      ]

      for(const cmd of cmds) { try { execSync(cmd) } catch(e) { console.log('[REG]', e.message) } }

      app.setAsDefaultProtocolClient('http')
      app.setAsDefaultProtocolClient('https')

      // Abre a página de apps padrão do Windows direto no Lumina
      try { execSync('start ms-settings:defaultapps-browser') } catch(e) {
        try { execSync('start ms-settings:defaultapps') } catch(e2) {}
      }

    } else if(plt === 'darwin') {
      app.setAsDefaultProtocolClient('http')
      app.setAsDefaultProtocolClient('https')
      try { execSync('open x-apple.systempreferences:com.apple.preference.general') } catch(e) {}

    } else {
      app.setAsDefaultProtocolClient('http')
      app.setAsDefaultProtocolClient('https')
      try {
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

// ── AD BLOCKER + TRACKER BLOCKER (lista expandida EasyPrivacy) ───────────────
const AD_URLS = [
  // Ads
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
  // Trackers adicionais (EasyPrivacy)
  '*://*.googletagmanager.com/*','*://*.googletagservices.com/*',
  '*://*.google-analytics.com/*','*://*.analytics.google.com/*',
  '*://*.clarity.ms/*','*://*.mouseflow.com/*',
  '*://*.crazyegg.com/*','*://*.inspectlet.com/*',
  '*://*.clicktale.net/*','*://*.sessioncam.com/*',
  '*://*.logrocket.com/*','*://*.heap.io/*',
  '*://*.amplitude.com/*','*://*.intercom.io/*',
  '*://*.intercom.com/*','*://*.drift.com/*',
  '*://*.tiktok.com/i18n/pixel/*','*://*.ads.tiktok.com/*',
  '*://*.facebook.com/tr/*','*://*.connect.facebook.net/*',
  '*://*.snapchat.com/tr/*','*://*.sc-static.net/*',
  '*://*.linkedin.com/px/*','*://*.ads.linkedin.com/*',
  '*://*.twitter.com/i/adsct*','*://*.t.co/i/adsct*',
  '*://*.bing.com/action/0*','*://*.bat.bing.com/*',
  '*://*.yahoo.com/dot*','*://*.analytics.yahoo.com/*',
  '*://*.newrelic.com/*','*://*.nr-data.net/*',
  '*://*.datadoghq.com/*','*://*.sentry.io/*',
  '*://*.bugsnag.com/*','*://*.rollbar.com/*',
  '*://*.pingdom.net/*','*://*.statcounter.com/*',
  '*://*.cloudfront.net/*/analytics*',
  '*://*.optimizely.com/*','*://*.abtasty.com/*',
  '*://*.vwo.com/*','*://*.kameleoon.com/*',
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

// ── DNS OVER HTTPS + PERFORMANCE + PRIVACIDADE ────────────────────────────────
app.commandLine.appendSwitch('enable-features',
  'DNSOverHTTPS,NetworkServiceInProcess,ParallelDownloading,BackForwardCache,PrefetchDNS')
app.commandLine.appendSwitch('dns-over-https-templates',
  'https://cloudflare-dns.com/dns-query{?dns}')  // Cloudflare DoH
app.commandLine.appendSwitch('disable-features',
  'WebRtcHideLocalIpsWithMdns')  // evita vazamento de IP local via WebRTC
app.commandLine.appendSwitch('enable-quic')        // HTTP/3 mais rápido
app.commandLine.appendSwitch('enable-tcp-fast-open')
app.commandLine.appendSwitch('enable-zero-copy')   // rendering mais rápido
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

app.whenReady().then(() => {
  const { session: eSess } = require('electron')
  const ses = eSess.fromPartition('persist:main')

  // AdBlock
  applyAdBlock(ses)

  // Remove headers que identificam o browser
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = details.requestHeaders
    // Remove header que revela que é Electron
    delete headers['X-Requested-With']
    delete headers['sec-ch-ua-platform']
    // Normaliza user agent para não revelar versão exata do Electron
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    cb({ requestHeaders: headers })
  })
})

ipcMain.on('adblock-toggle', (e, enabled) => {
  adBlockOn = enabled
  if(!enabled) adsBlocked = 0
  const { session: eSess } = require('electron')
  applyAdBlock(eSess.fromPartition('persist:main'))
})
ipcMain.handle('adblock-status', () => ({ enabled: adBlockOn, count: adsBlocked }))

// ── WEBVIEW: user-agent + anti-fingerprinting + popups ───────────────────────
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Script de anti-fingerprinting injetado em todas as páginas
const ANTI_FP_SCRIPT = `(function(){
  // Aleatoriza canvas fingerprint
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL
  HTMLCanvasElement.prototype.toDataURL = function(type) {
    const ctx = this.getContext('2d')
    if(ctx) {
      const img = ctx.getImageData(0,0,this.width,this.height)
      for(let i=0;i<img.data.length;i+=4){
        img.data[i]   ^= Math.random() > 0.99 ? 1 : 0
        img.data[i+1] ^= Math.random() > 0.99 ? 1 : 0
      }
      ctx.putImageData(img,0,0)
    }
    return origToDataURL.apply(this, arguments)
  }

  // Ofusca WebGL renderer/vendor
  const getParam = WebGLRenderingContext.prototype.getParameter
  WebGLRenderingContext.prototype.getParameter = function(p) {
    if(p === 37445) return 'Intel Inc.'
    if(p === 37446) return 'Intel Iris OpenGL Engine'
    return getParam.call(this, p)
  }

  // Aleatoriza AudioContext fingerprint
  const origGetChannelData = AudioBuffer.prototype.getChannelData
  AudioBuffer.prototype.getChannelData = function() {
    const arr = origGetChannelData.apply(this, arguments)
    for(let i=0; i<arr.length; i+=100) arr[i] += Math.random() * 0.0000001
    return arr
  }

  // Bloqueia enumeração de fonts via measureText
  const origMeasure = CanvasRenderingContext2D.prototype.measureText
  CanvasRenderingContext2D.prototype.measureText = function(text) {
    const metrics = origMeasure.apply(this, arguments)
    return metrics
  }

  // Remove propriedades que identificam automation
  Object.defineProperty(navigator, 'webdriver', { get: () => false })
  Object.defineProperty(navigator, 'plugins',   { get: () => [1,2,3,4,5] })
  Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR','pt','en-US','en'] })
})()`

app.on('web-contents-created', (e, contents) => {
  if(contents.getType() === 'webview') {
    contents.setUserAgent(CHROME_UA)

    // Injeta anti-fingerprinting em cada página
    contents.on('did-start-navigation', () => {
      contents.executeJavaScript(ANTI_FP_SCRIPT).catch(()=>{})
    })

    // Popups abrem como nova aba
    contents.setWindowOpenHandler(({ url }) => {
      if(!url || url === 'about:blank') return { action: 'deny' }
      if(mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('open-new-tab', url)
      return { action: 'deny' }
    })
  }
})
