/**
 * LUMINA renderer_additions.js
 * Adicione este <script src="renderer_additions.js"> no final do index.html,
 * APÓS o <script src="renderer.js">
 *
 * Contém:
 *  1. Download Manager com UI completa
 *  2. Spotify OAuth real + player completo
 *  3. Auto-update UI (banner + modal)
 *  4. Persistência de sessão (abas restauradas)
 *  5. Quick Notes flutuante (Ctrl+N)
 *  6. Network speed monitor na status bar
 *  7. Keyboard shortcuts cheatsheet (F1)
 *  8. Pip-Boy notifications (notificações estilo HUD)
 */

const { ipcRenderer } = require('electron')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const BACKEND = 'http://localhost:5678'

// ═══════════════════════════════════════════════════════════════════
// 1. DOWNLOAD MANAGER — UI COMPLETA
// ═══════════════════════════════════════════════════════════════════
let _downloads = {}

// Cria painel de downloads se não existir
function ensureDownloadPanel() {
  if(document.getElementById('panel-downloads')) return
  const panel = document.createElement('div')
  panel.id = 'panel-downloads'
  panel.className = 'panel glass hidden'
  panel.style.cssText = 'width:380px;max-height:500px'
  panel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title-wrap">
        <span class="panel-dot" style="background:#22c55e"></span>
        <span class="panel-title">⬇ Downloads</span>
        <span id="dl-badge" style="background:rgba(34,197,94,0.2);color:#22c55e;font-size:9px;padding:2px 6px;border-radius:10px;margin-left:6px;display:none">0</span>
      </div>
      <div style="display:flex;gap:6px">
        <button id="dl-open-folder" class="panel-btn" title="Abrir pasta Downloads" style="font-size:10px;padding:4px 8px;border:1px solid var(--glass-border);border-radius:5px">📁 Pasta</button>
        <button id="dl-clear-done" class="panel-btn" style="font-size:10px;padding:4px 8px;color:var(--text-dim);border:1px solid var(--glass-border);border-radius:5px">Limpar</button>
        <button class="panel-btn panel-close">✕</button>
      </div>
    </div>
    <div id="downloads-list" style="max-height:420px;overflow-y:auto;padding:8px"></div>
    <div id="dl-empty" style="padding:32px;text-align:center;color:var(--text-dim);font-size:11px;display:none">
      Nenhum download ainda.<br>Os arquivos baixados aparecem aqui.
    </div>`

  document.getElementById('content-area').appendChild(panel)

  panel.querySelector('.panel-close').onclick = () => panel.classList.add('hidden')
  document.getElementById('dl-open-folder').onclick = () =>
    ipcRenderer.send('reveal-file', path.join(os.homedir(),'Downloads'))
  document.getElementById('dl-clear-done').onclick = () => {
    Object.keys(_downloads).forEach(id => { if(_downloads[id].done) delete _downloads[id] })
    renderDownloads()
    if(typeof toast === 'function') toast('Downloads limpos','info')
  }
}

// Botão na sidebar para abrir downloads
function addDownloadSidebarBtn() {
  const sbSection = document.querySelector('#sidebar .sb-section')
  if(!sbSection || document.getElementById('btn-downloads')) return
  const btn = document.createElement('button')
  btn.className = 'sb-btn'
  btn.id = 'btn-downloads'
  btn.dataset.label = 'Downloads'
  btn.textContent = '⬇'
  btn.onclick = () => { ensureDownloadPanel(); togglePanel('panel-downloads') }
  sbSection.appendChild(btn)
}

function renderDownloads() {
  ensureDownloadPanel()
  const list  = document.getElementById('downloads-list')
  const empty = document.getElementById('dl-empty')
  const badge = document.getElementById('dl-badge')
  const items = Object.values(_downloads)

  if(!items.length) {
    list.innerHTML = ''; empty.style.display = 'block'; badge.style.display = 'none'
    return
  }

  empty.style.display = 'none'
  const active = items.filter(d => !d.done).length
  badge.textContent = active
  badge.style.display = active ? 'inline' : 'none'

  list.innerHTML = items.slice().reverse().map(dl => {
    const pct   = dl.total ? Math.round(dl.received / dl.total * 100) : 0
    const recMB = (dl.received / 1048576).toFixed(1)
    const totMB = dl.total ? (dl.total / 1048576).toFixed(1) : '?'
    const spd   = dl.speed > 0 ? `${(dl.speed/1024).toFixed(0)} KB/s` : ''
    const ext   = (dl.filename.split('.').pop()||'').toUpperCase().slice(0,4)
    const extColors = {MP4:'#ef4444',MKV:'#ef4444',MP3:'#1db954',FLAC:'#1db954',
      ZIP:'#f59e0b',RAR:'#f59e0b','7Z':'#f59e0b',EXE:'#3b82f6',MSI:'#3b82f6',
      PDF:'#ec4899',PNG:'#22c55e',JPG:'#22c55e',JPEG:'#22c55e',GIF:'#a855f7'}
    const extColor = extColors[ext] || 'var(--accent)'

    return `<div class="dl-item" id="dl-${dl.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--glass-border);border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:6px;background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:${extColor};flex-shrink:0">${ext||'?'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${dl.filename}">${dl.filename}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:1px">
            ${dl.done
              ? (dl.success ? `<span style="color:#22c55e">✓ Concluído</span> · ${totMB} MB`
                : `<span style="color:#ef4444">✕ Falhou (${dl.state})</span>`)
              : dl.interrupted
              ? `<span style="color:#f59e0b">⚠ Interrompido</span>`
              : `${recMB} / ${totMB} MB ${spd ? '· '+spd : ''}`}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${dl.done && dl.success ? `<button onclick="ipcRenderer.send('open-file','${dl.path.replace(/\\/g,'\\\\')}')" style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;cursor:pointer;padding:4px 8px;border-radius:5px;font-size:10px">▶ Abrir</button>` : ''}
          ${dl.done ? `<button onclick="ipcRenderer.send('reveal-file','${dl.path.replace(/\\/g,'\\\\')}')" style="background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;padding:4px 8px;border-radius:5px;font-size:10px">📁</button>` : ''}
          <button onclick="delete _downloads['${dl.id}'];renderDownloads()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;padding:4px 6px;font-size:11px">✕</button>
        </div>
      </div>
      ${!dl.done && !dl.interrupted
        ? `<div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
             <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:2px;transition:width 0.3s;box-shadow:0 0 8px var(--accent-glow)"></div>
           </div>`
        : ''}
    </div>`
  }).join('')
}

ipcRenderer.on('download-started', (e, dl) => {
  _downloads[dl.id] = { ...dl, received:0, done:false, interrupted:false }
  ensureDownloadPanel()
  renderDownloads()
  pipBoyNotify('⬇ Download iniciado', dl.filename, '#22c55e')
})

ipcRenderer.on('download-progress', (e, {id, received, total, speed, percent}) => {
  if(_downloads[id]) {
    _downloads[id].received = received
    _downloads[id].total    = total
    _downloads[id].speed    = speed
    renderDownloads()
    // Atualiza a download-bar legada também
    const el = document.getElementById('download-bar')
    if(el) {
      el.classList.add('show')
      el.innerHTML = `<div style="padding:0 12px;font-size:11px;color:var(--text);display:flex;align-items:center;gap:8px"><span>⬇ ${_downloads[id].filename}</span><div style="flex:1;height:3px;background:rgba(255,255,255,0.1);border-radius:2px"><div style="height:100%;width:${percent}%;background:var(--accent);border-radius:2px;transition:width 0.3s"></div></div><span style="color:var(--accent)">${percent}%</span><button onclick="document.getElementById('download-bar').classList.remove('show')" style="background:none;border:none;color:var(--text-dim);cursor:pointer">✕</button></div>`
    }
  }
})

ipcRenderer.on('download-done', (e, {id, filename, path: savePath, success, state}) => {
  if(_downloads[id]) {
    _downloads[id].done     = true
    _downloads[id].success  = success
    _downloads[id].state    = state
    _downloads[id].path     = savePath
    renderDownloads()
    const el = document.getElementById('download-bar')
    if(el) setTimeout(() => el.classList.remove('show'), 3000)
    if(success) {
      pipBoyNotify('✅ Download concluído', filename, '#22c55e')
    } else {
      pipBoyNotify('❌ Download falhou', filename, '#ef4444')
    }
  }
})

ipcRenderer.on('download-interrupted', (e, {id, filename}) => {
  if(_downloads[id]) { _downloads[id].interrupted = true; renderDownloads() }
})

// ═══════════════════════════════════════════════════════════════════
// 2. SPOTIFY OAUTH REAL + PLAYER COMPLETO
// ═══════════════════════════════════════════════════════════════════
let _spToken      = null
let _spPlaying    = false
let _spShuffled   = false
let _spRepeat     = 'off'  // off | track | context
let _spPollTimer  = null

async function getSpToken() {
  try { _spToken = await ipcRenderer.invoke('spotify-get-token') } catch(e) {}
  return _spToken
}

// Reescreve o painel Spotify no index.html com UI completa
function buildSpotifyPanel() {
  const content = document.getElementById('spotify-content')
  if(!content) return
  content.innerHTML = `
    <!-- SETUP -->
    <div id="spotify-setup" style="display:flex;flex-direction:column;gap:12px;padding:4px 0">
      <p style="font-size:11px;color:var(--text-dim);line-height:1.6">Cole suas credenciais do <strong style="color:var(--text)">Spotify for Developers</strong> para conectar:</p>
      <input class="sp-input settings-input" id="sp-client-id"     placeholder="Client ID">
      <input class="sp-input settings-input" id="sp-client-secret" placeholder="Client Secret" type="password">
      <button id="sp-save-btn" class="settings-btn full" style="padding:12px">💾 Salvar credenciais</button>
      <button id="sp-login-btn" class="settings-btn full" style="padding:12px;background:rgba(29,185,84,0.15);border:1px solid rgba(29,185,84,0.4);color:#1db954;display:none">
        🎵 Conectar com Spotify
      </button>
      <a href="#" id="sp-link" class="settings-link" style="text-align:center">→ developer.spotify.com/dashboard</a>
      <div id="sp-auth-status" style="font-size:10px;text-align:center;color:var(--text-dim)"></div>
    </div>

    <!-- PLAYER COMPLETO -->
    <div id="spotify-player" style="display:none;flex-direction:column;gap:0">
      <!-- Album art + track info -->
      <div style="position:relative;overflow:hidden;border-radius:12px;margin-bottom:12px">
        <img id="sp-art" src="" alt="cover" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;display:block;background:#0a0f1e">
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(3,5,15,0.95) 0%,transparent 50%);border-radius:12px"></div>
        <div style="position:absolute;bottom:12px;left:14px;right:14px">
          <div id="sp-track"  style="font-size:15px;font-weight:bold;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">--</div>
          <div id="sp-artist" style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">--</div>
        </div>
        <div id="sp-device" style="position:absolute;top:10px;right:10px;font-size:9px;color:rgba(255,255,255,0.5);background:rgba(0,0,0,0.5);padding:3px 8px;border-radius:10px"></div>
      </div>

      <!-- Progresso -->
      <div style="margin-bottom:10px">
        <div id="sp-progress-bar" style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;cursor:pointer;margin-bottom:4px" onclick="spSeek(event)">
          <div id="sp-progress-fill" style="height:100%;background:#1db954;border-radius:2px;width:0%;transition:width 0.3s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim)">
          <span id="sp-cur">0:00</span><span id="sp-dur">0:00</span>
        </div>
      </div>

      <!-- Controles principais -->
      <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:12px">
        <button id="sp-shuffle" title="Shuffle" style="background:none;border:none;cursor:pointer;font-size:16px;padding:6px;border-radius:6px;transition:all 0.15s;color:var(--text-dim)">🔀</button>
        <button id="sp-prev"    style="background:none;border:none;cursor:pointer;font-size:22px;padding:6px;border-radius:8px;color:var(--text);transition:all 0.15s">⏮</button>
        <button id="sp-play"    style="background:#1db954;border:none;cursor:pointer;font-size:24px;padding:10px 16px;border-radius:50%;color:#000;font-weight:bold;transition:all 0.15s;width:52px;height:52px;display:flex;align-items:center;justify-content:center">▶</button>
        <button id="sp-next"    style="background:none;border:none;cursor:pointer;font-size:22px;padding:6px;border-radius:8px;color:var(--text);transition:all 0.15s">⏭</button>
        <button id="sp-repeat"  title="Repeat" style="background:none;border:none;cursor:pointer;font-size:16px;padding:6px;border-radius:6px;transition:all 0.15s;color:var(--text-dim)">🔁</button>
      </div>

      <!-- Volume -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span style="font-size:12px;color:var(--text-dim)">🔈</span>
        <input type="range" id="sp-volume" min="0" max="100" value="50" style="flex:1;accent-color:#1db954">
        <span style="font-size:12px;color:var(--text-dim)">🔊</span>
      </div>

      <!-- Tabs: Fila / Playlists / Recentes / Top -->
      <div style="display:flex;gap:4px;margin-bottom:8px">
        <button class="sp-tab active" data-tab="playlists" style="flex:1;background:rgba(29,185,84,0.15);border:1px solid rgba(29,185,84,0.4);color:#1db954;cursor:pointer;padding:6px 4px;border-radius:6px;font-size:10px;font-family:inherit">Playlists</button>
        <button class="sp-tab" data-tab="recent"    style="flex:1;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;padding:6px 4px;border-radius:6px;font-size:10px;font-family:inherit">Recentes</button>
        <button class="sp-tab" data-tab="top"       style="flex:1;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;padding:6px 4px;border-radius:6px;font-size:10px;font-family:inherit">Top</button>
        <button class="sp-tab" data-tab="devices"   style="flex:1;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;padding:6px 4px;border-radius:6px;font-size:10px;font-family:inherit">🖥</button>
      </div>
      <div id="sp-tab-content" style="max-height:200px;overflow-y:auto"></div>

      <!-- Desconectar -->
      <button id="sp-logout-btn" style="margin-top:10px;background:rgba(255,68,85,0.08);border:1px solid rgba(255,68,85,0.2);color:rgba(255,68,85,0.6);cursor:pointer;padding:8px;border-radius:8px;font-size:10px;font-family:inherit;width:100%">Desconectar Spotify</button>
    </div>`

  bindSpotifyEvents()
  initSpotify()
}

function bindSpotifyEvents() {
  const $id = id => document.getElementById(id)

  $id('sp-save-btn').onclick = async () => {
    const cid = $id('sp-client-id').value.trim()
    const sec = $id('sp-client-secret').value.trim()
    if(!cid || !sec) { if(typeof toast==='function') toast('Preencha Client ID e Secret','error'); return }
    await fetch(`${BACKEND}/spotify/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:sec})}).catch(()=>{})
    $id('sp-login-btn').style.display = 'block'
    $id('sp-auth-status').textContent = '✅ Credenciais salvas! Clique em Conectar.'
    $id('sp-auth-status').style.color = '#22c55e'
    if(typeof toast==='function') toast('✅ Credenciais Spotify salvas!','success')
  }

  $id('sp-login-btn').onclick = () => ipcRenderer.send('spotify-login')

  $id('sp-play')?.addEventListener('click', async () => {
    await fetch(`${BACKEND}/spotify/toggle`,{method:'POST'}).catch(()=>{})
    setTimeout(refreshSpotifyPlayer, 500)
  })
  $id('sp-prev')?.addEventListener('click', async () => {
    await fetch(`${BACKEND}/spotify/prev`,{method:'POST'}).catch(()=>{})
    setTimeout(refreshSpotifyPlayer, 600)
  })
  $id('sp-next')?.addEventListener('click', async () => {
    await fetch(`${BACKEND}/spotify/next`,{method:'POST'}).catch(()=>{})
    setTimeout(refreshSpotifyPlayer, 600)
  })
  $id('sp-shuffle')?.addEventListener('click', async () => {
    _spShuffled = !_spShuffled
    $id('sp-shuffle').style.color = _spShuffled ? '#1db954' : 'var(--text-dim)'
    await fetch(`${BACKEND}/spotify/shuffle`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:_spShuffled})}).catch(()=>{})
  })
  $id('sp-repeat')?.addEventListener('click', async () => {
    const states = ['off','track','context']
    const icons  = ['🔁','🔂','🔁']
    const colors = ['var(--text-dim)','#1db954','#1db954']
    const idx    = (states.indexOf(_spRepeat) + 1) % 3
    _spRepeat    = states[idx]
    $id('sp-repeat').textContent = icons[idx]
    $id('sp-repeat').style.color = colors[idx]
    await fetch(`${BACKEND}/spotify/repeat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:_spRepeat})}).catch(()=>{})
  })
  $id('sp-volume')?.addEventListener('input', async e => {
    await fetch(`${BACKEND}/spotify/volume`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({volume:parseInt(e.target.value)})}).catch(()=>{})
  })
  $id('sp-logout-btn')?.addEventListener('click', () => {
    ipcRenderer.send('spotify-logout')
    $id('spotify-player').style.display = 'none'
    $id('spotify-setup').style.display  = 'flex'
    clearInterval(_spPollTimer)
    if(typeof toast==='function') toast('Spotify desconectado','info')
  })
  $id('sp-link')?.addEventListener('click', e => {
    e.preventDefault()
    if(typeof createTab === 'function') createTab('https://developer.spotify.com/dashboard')
  })

  // Tabs
  document.querySelectorAll('.sp-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.sp-tab').forEach(b => {
        b.style.background = 'rgba(255,255,255,0.03)'
        b.style.borderColor = 'var(--glass-border)'
        b.style.color = 'var(--text-dim)'
      })
      btn.style.background = 'rgba(29,185,84,0.15)'
      btn.style.borderColor = 'rgba(29,185,84,0.4)'
      btn.style.color = '#1db954'
      loadSpTab(btn.dataset.tab)
    }
  })
}

function spSeek(e) {
  const bar = document.getElementById('sp-progress-bar')
  if(!bar) return
  const rect = bar.getBoundingClientRect()
  const pct  = (e.clientX - rect.left) / rect.width
  const dur  = parseInt(document.getElementById('sp-dur')?.dataset?.ms || 0)
  if(!dur) return
  const pos  = Math.round(pct * dur)
  fetch(`${BACKEND}/spotify/seek`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({position_ms:pos})}).catch(()=>{})
}

async function loadSpTab(tab) {
  const content = document.getElementById('sp-tab-content')
  if(!content) return
  content.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-dim);font-size:11px">Carregando...</div>'
  try {
    let data
    if(tab === 'playlists') { data = await fetch(`${BACKEND}/spotify/playlists`).then(r=>r.json()) }
    else if(tab === 'recent') { data = await fetch(`${BACKEND}/spotify/recent`).then(r=>r.json()) }
    else if(tab === 'top')   { data = await fetch(`${BACKEND}/spotify/top-tracks`).then(r=>r.json()) }
    else if(tab === 'devices') { data = await fetch(`${BACKEND}/spotify/devices`).then(r=>r.json()) }

    if(!data || (Array.isArray(data) && !data.length)) {
      content.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:11px">Nada encontrado</div>'
      return
    }

    if(tab === 'devices') {
      content.innerHTML = data.map(d => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:6px;border:1px solid var(--glass-border);margin-bottom:4px;background:${d.is_active?'rgba(29,185,84,0.08)':'rgba(255,255,255,0.02)'}"
             onclick="fetch('${BACKEND}/spotify/transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_id:'${d.id}'})}).then(()=>{if(typeof toast==='function')toast('Transferindo para ${d.name.replace(/'/g,"\\'")}','success')})">
          <span style="font-size:18px">${d.type==='Computer'?'💻':d.type==='Smartphone'?'📱':d.type==='Speaker'?'🔊':'🎵'}</span>
          <div>
            <div style="font-size:12px;color:${d.is_active?'#1db954':'var(--text)'}">${d.name}</div>
            <div style="font-size:10px;color:var(--text-dim)">${d.type} · Vol ${d.volume_percent}%</div>
          </div>
          ${d.is_active?'<span style="font-size:10px;color:#1db954;margin-left:auto">● Ativo</span>':''}
        </div>`).join('')
      return
    }

    if(tab === 'playlists') {
      content.innerHTML = data.map(pl => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;border-radius:6px;transition:background 0.1s" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''"
             onclick="fetch('${BACKEND}/spotify/play-playlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playlist_id:'${pl.id}'})}).then(()=>{if(typeof toast==='function')toast('▶ ${(pl.name||'').replace(/'/g,"\\'").slice(0,30)}','success');setTimeout(refreshSpotifyPlayer,800)})">
          <img src="${pl.art||''}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;background:#0a0f1e;flex-shrink:0" onerror="this.style.display='none'">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pl.name}</div>
            <div style="font-size:10px;color:var(--text-dim)">${pl.tracks} faixas</div>
          </div>
        </div>`).join('')
      return
    }

    // recent / top — tracks
    content.innerHTML = data.map(t => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;border-radius:6px;transition:background 0.1s" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''"
           onclick="fetch('${BACKEND}/spotify/queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uri:'${t.uri}'})}).then(()=>{if(typeof toast==='function')toast('Adicionado à fila','success')})">
        <img src="${t.art||''}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;background:#0a0f1e;flex-shrink:0" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</div>
          <div style="font-size:10px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.artist}</div>
        </div>
        <span style="font-size:10px;color:var(--text-dim)" title="Adicionar à fila">+</span>
      </div>`).join('')
  } catch(e) {
    content.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:11px">Erro: ${e.message}</div>`
  }
}

