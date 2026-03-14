const { app, BrowserWindow, ipcMain, shell, session, Notification } = require('electron')
const path    = require('path')
const fs      = require('fs')
const os      = require('os')
const http    = require('http')
const https   = require('https')
const { spawn, execSync } = require('child_process')

// ── AUTO-UPDATE ───────────────────────────────────────────────────────────────
let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
} catch(e) { console.log('[UPDATE] electron-updater não disponível') }

// ── PERFORMANCE / PRIVACIDADE ─────────────────────────────────────────────────
app.commandLine.appendSwitch('enable-features',
  'DNSOverHTTPS,NetworkServiceInProcess,ParallelDownloading,BackForwardCache,PrefetchDNS')
app.commandLine.appendSwitch('dns-over-https-templates','https://cloudflare-dns.com/dns-query{?dns}')
app.commandLine.appendSwitch('disable-features','WebRtcHideLocalIpsWithMdns')
app.commandLine.appendSwitch('enable-quic')
app.commandLine.appendSwitch('enable-tcp-fast-open')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CFG_DIR   = path.join(os.homedir(), '.lumina')
const CFG_PATH  = path.join(CFG_DIR, 'config.json')
const TABS_PATH = path.join(CFG_DIR, 'last-session.json')
const SERVER_URL    = 'https://luminaitsagoodbrowser.squareweb.app'
const REDIRECT_PORT = 7842
const SP_REDIRECT   = `http://localhost:${REDIRECT_PORT}/spotify/callback`

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
app.isQuitting = false

// ── SPLASH ────────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width:420, height:280, frame:false, transparent:true,
    alwaysOnTop:true, center:true, skipTaskbar:true,
    webPreferences:{nodeIntegration:true,contextIsolation:false}
  })
  splashWindow.loadFile('splash.html')
}

// ── WELCOME ───────────────────────────────────────────────────────────────────
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
    webPreferences:{
      nodeIntegration:true, contextIsolation:false,
      webviewTag:true, partition:'persist:main'
    }
  })
  mainWindow.loadFile('index.html')
  mainWindow.once('ready-to-show', () => {
    if(splashWindow && !splashWindow.isDestroyed())
      setTimeout(() => { splashWindow.destroy(); mainWindow.show() }, 2200)
    else mainWindow.show()

    mainWindow.webContents.send('user-info', cfg.user)
    mainWindow.webContents.send('app-lang', cfg.lang || 'pt')

    // Restaura sessão anterior
    try {
      if(fs.existsSync(TABS_PATH)) {
        const last = JSON.parse(fs.readFileSync(TABS_PATH,'utf8'))
        if(last && last.tabs && last.tabs.length)
          mainWindow.webContents.send('restore-session', last)
      }
    } catch(e) {}

    // Verifica updates após 5s
    setTimeout(checkForUpdates, 5000)
  })

  // ── DOWNLOAD MANAGER COM UI ────────────────────────────────────────────────
  session.fromPartition('persist:main').on('will-download', (event, item) => {
    const id       = Date.now().toString() + Math.random().toString(36).slice(2,7)
    const filename = item.getFilename()
    const savePath = path.join(os.homedir(), 'Downloads', filename)
    item.setSavePath(savePath)

    mainWindow.webContents.send('download-started', {
      id, filename,
      url:        item.getURL(),
      totalBytes: item.getTotalBytes(),
      savePath
    })

    item.on('updated', (e, state) => {
      if(state === 'progressing') {
        mainWindow.webContents.send('download-progress', {
          id,
          received: item.getReceivedBytes(),
          total:    item.getTotalBytes() || 0,
          speed:    item.getCurrentBytesPerSecond() || 0,
          percent:  item.getTotalBytes()
            ? Math.round(item.getReceivedBytes() / item.getTotalBytes() * 100)
            : 0
        })
      } else if(state === 'interrupted') {
        mainWindow.webContents.send('download-interrupted', { id, filename })
      }
    })

    item.once('done', (e, state) => {
      mainWindow.webContents.send('download-done', {
        id, filename,
        path:    savePath,
        success: state === 'completed',
        state
      })
      if(state === 'completed' && Notification.isSupported()) {
        new Notification({ title:'LUMINA — Download concluído', body: filename }).show()
      }
    })
  })
}