let _spProgressSecs = 0
let _spDurationMs   = 0
let _spProgressTimer = null

async function refreshSpotifyPlayer() {
  const token = await getSpToken()
  const setupEl  = document.getElementById('spotify-setup')
  const playerEl = document.getElementById('spotify-player')
  if(!setupEl || !playerEl) return

  if(!token) {
    setupEl.style.display  = 'flex'
    playerEl.style.display = 'none'
    const cfg2 = JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(),'.lumina','config.json'),'utf8') || '{}')
    if(cfg2.sp_client_id) document.getElementById('sp-login-btn').style.display = 'block'
    return
  }

  setupEl.style.display  = 'none'
  playerEl.style.display = 'flex'

  try {
    const d = await fetch(`${BACKEND}/spotify/current`).then(r=>r.json())
    const $id = id => document.getElementById(id)

    $id('sp-track').textContent  = d.track  || 'Nada tocando'
    $id('sp-artist').textContent = d.artist || '--'
    if(d.device) $id('sp-device').textContent = `🖥 ${d.device}`
    if(d.art) $id('sp-art').src = d.art
    $id('sp-play').textContent   = d.playing ? '⏸' : '▶'
    $id('sp-play').style.background = d.playing ? '#1db954' : 'rgba(29,185,84,0.4)'
    _spPlaying     = d.playing
    _spDurationMs  = d.duration || 0
    _spProgressSecs= Math.floor((d.progress||0)/1000)

    if($id('sp-dur')) {
      $id('sp-dur').textContent = fmtMs(d.duration)
      $id('sp-dur').dataset.ms  = d.duration
    }
    if($id('sp-cur'))  $id('sp-cur').textContent  = fmtMs(d.progress)
    if($id('sp-progress-fill')) {
      const pct = d.duration > 0 ? (d.progress/d.duration*100) : 0
      $id('sp-progress-fill').style.width = pct+'%'
    }

    // Progress ticker
    clearInterval(_spProgressTimer)
    if(d.playing && d.duration > 0) {
      _spProgressTimer = setInterval(() => {
        _spProgressSecs++
        const ms  = _spProgressSecs * 1000
        const pct = _spDurationMs > 0 ? (ms/_spDurationMs*100) : 0
        const f   = document.getElementById('sp-progress-fill')
        const c   = document.getElementById('sp-cur')
        if(f) f.style.width = Math.min(pct,100)+'%'
        if(c) c.textContent = fmtMs(ms)
        if(ms >= _spDurationMs) clearInterval(_spProgressTimer)
      }, 1000)
    }
  } catch(e) {}
}

function fmtMs(ms) {
  if(!ms) return '0:00'
  const s = Math.floor(ms/1000)
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
}

async function initSpotify() {
  buildSpotifyPanel()
  refreshSpotifyPlayer()
  clearInterval(_spPollTimer)
  _spPollTimer = setInterval(refreshSpotifyPlayer, 5000)
}

// Sobrescreve o initSpotify do renderer original
window.initSpotify = initSpotify

// Callbacks OAuth Spotify vindos do main process
ipcRenderer.on('spotify-auth-success', (e, data) => {
  _spToken = data.access_token
  pipBoyNotify('🎵 Spotify conectado!', 'Player pronto', '#1db954')
  if(typeof toast === 'function') toast('🎵 Spotify conectado com sucesso!','success',4000)
  refreshSpotifyPlayer()
})
ipcRenderer.on('spotify-auth-error', (e, msg) => {
  const el = document.getElementById('sp-auth-status')
  if(el) { el.textContent = '❌ '+msg; el.style.color='#ef4444' }
  if(typeof toast === 'function') toast('❌ Erro Spotify: '+msg,'error',5000)
})

// ═══════════════════════════════════════════════════════════════════
// 3. AUTO-UPDATE UI
// ═══════════════════════════════════════════════════════════════════
function createUpdateBanner() {
  const el = document.createElement('div')
  el.id = 'update-banner'
  el.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:10000;background:linear-gradient(135deg,rgba(0,191,255,0.15),rgba(0,191,255,0.05));border-bottom:1px solid rgba(0,191,255,0.3);padding:0;height:0;overflow:hidden;transition:height 0.3s cubic-bezier(0.4,0,0.2,1);backdrop-filter:blur(20px);display:flex;align-items:center;justify-content:space-between`
  el.innerHTML = `
    <div style="padding:0 20px;display:flex;align-items:center;gap:12px;width:100%">
      <span id="update-banner-icon" style="font-size:16px">⬇</span>
      <div style="flex:1">
        <div id="update-banner-msg" style="font-size:12px;color:var(--text);font-family:var(--font)">Nova versão disponível</div>
        <div id="update-banner-sub" style="font-size:10px;color:var(--text-dim)"></div>
      </div>
      <div id="update-progress-wrap" style="display:none;width:120px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
        <div id="update-progress-fill" style="height:100%;background:var(--accent);border-radius:2px;width:0%;transition:width 0.3s"></div>
      </div>
      <button id="update-btn"     style="background:var(--accent);border:none;color:#000;cursor:pointer;padding:6px 16px;border-radius:8px;font-size:11px;font-family:var(--font);font-weight:bold;white-space:nowrap">Baixar</button>
      <button id="update-dismiss" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;padding:4px 8px">✕</button>
    </div>`
  document.body.appendChild(el)

  document.getElementById('update-dismiss').onclick = () => { el.style.height = '0' }
  document.getElementById('update-btn').onclick = () => {
    const btn = document.getElementById('update-btn')
    const msg = document.getElementById('update-banner-msg')
    btn.textContent = 'Baixando...'
    btn.disabled    = true
    msg.textContent = 'Baixando atualização...'
    document.getElementById('update-progress-wrap').style.display = 'block'
    ipcRenderer.send('update-download')
  }
  return el
}

ipcRenderer.on('update-available', (e, {version, releaseNotes}) => {
  const banner = document.getElementById('update-banner') || createUpdateBanner()
  document.getElementById('update-banner-msg').textContent = `🆕 LUMINA v${version} disponível!`
  document.getElementById('update-banner-sub').textContent = releaseNotes ? releaseNotes.toString().slice(0,80) : 'Clique para baixar e instalar.'
  document.getElementById('update-btn').textContent = 'Baixar'
  document.getElementById('update-btn').disabled    = false
  banner.style.height = '46px'
  pipBoyNotify(`🆕 v${version} disponível`, 'Clique para atualizar', 'var(--accent)')
})

ipcRenderer.on('update-download-progress', (e, {percent, speed}) => {
  const fill = document.getElementById('update-progress-fill')
  const msg  = document.getElementById('update-banner-msg')
  if(fill) fill.style.width = percent+'%'
  if(msg)  msg.textContent  = `Baixando... ${percent}% (${(speed/1024).toFixed(0)} KB/s)`
})

ipcRenderer.on('update-downloaded', (e, {version}) => {
  const msg = document.getElementById('update-banner-msg')
  const btn = document.getElementById('update-btn')
  if(msg) msg.textContent = `✅ v${version} pronto — reinicie para instalar`
  if(btn) { btn.textContent='Reiniciar agora'; btn.disabled=false; btn.onclick=()=>ipcRenderer.send('update-install') }
  document.getElementById('update-progress-wrap').style.display = 'none'
  pipBoyNotify(`✅ LUMINA v${version} pronto`, 'Reinicie para instalar', '#22c55e')
})

ipcRenderer.on('update-not-available', (e, {version}) => {
  console.log('[UPDATE] App já na versão mais recente:', version)
})

// IPC update manual nas configurações
const settingsContent = document.getElementById('settings-content')
if(settingsContent) {
  const updateSection = document.createElement('div')
  updateSection.className = 'settings-section'
  updateSection.innerHTML = `
    <div class="settings-label">🔄 ATUALIZAÇÃO</div>
    <div id="update-version-info" style="font-size:11px;color:var(--text-dim);margin-bottom:8px">Carregando versão...</div>
    <button class="settings-btn full" id="cfg-check-update">🔍 Verificar atualizações</button>`
  settingsContent.appendChild(updateSection)

  ipcRenderer.invoke('get-app-version').then(v => {
    const el = document.getElementById('update-version-info')
    if(el) el.textContent = `Versão atual: v${v}`
  }).catch(()=>{})

  document.getElementById('cfg-check-update').onclick = () => {
    ipcRenderer.send('check-updates-manual')
    if(typeof toast === 'function') toast('🔍 Verificando atualizações...','info',2000)
    document.getElementById('cfg-check-update').textContent = '⏳ Verificando...'
    setTimeout(() => {
      const btn = document.getElementById('cfg-check-update')
      if(btn) btn.textContent = '🔍 Verificar atualizações'
    }, 5000)
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. PERSISTÊNCIA DE SESSÃO — restaurar abas
// ═══════════════════════════════════════════════════════════════════
ipcRenderer.on('restore-session', (e, session) => {
  if(!session || !session.tabs || !session.tabs.length) return
  // Aguarda o browser inicializar
  setTimeout(() => {
    const hasRealTabs = typeof tabs !== 'undefined' && tabs.some(t=>t.url)
    if(hasRealTabs) return  // usuário já tem abas abertas, não restaura

    if(typeof toast === 'function')
      toast(`♻ Restaurando ${session.tabs.length} aba(s) da sessão anterior...`, 'info', 3000)

    session.tabs.forEach((t, i) => {
      if(!t.url || t.url === 'about:blank') return
      setTimeout(() => {
        if(typeof createTab === 'function') createTab(t.url, t.title || t.url)
      }, i * 200)
    })
  }, 1500)
})

// Salva sessão ao fechar
window.addEventListener('beforeunload', saveBrowserSession)

function saveBrowserSession() {
  try {
    const sessionData = {
      tabs: (typeof tabs !== 'undefined' ? tabs : [])
        .filter(t => t.url && t.url !== 'about:blank' && !t.incognito)
        .map(t => ({ url: t.url, title: t.title })),
      savedAt: Date.now()
    }
    ipcRenderer.send('save-session', sessionData)
  } catch(e) {}
}

setInterval(saveBrowserSession, 30000)  // Salva a cada 30s

// ═══════════════════════════════════════════════════════════════════
// 5. QUICK NOTES FLUTUANTE (Ctrl+N)
// ═══════════════════════════════════════════════════════════════════
const NOTES_FILE = require('path').join(require('os').homedir(), '.lumina', 'notes.json')

function loadNotes() {
  try { if(require('fs').existsSync(NOTES_FILE)) return JSON.parse(require('fs').readFileSync(NOTES_FILE,'utf8')) } catch(e) {}
  return []
}
function saveNotes(notes) { try { require('fs').writeFileSync(NOTES_FILE, JSON.stringify(notes,null,2)) } catch(e) {} }

let notesVisible = false
const notesEl = document.createElement('div')
notesEl.id = 'quick-notes'
notesEl.style.cssText = `
  position:fixed;bottom:60px;right:20px;width:300px;height:380px;
  background:rgba(3,5,15,0.97);border:1px solid rgba(0,191,255,0.25);
  border-radius:14px;z-index:500;display:none;flex-direction:column;
  box-shadow:0 20px 60px rgba(0,0,0,0.6),0 0 30px rgba(0,191,255,0.06);
  font-family:'Consolas',monospace;overflow:hidden`
notesEl.innerHTML = `
  <div style="padding:10px 14px;border-bottom:1px solid rgba(0,191,255,0.1);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
    <span style="font-size:11px;color:var(--accent);letter-spacing:2px">📝 NOTAS RÁPIDAS</span>
    <div style="display:flex;gap:6px">
      <button id="note-add" style="background:rgba(0,191,255,0.1);border:1px solid rgba(0,191,255,0.2);color:var(--accent);cursor:pointer;padding:3px 8px;border-radius:5px;font-size:11px;font-family:inherit">+</button>
      <button id="note-close" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px">✕</button>
    </div>
  </div>
  <div id="notes-list" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px"></div>`
document.body.appendChild(notesEl)

let editingNoteId = null

function renderNotes() {
  const notes = loadNotes()
  const list  = document.getElementById('notes-list')
  list.innerHTML = ''

  if(!notes.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:11px;padding:24px">Nenhuma nota.<br>Ctrl+N para criar.</div>'
    return
  }

  notes.forEach((note, i) => {
    const el = document.createElement('div')
    el.style.cssText = `background:rgba(${note.color||'0,191,255'},0.06);border:1px solid rgba(${note.color||'0,191,255'},0.15);border-radius:8px;padding:8px;position:relative`
    el.innerHTML = `
      <div style="font-size:9px;color:var(--text-dim);margin-bottom:4px">${new Date(note.time).toLocaleString('pt-BR')}</div>
      <div class="note-text" style="font-size:11px;color:var(--text);line-height:1.5;white-space:pre-wrap;word-break:break-word;cursor:pointer;min-height:20px">${note.text||'Clique para editar...'}</div>
      <div style="position:absolute;top:6px;right:6px;display:flex;gap:3px">
        <button onclick="deleteNote(${i})" style="background:none;border:none;color:rgba(255,68,85,0.5);cursor:pointer;font-size:10px;padding:2px">✕</button>
      </div>`
    el.querySelector('.note-text').onclick = () => startEditNote(i, el)
    list.appendChild(el)
  })
}

function startEditNote(i, el) {
  const notes = loadNotes()
  const note  = notes[i]
  const textEl = el.querySelector('.note-text')
  const textarea = document.createElement('textarea')
  textarea.value = note.text || ''
  textarea.style.cssText = `width:100%;min-height:60px;background:none;border:none;color:var(--text);font-family:var(--font);font-size:11px;line-height:1.5;resize:vertical;outline:none`
  textEl.replaceWith(textarea)
  textarea.focus()
  textarea.onblur = () => {
    note.text = textarea.value; notes[i] = note; saveNotes(notes); renderNotes()
  }
  textarea.onkeydown = e => { if(e.key==='Escape') textarea.blur() }
}

function deleteNote(i) {
  const notes = loadNotes(); notes.splice(i,1); saveNotes(notes); renderNotes()
}

document.getElementById('note-add').onclick = () => {
  const notes = loadNotes()
  notes.unshift({id:Date.now(),text:'',time:Date.now(),color:'0,191,255'})
  saveNotes(notes); renderNotes()
  const textarea = document.querySelector('#notes-list div:first-child textarea')
  if(textarea) textarea.focus()
}
document.getElementById('note-close').onclick = () => toggleNotes()

function toggleNotes() {
  notesVisible = !notesVisible
  notesEl.style.display = notesVisible ? 'flex' : 'none'
  if(notesVisible) renderNotes()
}

document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.key === 'n' && !e.shiftKey) { e.preventDefault(); toggleNotes() }
})