// ── AUTO-UPDATE ───────────────────────────────────────────────────────────────
function checkForUpdates() {
  if(!autoUpdater || !mainWindow || mainWindow.isDestroyed()) return
  autoUpdater.checkForUpdates().catch(e => console.log('[UPDATE] Sem update:', e.message))
}

function setupAutoUpdater() {
  if(!autoUpdater) return
  autoUpdater.on('checking-for-update', () => {
    if(mainWindow?.isDestroyed() === false)
      mainWindow.webContents.send('update-checking')
  })
  autoUpdater.on('update-available', info => {
    if(mainWindow?.isDestroyed() === false)
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || '',
        releaseDate: info.releaseDate || ''
      })
  })
  autoUpdater.on('update-not-available', () => {
    if(mainWindow?.isDestroyed() === false)
      mainWindow.webContents.send('update-not-available', { version: app.getVersion() })
  })
  autoUpdater.on('download-progress', p => {
    if(mainWindow?.isDestroyed() === false)
      mainWindow.webContents.send('update-download-progress', {
        percent:     Math.round(p.percent),
        speed:       p.bytesPerSecond,
        transferred: p.transferred,
        total:       p.total
      })
  })
  autoUpdater.on('update-downloaded', info => {
    if(mainWindow?.isDestroyed() === false)
      mainWindow.webContents.send('update-downloaded', { version: info.version })
    if(Notification.isSupported())
      new Notification({
        title: `LUMINA v${info.version} pronto`,
        body: 'Reinicie para instalar a nova versão.'
      }).show()
  })
  autoUpdater.on('error', err => console.log('[UPDATE] Erro:', err.message))
}

ipcMain.on('update-download', () => {
  if(autoUpdater) autoUpdater.downloadUpdate().catch(e => console.log('[UPDATE]', e.message))
})
ipcMain.on('update-install', () => {
  if(autoUpdater) autoUpdater.quitAndInstall(false, true)
})
ipcMain.on('check-updates-manual', () => checkForUpdates())
ipcMain.handle('get-app-version', () => app.getVersion())

// ── STARTUP ───────────────────────────────────────────────────────────────────
function setStartup(enable) {
  try {
    if(process.platform === 'win32') {
      const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      if(enable) execSync(`reg add "${key}" /v "LUMINA" /t REG_SZ /d "${process.execPath}" /f`)
      else        execSync(`reg delete "${key}" /v "LUMINA" /f`)
    } else if(process.platform === 'darwin') {
      const plist = path.join(os.homedir(),'Library','LaunchAgents','com.starkindustries.lumina.plist')
      if(enable) fs.writeFileSync(plist,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>com.starkindustries.lumina</string>
<key>ProgramArguments</key><array><string>${process.execPath}</string></array>
<key>RunAtLoad</key><true/></dict></plist>`)
      else if(fs.existsSync(plist)) fs.unlinkSync(plist)
    } else {
      const d = path.join(os.homedir(),'.config','autostart')
      const f = path.join(d,'lumina.desktop')
      if(enable) {
        if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true})
        fs.writeFileSync(f,`[Desktop Entry]\nType=Application\nName=Lumina\nExec=${process.execPath}\nHidden=false\nX-GNOME-Autostart-enabled=true\n`)
      } else if(fs.existsSync(f)) fs.unlinkSync(f)
    }
  } catch(e) { console.log('[STARTUP]', e.message) }
}

function isStartupEnabled() {
  try {
    if(process.platform==='win32') { execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "LUMINA"'); return true }
    if(process.platform==='darwin') return fs.existsSync(path.join(os.homedir(),'Library','LaunchAgents','com.starkindustries.lumina.plist'))
    return fs.existsSync(path.join(os.homedir(),'.config','autostart','lumina.desktop'))
  } catch(e) { return false }
}

// ── BACKEND ───────────────────────────────────────────────────────────────────
function findPython() {
  const u = os.userInfo().username
  const c = process.platform === 'win32'
    ? [`C:\\Users\\${u}\\AppData\\Local\\Programs\\Python\\Python314\\python.exe`,
       `C:\\Users\\${u}\\AppData\\Local\\Programs\\Python\\Python313\\python.exe`,
       `C:\\Users\\${u}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
       `C:\\Users\\${u}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
       'python','python3']
    : process.platform === 'darwin'
    ? ['/usr/local/bin/python3','/usr/bin/python3',`${os.homedir()}/.pyenv/shims/python3`,'/opt/homebrew/bin/python3','python3']
    : ['/usr/bin/python3','/usr/local/bin/python3','python3']

  for(const p of c) {
    try { if(!p.includes('/') && !p.includes('\\')) return p; if(fs.existsSync(p)) return p } catch(e) {}
  }
  return 'python3'
}

function startBackend() {
  const IS_WIN  = process.platform === 'win32'
  const exePath = path.join(__dirname, 'backend', IS_WIN ? 'server.exe' : 'server')
  const pyPath  = [path.join(__dirname,'backend','server.py'), path.join(__dirname,'server.py')]
    .find(p => fs.existsSync(p))

  let cmd, args
  if(fs.existsSync(exePath)) { cmd = exePath; args = [] }
  else if(pyPath) { cmd = findPython(); args = [pyPath]; console.log('[BACKEND] Python:', cmd, '->', pyPath) }
  else { console.error('[BACKEND] server.py não encontrado — IA local offline'); return }

  try {
    backendProcess = spawn(cmd, args, {stdio:'pipe', detached:false})
    backendProcess.stdout?.on('data', d => console.log('[BACKEND]', d.toString().trim()))
    backendProcess.stderr?.on('data', d => console.error('[BACKEND ERR]', d.toString().trim()))
    backendProcess.on('error', e => console.error('[BACKEND SPAWN]', e.message))
    backendProcess.on('exit', code => {
      console.log('[BACKEND] Saiu código:', code)
      if(code !== 0 && code !== null && !app.isQuitting) setTimeout(startBackend, 3000)
    })
  } catch(e) { console.error('[BACKEND] Falha:', e.message) }
}

// ── OAUTH + SPOTIFY CALLBACK SERVER ──────────────────────────────────────────
let oauthServer  = null
let spTokens     = {}

function startOAuthServer() {
  if(oauthServer) return
  oauthServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`)

    // Login principal
    if(url.pathname === '/callback') {
      const token = url.searchParams.get('token')
      const error = url.searchParams.get('error')
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'})
      res.end(`<html><body style="font-family:monospace;background:#03050f;color:#00BFFF;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>${error?'❌ Erro':'✅ Login concluído!'}</h2><p>${error||'Pode fechar.'}</p></div><script>setTimeout(()=>window.close(),2000)</script></body></html>`)
      if(token && mainWindow?.isDestroyed() === false) {
        cfg = loadCfg(); cfg.token = token; cfg.first_run_done = true; saveCfg(cfg)
        mainWindow.webContents.send('oauth-success', cfg.user)
      } else if(error && mainWindow?.isDestroyed() === false) {
        mainWindow.webContents.send('oauth-error', error)
      }
      return
    }

    // Spotify OAuth
    if(url.pathname === '/spotify/callback') {
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'})
      res.end(`<html><body style="font-family:monospace;background:#03050f;color:#1db954;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h2>${error?'❌ Erro Spotify':'✅ Spotify conectado!'}</h2><p>${error||'Pode fechar esta janela.'}</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`)

      if(error || !code) {
        if(mainWindow?.isDestroyed() === false) mainWindow.webContents.send('spotify-auth-error', error||'Acesso negado')
        return
      }

      const cfg2 = loadCfg()
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: SP_REDIRECT
      }).toString()
      const opts = {
        hostname:'accounts.spotify.com', path:'/api/token', method:'POST',
        headers:{
          'Content-Type':'application/x-www-form-urlencoded',
          'Authorization':'Basic '+Buffer.from(`${cfg2.sp_client_id}:${cfg2.sp_client_secret}`).toString('base64')
        }
      }
      const spReq = https.request(opts, spRes => {
        let data = ''
        spRes.on('data', c => data += c)
        spRes.on('end', () => {
          try {
            const j = JSON.parse(data)
            if(j.access_token) {
              spTokens = { access_token:j.access_token, refresh_token:j.refresh_token, expires_at:Date.now()+(j.expires_in-60)*1000 }
              cfg2.sp_tokens = spTokens; saveCfg(cfg2)
              if(mainWindow?.isDestroyed() === false) mainWindow.webContents.send('spotify-auth-success', {access_token:j.access_token})
            } else if(mainWindow?.isDestroyed() === false) mainWindow.webContents.send('spotify-auth-error', j.error_description||'Falha')
          } catch(e) { if(mainWindow?.isDestroyed() === false) mainWindow.webContents.send('spotify-auth-error','Erro ao parsear') }
        })
      })
      spReq.on('error', e => { if(mainWindow?.isDestroyed() === false) mainWindow.webContents.send('spotify-auth-error', e.message) })
      spReq.write(body); spReq.end()
      return
    }
    res.writeHead(404); res.end()
  })
  oauthServer.listen(REDIRECT_PORT, '127.0.0.1', () => console.log(`[OAUTH] Porta ${REDIRECT_PORT}`))
  oauthServer.on('error', e => console.error('[OAUTH]', e.message))
}