// ═══════════════════════════════════════════════════════════════════
// 6. NETWORK SPEED MONITOR na status bar
// ═══════════════════════════════════════════════════════════════════
let _lastNetSent = 0, _lastNetRecv = 0, _lastNetTime = Date.now()

async function refreshNetworkSpeed() {
  try {
    const d = await fetch(`${BACKEND}/system`).then(r=>r.json())
    const now  = Date.now()
    const dt   = (now - _lastNetTime) / 1000
    const sent = d.net_sent * 1024 * 1024  // MB -> bytes
    const recv = d.net_recv * 1024 * 1024

    if(_lastNetSent > 0 && dt > 0) {
      const up   = Math.max(0, (sent - _lastNetSent) / dt)
      const down = Math.max(0, (recv - _lastNetRecv) / dt)
      const fmt  = b => b > 1048576 ? `${(b/1048576).toFixed(1)}MB/s` : b > 1024 ? `${(b/1024).toFixed(0)}KB/s` : `${b.toFixed(0)}B/s`
      let netEl = document.getElementById('sb-network')
      if(!netEl) {
        const statusbar = document.getElementById('jarvis-statusbar')
        if(statusbar) {
          netEl = document.createElement('div')
          netEl.id = 'sb-network'
          netEl.className = 'statusbar-item'
          netEl.style.cssText = 'font-size:9px;color:var(--text-dim);letter-spacing:0.5px'
          const spacer = document.getElementById('statusbar-spacer')
          if(spacer) statusbar.insertBefore(netEl, spacer)
        }
      }
      if(netEl) netEl.textContent = `↑${fmt(up)} ↓${fmt(down)}`
    }
    _lastNetSent = sent; _lastNetRecv = recv; _lastNetTime = now
  } catch(e) {}
}
setInterval(refreshNetworkSpeed, 3000)