// Spotify IPC
ipcMain.handle('spotify-get-token', async () => {
  const cfg2 = loadCfg()
  const t = cfg2.sp_tokens || spTokens
  if(!t.access_token) return null
  if(Date.now() > (t.expires_at||0)) {
    if(!t.refresh_token) return null
    return new Promise(resolve => {
      const body = new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh_token}).toString()
      const opts = {
        hostname:'accounts.spotify.com', path:'/api/token', method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded','Authorization':'Basic '+Buffer.from(`${cfg2.sp_client_id}:${cfg2.sp_client_secret}`).toString('base64')}
      }
      const r = https.request(opts, res => {
        let data=''
        res.on('data',c=>data+=c)
        res.on('end',()=>{
          try {
            const j=JSON.parse(data)
            if(j.access_token){spTokens={access_token:j.access_token,refresh_token:j.refresh_token||t.refresh_token,expires_at:Date.now()+(j.expires_in-60)*1000};cfg2.sp_tokens=spTokens;saveCfg(cfg2);resolve(j.access_token)}
            else resolve(null)
          } catch(e){resolve(null)}
        })
      })
      r.on('error',()=>resolve(null)); r.write(body); r.end()
    })
  }
  return t.access_token
})

ipcMain.on('spotify-login', () => {
  const cfg2 = loadCfg()
  if(!cfg2.sp_client_id) { if(mainWindow) mainWindow.webContents.send('spotify-auth-error','Configure o Client ID primeiro'); return }
  const scopes = 'user-read-playback-state user-modify-playback-state user-read-currently-playing streaming playlist-read-private user-library-read user-top-read user-read-recently-played'
  shell.openExternal(`https://accounts.spotify.com/authorize?client_id=${cfg2.sp_client_id}&response_type=code&redirect_uri=${encodeURIComponent(SP_REDIRECT)}&scope=${encodeURIComponent(scopes)}&show_dialog=true`)
})
ipcMain.on('spotify-logout', () => {
  spTokens = {}; const cfg2=loadCfg(); delete cfg2.sp_tokens; saveCfg(cfg2)
})

// Session persistence
ipcMain.on('save-session', (e, data) => {
  try {
    if(!fs.existsSync(CFG_DIR)) fs.mkdirSync(CFG_DIR,{recursive:true})
    fs.writeFileSync(TABS_PATH, JSON.stringify(data,null,2))
  } catch(err) { console.log('[SESSION]', err.message) }
})

// ── APP READY ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const ses = session.fromPartition('persist:main')

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allow = ['geolocation','notifications','media','fullscreen','pointerLock','clipboard-read','midi','midiSysex']
    callback(allow.includes(permission))
  })

  applyAdBlock(ses)

  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders
    delete h['X-Requested-With']; delete h['sec-ch-ua-platform']
    h['User-Agent'] = CHROME_UA
    cb({ requestHeaders: h })
  })

  startBackend()
  startOAuthServer()
  setupAutoUpdater()

  if(!cfg.first_run_done) createWelcome()
  else { createSplash(); setTimeout(createMain, 800) }
})