// ═══════════════════════════════════════════════════════════════════
// 7. KEYBOARD SHORTCUTS CHEATSHEET (F1)
// ═══════════════════════════════════════════════════════════════════
function showShortcutsModal() {
  if(document.getElementById('shortcuts-modal')) {
    document.getElementById('shortcuts-modal').remove(); return
  }
  const modal = document.createElement('div')
  modal.id = 'shortcuts-modal'
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)'
  const shortcuts = [
    ['Navegação','Ctrl+T','Nova aba'],['','Ctrl+W','Fechar aba'],['','Ctrl+L','Foco na URL'],['','Ctrl+Tab','Próxima aba'],
    ['','Ctrl+R','Recarregar'],['','Ctrl+← →','Voltar/Avançar'],['','Alt+Home','Página inicial'],
    ['Browser','Ctrl+D','Favoritar'],['','Ctrl+H','Histórico'],['','Ctrl+I','Aba incógnita'],['','Ctrl+K','Command Palette'],
    ['','Ctrl+F','Busca na página (ou modo foco)'],['','Ctrl+N','Notas rápidas'],['','Ctrl++ -','Zoom + -'],['','Ctrl+0','Zoom padrão'],
    ['JARVIS','Ctrl+Shift+A','Side AI'],['','F1','Este menu'],
    ['Atalhos visuais','Mouse btn2 ←','Voltar'],['','Mouse btn2 →','Avançar'],['','Mouse btn2 ↑','Nova aba'],['','Mouse btn2 ↓','Fechar aba'],
  ]
  let rows = ''; let section = ''
  shortcuts.forEach(([sec,key,desc]) => {
    if(sec && sec !== section) {
      section = sec
      rows += `<tr><td colspan="2" style="padding:10px 0 4px;font-size:9px;color:var(--accent);letter-spacing:2px;text-transform:uppercase">${sec}</td></tr>`
    }
    rows += `<tr><td style="padding:3px 12px 3px 0"><kbd style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);padding:2px 7px;border-radius:4px;font-size:11px;color:var(--text);font-family:inherit;white-space:nowrap">${key}</kbd></td><td style="font-size:11px;color:var(--text-dim)">${desc}</td></tr>`
  })
  modal.innerHTML = `
    <div style="background:rgba(3,5,15,0.98);border:1px solid rgba(0,191,255,0.2);border-radius:16px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 0 60px rgba(0,191,255,0.1)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:13px;font-weight:bold;color:var(--accent);letter-spacing:3px">⌨ ATALHOS</div>
        <button onclick="document.getElementById('shortcuts-modal').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px">✕</button>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <div style="margin-top:16px;font-size:10px;color:var(--text-dim);text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">Pressione F1 ou clique fora para fechar</div>
    </div>`
  modal.onclick = e => { if(e.target === modal) modal.remove() }
  document.body.appendChild(modal)
}
document.addEventListener('keydown', e => { if(e.key === 'F1') { e.preventDefault(); showShortcutsModal() } })