app.on('window-all-closed', () => {
  app.isQuitting = true
  if(backendProcess) try { backendProcess.kill() } catch(e) {}
  if(oauthServer) oauthServer.close()
  app.quit()
})

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('minimize', () => {
  if(mainWindow?.isDestroyed()===false)    mainWindow.minimize()
  if(welcomeWindow?.isDestroyed()===false) welcomeWindow.minimize()
})
ipcMain.on('maximize', () => { if(mainWindow) mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize() })
ipcMain.on('close', () => { app.isQuitting=true; if(backendProcess)try{backendProcess.kill()}catch(e){}; if(oauthServer)oauthServer.close(); app.quit() })
ipcMain.on('logout', () => { cfg.first_run_done=false; cfg.token=null; cfg.user=null; saveCfg(cfg); app.relaunch(); app.quit() })
ipcMain.on('welcome-done', () => { cfg=loadCfg(); if(welcomeWindow?.isDestroyed()===false)welcomeWindow.destroy(); createSplash(); setTimeout(createMain,800) })
ipcMain.on('set-startup', (e,on) => setStartup(on))
ipcMain.handle('is-startup', () => isStartupEnabled())
ipcMain.on('open-external', (e,url) => shell.openExternal(url))
ipcMain.on('first-run-done', () => { cfg.first_run_done=true; saveCfg(cfg) })
ipcMain.handle('get-server-url', () => SERVER_URL)
ipcMain.on('reveal-file', (e, filePath) => { try{shell.showItemInFolder(filePath)}catch(err){} })
ipcMain.on('open-file',   (e, filePath) => { try{shell.openPath(filePath)}catch(err){} })
ipcMain.on('show-notification', (e, {title,body}) => { if(Notification.isSupported()) new Notification({title,body}).show() })

ipcMain.on('oauth-login', (e, provider) => {
  const loginUrl = `${SERVER_URL}/auth/${provider}?redirect_uri=${encodeURIComponent(`http://localhost:${REDIRECT_PORT}/callback`)}`
  if(mainWindow?.isDestroyed()===false) { mainWindow.webContents.send('open-new-tab', loginUrl); mainWindow.show(); mainWindow.focus() }
  else shell.openExternal(loginUrl)
})

ipcMain.on('open-discord-app', () => {
  const plt = process.platform
  try {
    if(plt==='win32') {
      const dp=[path.join(os.homedir(),'AppData','Local','Discord','Update.exe'),'C:\\Program Files\\Discord\\Discord.exe']
      let ok=false; for(const p of dp){if(fs.existsSync(p)){spawn(p,[],{detached:true,stdio:'ignore'}).unref();ok=true;break}} 
      if(!ok) shell.openExternal('discord://')
    } else if(plt==='darwin') { try{spawn('open',['-a','Discord'],{detached:true}).unref()}catch(e){shell.openExternal('discord://')} }
    else { try{spawn('discord',[],{detached:true}).unref()}catch(e){shell.openExternal('https://discord.com/app')} }
  } catch(e) { shell.openExternal('https://discord.com/app') }
})

ipcMain.on('toggle-fullscreen', () => { if(mainWindow) mainWindow.isFullScreen()?mainWindow.setFullScreen(false):mainWindow.setFullScreen(true) })
ipcMain.on('set-default-browser', () => {
  const plt=process.platform; try {
    if(plt==='win32'){
      const exePath=process.execPath; const appId='LuminaBrowser'
      const cmds=[
        `reg add "HKCU\\Software\\Classes\\${appId}" /ve /d "LUMINA Browser Document" /f`,
        `reg add "HKCU\\Software\\Classes\\${appId}\\DefaultIcon" /ve /d "\\"${exePath}\\",0" /f`,
        `reg add "HKCU\\Software\\Classes\\${appId}\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\http\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\https\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\.htm" /ve /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Classes\\.html" /ve /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities\\URLAssociations" /v "http" /d "${appId}" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities\\URLAssociations" /v "https" /d "${appId}" /f`,
        `reg add "HKCU\\Software\\RegisteredApplications" /v "Lumina" /d "Software\\Clients\\StartMenuInternet\\Lumina\\Capabilities" /f`,
      ]
      for(const c of cmds){try{execSync(c)}catch(e){}}
      app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https')
      try{execSync('start ms-settings:defaultapps-browser')}catch(e){try{execSync('start ms-settings:defaultapps')}catch(e2){}}
    } else if(plt==='darwin'){app.setAsDefaultProtocolClient('http');app.setAsDefaultProtocolClient('https')}
    else{app.setAsDefaultProtocolClient('http');app.setAsDefaultProtocolClient('https')}
  } catch(e){}
})