// ═══════════════════════════════════════════════════════════════════
// 8. PIP-BOY NOTIFICATIONS — notificações estilo HUD
// ═══════════════════════════════════════════════════════════════════
const pipBoyContainer = document.createElement('div')
pipBoyContainer.id = 'pipboy-container'
pipBoyContainer.style.cssText = 'position:fixed;bottom:40px;left:72px;z-index:800;display:flex;flex-direction:column-reverse;gap:6px;pointer-events:none'
document.body.appendChild(pipBoyContainer)

function pipBoyNotify(title, body, color='var(--accent)') {
  const el = document.createElement('div')
  el.style.cssText = `
    background:rgba(3,5,15,0.96);
    border-left:3px solid ${color};
    border:1px solid rgba(255,255,255,0.08);
    border-left:3px solid ${color};
    border-radius:0 10px 10px 0;
    padding:8px 14px;
    min-width:220px;max-width:320px;
    pointer-events:auto;
    opacity:0;
    transform:translateX(-20px);
    transition:all 0.25s cubic-bezier(0.4,0,0.2,1);
    cursor:pointer`
  el.innerHTML = `
    <div style="font-size:11px;font-weight:bold;color:${color};font-family:'Consolas',monospace;letter-spacing:1px">${title}</div>
    ${body ? `<div style="font-size:10px;color:var(--text-dim);margin-top:2px;line-height:1.4">${body}</div>` : ''}`
  el.onclick = () => el.remove()
  pipBoyContainer.appendChild(el)

  // Animate in
  requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateX(0)' })

  // Auto remove
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translateX(-20px)'
    setTimeout(() => el.remove(), 300)
  }, 4500)
}

// Expõe globalmente
window.pipBoyNotify = pipBoyNotify

// ═══════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════
;(function init() {
  addDownloadSidebarBtn()
  // Reconstrói painel spotify na próxima inicialização
  const btnSpotify = document.getElementById('btn-spotify')
  if(btnSpotify) {
    btnSpotify.onclick = () => {
      if(typeof togglePanel==='function') togglePanel('panel-spotify')
      initSpotify()
    }
  }

  // Dica de F1 no primeiro uso
  setTimeout(() => {
    pipBoyNotify('⌨ Pressione F1', 'Para ver todos os atalhos do LUMINA', 'var(--accent)')
  }, 4000)

  console.log('[LUMINA] renderer_additions.js carregado ✓')
})()