// ── AD BLOCKER ────────────────────────────────────────────────────────────────
const AD_URLS = [
  '*://*.doubleclick.net/*','*://*.googlesyndication.com/*','*://*.googleadservices.com/*',
  '*://*.adservice.google.com/*','*://*.amazon-adsystem.com/*','*://*.adnxs.com/*',
  '*://*.outbrain.com/*','*://*.taboola.com/*','*://*.criteo.com/*','*://*.hotjar.com/*',
  '*://*.fullstory.com/*','*://*.mixpanel.com/*','*://*.segment.io/*','*://*.segment.com/*',
  '*://*.pubmatic.com/*','*://*.rubiconproject.com/*','*://*.openx.net/*','*://*.appnexus.com/*',
  '*://*.media.net/*','*://*.advertising.com/*','*://pagead2.googlesyndication.com/*',
  '*://*.googletagmanager.com/*','*://*.google-analytics.com/*','*://*.analytics.google.com/*',
  '*://*.clarity.ms/*','*://*.mouseflow.com/*','*://*.crazyegg.com/*','*://*.logrocket.com/*',
  '*://*.heap.io/*','*://*.amplitude.com/*','*://*.intercom.io/*','*://*.drift.com/*',
  '*://*.ads.tiktok.com/*','*://*.facebook.com/tr/*','*://*.connect.facebook.net/*',
  '*://*.ads.linkedin.com/*','*://*.bat.bing.com/*','*://*.newrelic.com/*','*://*.nr-data.net/*',
  '*://*.sentry.io/*','*://*.bugsnag.com/*','*://*.rollbar.com/*','*://*.pingdom.net/*',
  '*://*.statcounter.com/*','*://*.optimizely.com/*','*://*.abtasty.com/*','*://*.vwo.com/*',
]
let adBlockOn=true, adsBlocked=0

function applyAdBlock(ses) {
  if(!ses) return
  if(adBlockOn) {
    ses.webRequest.onBeforeRequest({urls:AD_URLS},(details,cb)=>{ adsBlocked++; if(mainWindow?.isDestroyed()===false) mainWindow.webContents.send('ad-blocked',adsBlocked); cb({cancel:true}) })
  } else { try{ses.webRequest.onBeforeRequest(null)}catch(e){} }
}
ipcMain.on('adblock-toggle',(e,enabled)=>{ adBlockOn=enabled; if(!enabled)adsBlocked=0; applyAdBlock(session.fromPartition('persist:main')) })
ipcMain.handle('adblock-status',()=>({enabled:adBlockOn,count:adsBlocked}))

// ── USER AGENT + ANTI-FP + POPUPS ─────────────────────────────────────────────
const CHROME_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const ANTI_FP=`(function(){const o=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(t){const c=this.getContext('2d');if(c){const i=c.getImageData(0,0,this.width,this.height);for(let j=0;j<i.data.length;j+=4){i.data[j]^=Math.random()>.99?1:0;i.data[j+1]^=Math.random()>.99?1:0}c.putImageData(i,0,0)}return o.apply(this,arguments)};const gp=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(p){if(p===37445)return'Intel Inc.';if(p===37446)return'Intel Iris OpenGL Engine';return gp.call(this,p)};Object.defineProperty(navigator,'webdriver',{get:()=>false});Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});Object.defineProperty(navigator,'languages',{get:()=>['pt-BR','pt','en-US','en']})})()`

app.on('web-contents-created',(e,contents)=>{
  if(contents.getType()==='webview'){
    contents.setUserAgent(CHROME_UA)
    contents.on('did-start-navigation',()=>{ contents.executeJavaScript(ANTI_FP).catch(()=>{}) })
    contents.setWindowOpenHandler(({url})=>{ if(!url||url==='about:blank')return{action:'deny'}; if(mainWindow?.isDestroyed()===false)mainWindow.webContents.send('open-new-tab',url); return{action:'deny'} })
  }
})
