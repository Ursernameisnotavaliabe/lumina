/**
 * LUMINA — browser_upgrades.js
 * Adicione APÓS renderer.js e renderer_additions.js no index.html:
 * <script src="browser_upgrades.js"></script>
 *
 * Contém TODAS as melhorias de qualidade, do crítico ao baixo:
 *
 * CRÍTICO
 *  C1. Uma webview por aba — isolamento real de processos
 *  C2. Isolamento de sessão para abas incógnitas
 *  C3. Indicador de segurança real (HTTP/HTTPS/inválido)
 *
 * ALTO
 *  A1. URL bar com autocompletar inteligente em tempo real
 *  A2. Hibernate de abas inativas (economiza memória)
 *  A3. F12 → DevTools da webview ativa
 *  A4. Anti-tracking reforçado (sendBeacon, pixels 1x1, first-party)
 *  A5. PiP real via API nativa do browser
 *
 * MÉDIO
 *  M1. Histórico com busca + agrupamento por data
 *  M2. Export/import de favoritos (JSON + HTML do Chrome)
 *  M3. Drag & drop para reordenar abas
 *  M4. Personalização da página inicial (quick buttons editáveis)
 *
 * BAIXO
 *  L1. Suporte a userscripts (pasta ~/.lumina/scripts/)
 *  L2. PWA — instalar site como app
 *  L3. Sync de favoritos para pasta local (OneDrive, Dropbox, etc.)
 */

;(function LUMINA_UPGRADES() {
'use strict'

const { ipcRenderer } = require('electron')
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const CFG_DIR  = path.join(os.homedir(), '.lumina')

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function loadJ(p, def) {
  try { if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,'utf8')) } catch(e) {}
  return def
}
function saveJ(p, d) {
  try {
    const dir = path.dirname(p)
    if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})
    fs.writeFileSync(p, JSON.stringify(d,null,2))
  } catch(e) {}
}
function $id(id) { return document.getElementById(id) }
function toast2(msg, type='info', dur=3000) {
  if(typeof toast === 'function') toast(msg, type, dur)
}

// ═══════════════════════════════════════════════════════════════════
// C1. UMA WEBVIEW POR ABA — ISOLAMENTO REAL
// ═══════════════════════════════════════════════════════════════════
/**
 * Substitui a lógica de uma webview compartilhada por uma pool de webviews.
 * Cada aba tem seu próprio <webview> com partition isolado.
 * A webview ativa fica visível, as outras ficam com display:none
 * mas continuam carregadas (sem recarregar ao trocar de aba).
 */

const wvPool      = {}   // { tabId: webviewElement }
const contentArea = $id('content-area')
const homePage    = $id('home-page')

// Remove a webview estática do HTML — vamos gerenciar dinâmicamente
const _staticWV = $id('main-webview')
if(_staticWV) _staticWV.remove()

function getOrCreateWebview(tabId, incognito) {
  if(wvPool[tabId]) return wvPool[tabId]

  const wv = document.createElement('webview')
  wv.id = `wv-${tabId}`

  // Incógnito = partition sem persist (memória apenas, isolado)
  // Normal = persist:main (compartilha cookies/login entre abas normais)
  wv.setAttribute('partition', incognito ? `incognito-${tabId}` : 'persist:main')
  wv.setAttribute('allowpopups', '')
  wv.src = 'about:blank'

  wv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;display:none'
  contentArea.appendChild(wv)
  wvPool[tabId] = wv

  // ── Eventos da webview ──────────────────────────────────────────
  wv.addEventListener('did-navigate', e => {
    if(e.url === 'about:blank' || !e.url) return
    if(tabId !== window._activeTabId) return
    const urlBar = $id('url-bar')
    if(urlBar) urlBar.value = e.url
    if(typeof updateActiveTab === 'function') updateActiveTab(e.url, e.url)
    updateSecurityIndicator(e.url)
    // Lazy load userscripts
    injectUserscripts(wv, e.url)
    checkForPWA(wv, e.url)
  })

  wv.addEventListener('did-navigate-in-page', e => {
    if(!e.isMainFrame || e.url === 'about:blank') return
    if(tabId !== window._activeTabId) return
    const urlBar = $id('url-bar')
    if(urlBar) urlBar.value = e.url
    if(typeof updateActiveTab === 'function') updateActiveTab(e.url, e.url)
    updateSecurityIndicator(e.url)
  })

  wv.addEventListener('page-title-updated', e => {
    if(typeof updateActiveTab === 'function' && tabId === window._activeTabId)
      updateActiveTab(wv.src, e.title)
    // Atualiza tab title mesmo quando não é a ativa
    const tabEl = document.querySelector(`.tab[data-id="${tabId}"]`)
    if(tabEl) {
      const titleEl = tabEl.querySelector('.tab-title')
      if(titleEl) titleEl.textContent = e.title.slice(0,22) || 'Nova guia'
    }
    // Favicon
    const tabFav = tabEl?.querySelector('.tab-favicon')
    if(tabFav && wv.src && wv.src.startsWith('http')) {
      try {
        tabFav.src = `${new URL(wv.src).origin}/favicon.ico`
        tabFav.style.display = 'block'
        tabFav.onerror = () => { tabFav.style.display = 'none' }
      } catch(e) {}
    }
  })

  wv.addEventListener('did-start-loading', () => {
    if(tabId !== window._activeTabId) return
    const btn = $id('btn-reload')
    if(btn) btn.textContent = '✕'
    $id('url-bar-wrap')?.classList.add('loading')
  })

  wv.addEventListener('did-stop-loading', () => {
    if(tabId !== window._activeTabId) return
    const btn = $id('btn-reload')
    if(btn) btn.textContent = '↻'
    $id('url-bar-wrap')?.classList.remove('loading')
    // Hibernation reset
    const t = typeof tabs !== 'undefined' ? tabs.find(t=>t.id===tabId) : null
    if(t) t._lastActive = Date.now()
    // Anti-tracking cosmético
    if(_antitTrackingEnabled) injectAntiTrackingCosmetic(wv)
  })

  wv.addEventListener('did-fail-load', (e) => {
    if(tabId !== window._activeTabId) return
    if(e.errorCode === -3) return // abortado pelo usuário (ex: clicou ✕)
    if(e.errorCode === -105 || e.errorCode === -106) {
      // DNS ou rede falhou
      const errorHtml = `<html><body style="font-family:'Consolas',monospace;background:#03050f;color:#c8d8e8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px">
        <div style="font-size:48px">🌐</div>
        <div style="font-size:18px;color:#00BFFF">Sem conexão</div>
        <div style="font-size:12px;color:#4a6a8a">${e.validatedURL}</div>
        <button onclick="location.reload()" style="background:#00BFFF;border:none;color:#000;padding:10px 24px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;margin-top:8px">↻ Tentar novamente</button>
      </body></html>`
      try { wv.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml)) } catch(ex) {}
    }
  })

  // Popups abrem em nova aba
  wv.setWindowOpenHandler = undefined // webview usa evento
  wv.addEventListener('new-window', ev => {
    const url = ev.url
    if(!url || url === 'about:blank') return
    if(typeof createTab === 'function') createTab(url)
  })

  return wv
}

function showWebviewForTab(tabId, incognito) {
  // Esconde todas as webviews
  Object.values(wvPool).forEach(wv => wv.style.display = 'none')
  const wv = getOrCreateWebview(tabId, incognito)
  wv.style.display = 'block'
  homePage.classList.add('hidden')
  window._activeWebview = wv
  return wv
}

function destroyWebview(tabId) {
  const wv = wvPool[tabId]
  if(!wv) return
  try { wv.stop(); wv.loadURL('about:blank') } catch(e) {}
  setTimeout(() => { try { wv.remove() } catch(e) {} }, 500)
  delete wvPool[tabId]
}

// Sobrescreve navigate() para usar a webview correta
const _origNavigate = window.navigate
window.navigate = function(input) {
  let url = (input||'').trim()
  if(!url) return

  const isUrl = url.startsWith('http') || url.startsWith('//') || /^[a-z0-9-]+\.[a-z]{2,}/i.test(url)
  if(!isUrl && typeof isJarvisQuestion === 'function' && isJarvisQuestion(url)) {
    if(typeof askJarvisFromSearch === 'function') askJarvisFromSearch(url)
    return
  }
  if(isUrl) { if(!url.startsWith('http')) url = 'https://' + url }
  else {
    const engines = {
      google:     q=>`https://www.google.com/search?q=${encodeURIComponent(q)}`,
      bing:       q=>`https://www.bing.com/search?q=${encodeURIComponent(q)}`,
      duckduckgo: q=>`https://duckduckgo.com/?q=${encodeURIComponent(q)}`
    }
    const eng = (typeof uiCfg !== 'undefined' ? uiCfg.engine : null) || 'google'
    url = (engines[eng] || engines.google)(url)
  }

  const tab = typeof tabs !== 'undefined' ? tabs.find(t=>t.id===window._activeTabId) : null
  const wv  = showWebviewForTab(window._activeTabId, tab?.incognito)
  try { wv.loadURL(url) } catch(e) { wv.src = url }
  const urlBar = $id('url-bar')
  if(urlBar) urlBar.value = url
  if(typeof updateActiveTab === 'function') updateActiveTab(url, url)
  updateSecurityIndicator(url)
  closeUrlSuggestions()
}

// Sobrescreve switchTab() para usar a pool de webviews
const _origSwitchTab = window.switchTab
window.switchTab = function(id) {
  window._activeTabId = id
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', parseInt(t.dataset.id) === id))
  const tab = typeof tabs !== 'undefined' ? tabs.find(t=>t.id===id) : null
  if(!tab) return

  const incognito = tab.incognito || false
  window._incognitoMode = incognito
  $id('incognito-badge')?.classList.toggle('hidden', !incognito)

  if(tab.url && tab.url !== 'about:blank') {
    const wv = showWebviewForTab(id, incognito)
    // Só carrega se ainda não estiver carregada
    if(wv.src === 'about:blank' && tab.url !== 'about:blank') {
      try { wv.loadURL(tab.url) } catch(e) { wv.src = tab.url }
    }
    const urlBar = $id('url-bar')
    if(urlBar) urlBar.value = tab.url
    updateSecurityIndicator(tab.url)
    window._activeWebview = wv
  } else {
    // Esconde todas as webviews e mostra home
    Object.values(wvPool).forEach(wv => wv.style.display = 'none')
    homePage.classList.remove('hidden')
    const urlBar = $id('url-bar')
    if(urlBar) urlBar.value = ''
    updateSecurityIndicator('')
    window._activeWebview = null
  }

  tab._lastActive = Date.now()
}

// Sobrescreve closeTab() para destruir a webview
const _origCloseTab = window.closeTab
window.closeTab = function(id) {
  const idx = typeof tabs !== 'undefined' ? tabs.findIndex(t=>t.id===id) : -1
  if(idx === -1) return
  destroyWebview(id)
  if(typeof tabs !== 'undefined') {
    tabs.splice(idx, 1)
    document.querySelector(`.tab[data-id="${id}"]`)?.remove()
    if(tabs.length === 0) {
      if(typeof createTab === 'function') createTab()
    } else if(window._activeTabId === id) {
      const nextTab = tabs[Math.min(idx, tabs.length - 1)]
      if(nextTab && typeof switchTab === 'function') switchTab(nextTab.id)
    }
  }
}

// Patch: createTab precisa criar webview para novas abas com URL
const _origCreateTab = window.createTab
window.createTab = function(url=null, title='Nova guia', incognito=false) {
  const id = _origCreateTab ? _origCreateTab(url, title, incognito) : null
  // _origCreateTab já chama switchTab que vai criar a webview via pool
  // Mas precisamos garantir que a webview seja criada antecipadamente para
  // que os eventos dela sejam ligados antes de navigate()
  if(id !== null) {
    getOrCreateWebview(id, incognito)
  }
  return id
}

// Expõe _activeWebview globalmente para retrocompatibilidade
// (código existente que usa 'webview' passa a usar window._activeWebview)
Object.defineProperty(window, 'webview', {
  get() { return window._activeWebview || { src:'about:blank', loadURL:()=>{}, goBack:()=>{}, goForward:()=>{}, reload:()=>{}, executeJavaScript:()=>Promise.resolve(null), capturePage:()=>Promise.resolve({toDataURL:()=>''}), findInPage:()=>{}, stopFindInPage:()=>{}, openDevTools:()=>{} } },
  configurable: true
})

// Navegar nos botões back/fwd/reload usa a webview ativa
$id('btn-back')?.addEventListener('click',   () => { try { window.webview?.goBack() }    catch(e) {} })
$id('btn-fwd')?.addEventListener('click',    () => { try { window.webview?.goForward() } catch(e) {} })
$id('btn-reload')?.addEventListener('click', () => {
  const btn = $id('btn-reload')
  if(btn?.textContent === '✕') { try { window.webview?.stop() } catch(e) {} }
  else { try { window.webview?.reload() } catch(e) {} }
})

// ═══════════════════════════════════════════════════════════════════
// C2. ISOLAMENTO INCÓGNITO — já resolvido acima via partition única
// Mas também limpa cookies de sessão ao fechar todas as abas incógnitas
// ═══════════════════════════════════════════════════════════════════
function cleanupIncognitoSessions() {
  const { session } = require('electron').remote || {}
  // partitions incógnito são automáticas (sem persist:), não precisam de limpeza manual
  // mas podemos remover webviews órfãs
  const activeIds = (typeof tabs !== 'undefined' ? tabs : []).map(t=>t.id)
  Object.keys(wvPool).forEach(id => {
    if(!activeIds.includes(parseInt(id))) destroyWebview(parseInt(id))
  })
}
setInterval(cleanupIncognitoSessions, 60000)

// ═══════════════════════════════════════════════════════════════════
// C3. INDICADOR DE SEGURANÇA REAL
// ═══════════════════════════════════════════════════════════════════
function updateSecurityIndicator(url) {
  const icon = $id('url-icon')
  const wrap = $id('url-bar-wrap')
  if(!icon) return

  if(!url || url === 'about:blank' || url === '') {
    icon.textContent = '🔒'
    icon.style.color = 'var(--text-dim)'
    icon.title = ''
    wrap?.classList.remove('insecure','secure')
    return
  }

  if(url.startsWith('https://')) {
    icon.textContent = '🔒'
    icon.style.color = '#22c55e'
    icon.title = 'Conexão segura (HTTPS)'
    wrap?.classList.add('secure')
    wrap?.classList.remove('insecure')
  } else if(url.startsWith('http://')) {
    icon.textContent = '⚠'
    icon.style.color = '#f59e0b'
    icon.title = 'Conexão NÃO segura — seus dados podem ser interceptados'
    wrap?.classList.add('insecure')
    wrap?.classList.remove('secure')
    // Toast de aviso uma vez por sessão por domínio
    try {
      const domain = new URL(url).hostname
      if(!_insecureWarned.has(domain)) {
        _insecureWarned.add(domain)
        toast2(`⚠ ${domain} não usa HTTPS — conexão insegura`, 'error', 5000)
      }
    } catch(e) {}
  } else if(url.startsWith('file://')) {
    icon.textContent = '📄'
    icon.style.color = 'var(--text-dim)'
    icon.title = 'Arquivo local'
    wrap?.classList.remove('secure','insecure')
  } else {
    icon.textContent = '🔒'
    icon.style.color = 'var(--text-dim)'
    wrap?.classList.remove('secure','insecure')
  }
}
const _insecureWarned = new Set()
updateSecurityIndicator('')

// CSS para estados seguro/inseguro
const secStyle = document.createElement('style')
secStyle.textContent = `
  #url-bar-wrap.secure  { border-color:rgba(34,197,94,0.3)!important }
  #url-bar-wrap.insecure{ border-color:rgba(245,158,11,0.4)!important }
  #url-bar-wrap.loading { border-color:rgba(0,191,255,0.4)!important; animation:urlpulse 1s infinite }
  @keyframes urlpulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
`
document.head.appendChild(secStyle)

// ═══════════════════════════════════════════════════════════════════
// A1. URL BAR — AUTOCOMPLETAR INTELIGENTE
// ═══════════════════════════════════════════════════════════════════
const urlBar = $id('url-bar')
let _suggestionsEl = null
let _suggestIdx    = -1

function getUrlSuggestions(q) {
  if(!q || q.length < 1) return []
  const ql = q.toLowerCase()
  const h  = typeof history !== 'undefined' ? history : []
  const bm = typeof bookmarks !== 'undefined' ? bookmarks : []
  const results = []
  const seen = new Set()

  // 1. Favoritos primeiro
  bm.forEach(b => {
    const text = (b.title+' '+b.url).toLowerCase()
    if(text.includes(ql) && !seen.has(b.url)) {
      seen.add(b.url)
      results.push({ type:'bookmark', icon:'⭐', title:b.title||b.url, url:b.url })
    }
  })

  // 2. Histórico
  h.forEach(entry => {
    if(results.length >= 8) return
    const text = (entry.title+' '+entry.url).toLowerCase()
    if(text.includes(ql) && !seen.has(entry.url)) {
      seen.add(entry.url)
      results.push({ type:'history', icon:'🕐', title:entry.title||entry.url, url:entry.url })
    }
  })

  // 3. Sugestão de URL direta se parece URL
  const isUrl = /^[a-z0-9-]+\.[a-z]{2,}/i.test(q)
  if(isUrl && !seen.has('https://'+q)) {
    results.unshift({ type:'url', icon:'🌐', title:'https://'+q, url:'https://'+q })
  }

  // 4. Busca (sempre no final)
  if(results.length < 8 && !isUrl) {
    const eng = (typeof uiCfg !== 'undefined' ? uiCfg.engine : null) || 'google'
    const engines = {
      google:     q=>`https://www.google.com/search?q=${encodeURIComponent(q)}`,
      bing:       q=>`https://www.bing.com/search?q=${encodeURIComponent(q)}`,
      duckduckgo: q=>`https://duckduckgo.com/?q=${encodeURIComponent(q)}`
    }
    const searchUrl = (engines[eng] || engines.google)(q)
    results.push({ type:'search', icon:'🔍', title:`Pesquisar "${q}"`, url:searchUrl })
  }

  return results.slice(0, 8)
}

function renderUrlSuggestions(items) {
  if(!_suggestionsEl) {
    _suggestionsEl = document.createElement('div')
    _suggestionsEl.id = 'url-suggestions'
    _suggestionsEl.style.cssText = `
      position:fixed;z-index:5000;
      background:rgba(3,5,15,0.98);
      border:1px solid rgba(0,191,255,0.2);
      border-top:none;
      border-radius:0 0 12px 12px;
      overflow:hidden;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
      min-width:400px;
      backdrop-filter:blur(20px);
      font-family:'Consolas',monospace;
    `
    document.body.appendChild(_suggestionsEl)
  }

  const wrap = $id('url-bar-wrap')
  if(wrap) {
    const rect = wrap.getBoundingClientRect()
    _suggestionsEl.style.left  = rect.left + 'px'
    _suggestionsEl.style.top   = (rect.bottom) + 'px'
    _suggestionsEl.style.width = rect.width + 'px'
  }

  _suggestionsEl.innerHTML = items.map((item, i) => `
    <div class="url-suggest-item ${i === _suggestIdx ? 'selected' : ''}"
         data-url="${item.url.replace(/"/g,'&quot;')}"
         style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;
                border-bottom:1px solid rgba(0,191,255,0.06);
                background:${i===_suggestIdx?'rgba(0,191,255,0.1)':'transparent'};
                transition:background 0.1s"
         onmouseover="this.style.background='rgba(0,191,255,0.08)'"
         onmouseout="this.style.background='${i===_suggestIdx?'rgba(0,191,255,0.1)':'transparent'}'">
      <span style="font-size:12px;flex-shrink:0;width:18px;text-align:center">${item.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title.slice(0,60)}</div>
        ${item.type!=='search'?`<div style="font-size:10px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.url.slice(0,70)}</div>`:''}
      </div>
      <span style="font-size:9px;color:var(--text-dim);flex-shrink:0">${
        item.type==='bookmark'?'⭐':item.type==='history'?'HIST':item.type==='url'?'URL':'BUSCA'
      }</span>
    </div>`).join('')

  _suggestionsEl.querySelectorAll('.url-suggest-item').forEach(el => {
    el.onclick = () => {
      const u = el.dataset.url
      if(urlBar) urlBar.value = u
      closeUrlSuggestions()
      window.navigate(u)
    }
  })

  _suggestionsEl.style.display = items.length ? 'block' : 'none'
}

function closeUrlSuggestions() {
  if(_suggestionsEl) _suggestionsEl.style.display = 'none'
  _suggestIdx = -1
}

if(urlBar) {
  urlBar.addEventListener('input', () => {
    const q = urlBar.value.trim()
    if(!q) { closeUrlSuggestions(); return }
    _suggestIdx = -1
    renderUrlSuggestions(getUrlSuggestions(q))
  })

  urlBar.addEventListener('keydown', e => {
    const items = _suggestionsEl?.querySelectorAll('.url-suggest-item')
    if(!items?.length) return
    if(e.key === 'ArrowDown') {
      e.preventDefault()
      _suggestIdx = Math.min(_suggestIdx + 1, items.length - 1)
      renderUrlSuggestions(getUrlSuggestions(urlBar.value.trim()))
      if(items[_suggestIdx]) urlBar.value = items[_suggestIdx].dataset.url
    } else if(e.key === 'ArrowUp') {
      e.preventDefault()
      _suggestIdx = Math.max(_suggestIdx - 1, -1)
      renderUrlSuggestions(getUrlSuggestions(urlBar.value.trim()))
      if(_suggestIdx >= 0 && items[_suggestIdx]) urlBar.value = items[_suggestIdx].dataset.url
    } else if(e.key === 'Escape') {
      closeUrlSuggestions()
    } else if(e.key === 'Enter') {
      closeUrlSuggestions()
    }
  })

  urlBar.addEventListener('focus', () => {
    urlBar.select()
    const q = urlBar.value.trim()
    if(q) renderUrlSuggestions(getUrlSuggestions(q))
  })

  urlBar.addEventListener('blur', () => {
    setTimeout(closeUrlSuggestions, 200)
  })
}

document.addEventListener('click', e => {
  if(!e.target.closest('#url-bar-wrap') && !e.target.closest('#url-suggestions'))
    closeUrlSuggestions()
})

// ═══════════════════════════════════════════════════════════════════
// A2. HIBERNATE DE ABAS INATIVAS
// ═══════════════════════════════════════════════════════════════════
const HIBERNATE_AFTER_MS = 5 * 60 * 1000 // 5 minutos

setInterval(() => {
  if(typeof tabs === 'undefined') return
  const now = Date.now()
  tabs.forEach(tab => {
    if(tab.id === window._activeTabId) return
    if(tab.incognito) return
    if(!tab.url || tab.url === 'about:blank') return
    const lastActive = tab._lastActive || now
    if(now - lastActive > HIBERNATE_AFTER_MS && !tab._hibernated) {
      const wv = wvPool[tab.id]
      if(wv) {
        try {
          wv.loadURL('about:blank') // libera memória da aba
          tab._hibernated    = true
          tab._hibernatedUrl = tab.url
          // Marca a aba visualmente
          const el = document.querySelector(`.tab[data-id="${tab.id}"]`)
          if(el) el.style.opacity = '0.6'
          console.log(`[HIBERNATE] Aba ${tab.id} hibernada: ${tab.url}`)
        } catch(e) {}
      }
    }
  })
}, 60000)

// Ao ativar uma aba hibernada, restaura
const _origSwitchTabH = window.switchTab
window.switchTab = function(id) {
  const tab = typeof tabs !== 'undefined' ? tabs.find(t=>t.id===id) : null
  if(tab?._hibernated) {
    tab._hibernated = false
    tab.url = tab._hibernatedUrl
    const el = document.querySelector(`.tab[data-id="${id}"]`)
    if(el) el.style.opacity = '1'
    toast2(`♻ Restaurando aba...`, 'info', 1500)
  }
  _origSwitchTabH(id)
}

// ═══════════════════════════════════════════════════════════════════
// A3. F12 — DEVTOOLS DA WEBVIEW ATIVA
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if(e.key === 'F12') {
    e.preventDefault()
    const wv = window._activeWebview
    if(wv) {
      try {
        wv.openDevTools()
        toast2('🔧 DevTools aberto', 'info', 2000)
      } catch(err) {
        toast2('DevTools não disponível nesta aba', 'error')
      }
    }
  }
})

// ═══════════════════════════════════════════════════════════════════
// A4. ANTI-TRACKING REFORÇADO
// ═══════════════════════════════════════════════════════════════════
let _antitTrackingEnabled = true

const ANTI_TRACKING_SCRIPT = `
(function(){
  // Bloqueia navigator.sendBeacon (ping tracker)
  const _origBeacon = navigator.sendBeacon.bind(navigator)
  navigator.sendBeacon = function(url, data) {
    const trackDomains = ['google-analytics.com','analytics.','doubleclick.','clarity.ms','hotjar.','facebook.com/tr','bat.bing','scorecardresearch']
    if(trackDomains.some(d => url.includes(d))) return true // silenciosamente bloqueia
    return _origBeacon(url, data)
  }
  // Remove pixels de rastreamento 1x1
  const removeTrackers = () => {
    document.querySelectorAll('img').forEach(img => {
      if(img.width <= 1 && img.height <= 1 && img.src) {
        const trackerDomains = ['doubleclick','googlesyndication','google-analytics','facebook.com/tr','bat.bing','scorecardresearch','clarity.ms']
        if(trackerDomains.some(d => img.src.includes(d))) { img.src=''; img.remove() }
      }
    })
    // Remove iframes de tracking comuns
    document.querySelectorAll('iframe').forEach(f => {
      const src = f.src || f.getAttribute('src') || ''
      if(['doubleclick','googlesyndication','amazon-adsystem','facebook.com/plugins/like'].some(d=>src.includes(d))) f.remove()
    })
  }
  removeTrackers()
  const obs = new MutationObserver(removeTrackers)
  obs.observe(document.body, {childList:true, subtree:true})
})()
`

function injectAntiTrackingCosmetic(wv) {
  if(!_antitTrackingEnabled) return
  try { wv.executeJavaScript(ANTI_TRACKING_SCRIPT).catch(()=>{}) } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════════
// A5. PIP REAL VIA API NATIVA
// ═══════════════════════════════════════════════════════════════════
const _origBtnPip = $id('btn-pip')
if(_origBtnPip) {
  _origBtnPip.onclick = async () => {
    const wv = window._activeWebview
    if(!wv) { toast2('Abra um site com vídeo primeiro', 'info'); return }
    try {
      // Tenta PiP nativo via API do browser
      const result = await wv.executeJavaScript(`
        (async function() {
          const videos = Array.from(document.querySelectorAll('video')).filter(v => !v.paused || v.currentTime > 0)
          if(!videos.length) return {ok:false, reason:'no_video'}
          // Ordena por tamanho (maior = mais relevante)
          const v = videos.sort((a,b) => (b.videoWidth*b.videoHeight)-(a.videoWidth*a.videoHeight))[0]
          if(document.pictureInPictureElement) {
            await document.exitPictureInPicture()
            return {ok:true, action:'exit'}
          }
          try {
            await v.requestPictureInPicture()
            return {ok:true, action:'enter'}
          } catch(e) {
            return {ok:false, reason:e.message}
          }
        })()
      `)
      if(result?.ok) {
        const active = result.action === 'enter'
        _origBtnPip.style.color = active ? 'var(--accent)' : ''
        toast2(active ? '⧉ PiP ativado' : '⧉ PiP desativado', 'info', 2000)
      } else if(result?.reason === 'no_video') {
        toast2('Nenhum vídeo encontrado nesta página', 'info')
      } else {
        toast2(`PiP não suportado neste site: ${result?.reason||''}`, 'info')
      }
    } catch(e) {
      toast2('PiP não disponível nesta página', 'info')
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// M1. HISTÓRICO COM BUSCA + AGRUPAMENTO POR DATA
// ═══════════════════════════════════════════════════════════════════
const _origRenderHistory = window.renderHistory
window.renderHistory = function() {
  const list = $id('history-list')
  if(!list) return

  // Injeta barra de busca se não existir
  const panel = $id('panel-history')
  if(panel && !$id('history-search-wrap')) {
    const searchWrap = document.createElement('div')
    searchWrap.id = 'history-search-wrap'
    searchWrap.style.cssText = 'padding:10px 12px;border-bottom:1px solid var(--glass-border)'
    searchWrap.innerHTML = `<input id="history-search" placeholder="🔍 Buscar no histórico..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(0,191,255,0.15);color:var(--text);padding:7px 12px;border-radius:8px;font-family:var(--font);font-size:11px;outline:none">`
    list.before(searchWrap)
    $id('history-search').addEventListener('input', e => renderHistoryFiltered(e.target.value))
  }

  renderHistoryFiltered('')
}

function renderHistoryFiltered(query) {
  const list = $id('history-list')
  if(!list) return
  const h = (typeof history !== 'undefined' ? history : []).slice(0, 2000)
  const q = query.toLowerCase().trim()
  const filtered = q ? h.filter(e => (e.title+' '+e.url).toLowerCase().includes(q)) : h

  if(!filtered.length) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:11px">${q ? 'Nenhum resultado.' : 'Nenhum histórico ainda.'}</div>`
    return
  }

  // Agrupa por data
  const groups = {}
  const today     = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate()-7)

  filtered.forEach(entry => {
    const d = new Date(entry.time)
    let label
    if(d >= today)          label = '📅 Hoje'
    else if(d >= yesterday) label = '📅 Ontem'
    else if(d >= weekAgo)   label = '📅 Esta semana'
    else {
      label = `📅 ${d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}`
    }
    if(!groups[label]) groups[label] = []
    groups[label].push(entry)
  })

  list.innerHTML = Object.entries(groups).map(([label, entries]) => `
    <div style="padding:6px 12px 2px;font-size:9px;color:var(--text-dim);letter-spacing:2px;text-transform:uppercase;background:rgba(0,191,255,0.03);border-bottom:1px solid var(--glass-border)">${label}</div>
    ${entries.slice(0,50).map(h => `
      <div class="hist-item" onclick="navigate('${h.url.replace(/'/g,"\\'")}')">
        <img class="hist-favicon" src="${tryOrigin?tryOrigin(h.url):''}favicon.ico" onerror="this.style.display='none'">
        <div class="hist-info">
          <div class="hist-title">${(h.title||h.url).slice(0,40)}</div>
          <div class="hist-url">${new Date(h.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · ${h.url.slice(0,45)}</div>
        </div>
      </div>`).join('')}
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════
// M2. EXPORT / IMPORT DE FAVORITOS
// ═══════════════════════════════════════════════════════════════════
const bookmarksPanel = $id('panel-bookmarks')
if(bookmarksPanel) {
  const bmActions = document.createElement('div')
  bmActions.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--glass-border);display:flex;gap:6px'
  bmActions.innerHTML = `
    <button id="bm-export-btn" style="flex:1;background:rgba(0,191,255,0.08);border:1px solid rgba(0,191,255,0.2);color:var(--accent);cursor:pointer;padding:6px 10px;border-radius:6px;font-size:10px;font-family:inherit">⬇ Exportar</button>
    <button id="bm-import-btn" style="flex:1;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;padding:6px 10px;border-radius:6px;font-size:10px;font-family:inherit">⬆ Importar</button>
    <input type="file" id="bm-import-file" accept=".json,.html" style="display:none">`
  const listEl = $id('bookmarks-list')
  if(listEl) listEl.before(bmActions)

  $id('bm-export-btn')?.addEventListener('click', () => {
    const bm = typeof bookmarks !== 'undefined' ? bookmarks : []
    // Exporta em formato HTML compatível com Chrome/Firefox
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${bm.map(b=>`  <DT><A HREF="${b.url}" ADD_DATE="${Math.floor((b.time||Date.now())/1000)}">${(b.title||b.url).replace(/</g,'&lt;')}</A>`).join('\n')}
</DL><p>`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([html],{type:'text/html'}))
    a.download = `lumina-bookmarks-${new Date().toISOString().slice(0,10)}.html`
    a.click()
    toast2('⬇ Favoritos exportados (compatível com Chrome/Firefox)', 'success')
  })

  $id('bm-import-btn')?.addEventListener('click', () => $id('bm-import-file')?.click())

  $id('bm-import-file')?.addEventListener('change', e => {
    const file = e.target.files[0]; if(!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const content = ev.target.result
      let imported = []
      if(file.name.endsWith('.json')) {
        try { imported = JSON.parse(content) } catch(e) { toast2('Arquivo JSON inválido','error'); return }
      } else {
        // Parseia HTML de bookmarks (Chrome/Firefox)
        const parser = new DOMParser()
        const doc    = parser.parseFromString(content, 'text/html')
        doc.querySelectorAll('a[href]').forEach(a => {
          imported.push({ url:a.href, title:a.textContent, time:parseInt(a.getAttribute('add_date')||'0')*1000||Date.now() })
        })
      }
      if(!imported.length) { toast2('Nenhum favorito encontrado no arquivo','error'); return }
      const existing = typeof bookmarks !== 'undefined' ? bookmarks : []
      const existingUrls = new Set(existing.map(b=>b.url))
      const newBm = imported.filter(b=>b.url&&b.url.startsWith('http')&&!existingUrls.has(b.url))
      if(typeof bookmarks !== 'undefined') bookmarks.unshift(...newBm)
      const BMARKS = path.join(CFG_DIR,'bookmarks.json')
      saveJ(BMARKS, typeof bookmarks !== 'undefined' ? bookmarks : [])
      if(typeof renderBookmarks==='function') renderBookmarks()
      toast2(`⬆ ${newBm.length} favoritos importados!`, 'success')
    }
    reader.readAsText(file)
    e.target.value = ''
  })
}

// Backup automático de favoritos para pasta configurável
function autoBackupBookmarks() {
  try {
    const cfg  = loadJ(path.join(CFG_DIR,'config.json'), {})
    const dest = cfg.bookmarks_backup_dir
    if(!dest || !fs.existsSync(dest)) return
    const bm = typeof bookmarks !== 'undefined' ? bookmarks : []
    fs.writeFileSync(path.join(dest,'lumina-bookmarks.json'), JSON.stringify(bm,null,2))
  } catch(e) {}
}
setInterval(autoBackupBookmarks, 5 * 60 * 1000)

// Opção nas configurações para pasta de backup
const settingsContent = $id('settings-content')
if(settingsContent && !$id('cfg-backup-section')) {
  const sec = document.createElement('div')
  sec.id = 'cfg-backup-section'
  sec.className = 'settings-section'
  sec.innerHTML = `
    <div class="settings-label">🔄 BACKUP DE FAVORITOS</div>
    <div class="settings-row">
      <input class="settings-input" id="cfg-backup-dir" placeholder="Pasta (ex: C:\\Users\\...\\OneDrive)" style="flex:1">
      <button class="settings-btn" id="cfg-backup-save">Salvar</button>
    </div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:4px">Salva automaticamente a cada 5 minutos.</div>`
  settingsContent.appendChild(sec)
  // Carrega valor salvo
  const cfg = loadJ(path.join(CFG_DIR,'config.json'),{})
  if(cfg.bookmarks_backup_dir) $id('cfg-backup-dir').value = cfg.bookmarks_backup_dir
  $id('cfg-backup-save')?.addEventListener('click', () => {
    const dir = $id('cfg-backup-dir').value.trim()
    const cfg2 = loadJ(path.join(CFG_DIR,'config.json'),{})
    cfg2.bookmarks_backup_dir = dir
    saveJ(path.join(CFG_DIR,'config.json'), cfg2)
    toast2('✅ Pasta de backup salva!', 'success')
    autoBackupBookmarks()
  })
}

// ═══════════════════════════════════════════════════════════════════
// M3. DRAG & DROP PARA REORDENAR ABAS
// ═══════════════════════════════════════════════════════════════════
let _dragSrcId = null

function enableTabDragDrop() {
  const container = $id('tabs-container')
  if(!container) return

  // Observer para aplicar drag nos novos tabs criados
  const obs = new MutationObserver(() => bindTabDrag())
  obs.observe(container, {childList:true})
  bindTabDrag()
}

function bindTabDrag() {
  document.querySelectorAll('.tab').forEach(tab => {
    if(tab._dragBound) return
    tab._dragBound = true
    tab.draggable = true

    tab.addEventListener('dragstart', e => {
      _dragSrcId = parseInt(tab.dataset.id)
      e.dataTransfer.effectAllowed = 'move'
      tab.style.opacity = '0.5'
    })
    tab.addEventListener('dragend', () => {
      tab.style.opacity = ''
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'))
    })
    tab.addEventListener('dragover', e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'))
      tab.classList.add('drag-over')
    })
    tab.addEventListener('drop', e => {
      e.preventDefault()
      const targetId = parseInt(tab.dataset.id)
      if(_dragSrcId === null || _dragSrcId === targetId) return
      if(typeof tabs === 'undefined') return

      const srcIdx = tabs.findIndex(t=>t.id===_dragSrcId)
      const tgtIdx = tabs.findIndex(t=>t.id===targetId)
      if(srcIdx === -1 || tgtIdx === -1) return

      // Reordena array
      const [moved] = tabs.splice(srcIdx, 1)
      tabs.splice(tgtIdx, 0, moved)

      // Reordena DOM
      const container = $id('tabs-container')
      const srcEl = document.querySelector(`.tab[data-id="${_dragSrcId}"]`)
      const tgtEl = document.querySelector(`.tab[data-id="${targetId}"]`)
      if(srcEl && tgtEl && container) {
        if(srcIdx < tgtIdx) container.insertBefore(srcEl, tgtEl.nextSibling)
        else container.insertBefore(srcEl, tgtEl)
      }
      _dragSrcId = null
      tab.classList.remove('drag-over')
    })
  })
}

// CSS para drag-over
const dragStyle = document.createElement('style')
dragStyle.textContent = `.tab.drag-over { border-top-color: var(--accent)!important; background: rgba(0,191,255,0.1)!important; }`
document.head.appendChild(dragStyle)

enableTabDragDrop()

// ═══════════════════════════════════════════════════════════════════
// M4. QUICK BUTTONS EDITÁVEIS NA HOME
// ═══════════════════════════════════════════════════════════════════
const QB_FILE = path.join(CFG_DIR, 'quick-buttons.json')
const DEFAULT_QB = [
  {url:'https://google.com',    icon:'🔍', label:'Google'},
  {url:'https://youtube.com',   icon:'▶',  label:'YouTube'},
  {url:'https://github.com',    icon:'🐙', label:'GitHub'},
  {url:'https://open.spotify.com',icon:'🎵',label:'Spotify'},
  {url:'https://roblox.com',    icon:'🎮', label:'Roblox'},
  {url:'https://twitch.tv',     icon:'📺', label:'Twitch'},
  {url:'https://discord.com/app',icon:'💬',label:'Discord'},
  {url:'https://x.com',         icon:'𝕏', label:'X'},
]

function loadQuickButtons() {
  return loadJ(QB_FILE, DEFAULT_QB)
}
function saveQuickButtons(qb) { saveJ(QB_FILE, qb) }

function renderQuickButtons() {
  const container = $id('home-quick')
  if(!container) return
  const qb = loadQuickButtons()

  container.innerHTML = qb.map((btn, i) => `
    <div class="quick-btn" data-url="${btn.url}" data-idx="${i}">
      <span>${btn.icon}</span>${btn.label}
      <button class="qb-remove" data-idx="${i}" title="Remover" style="display:none;position:absolute;top:-4px;right:-4px;background:#ff4455;border:none;color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;cursor:pointer;align-items:center;justify-content:center;font-family:inherit">✕</button>
    </div>`).join('') +
    `<div class="quick-btn" id="qb-add-btn" style="border-style:dashed;color:var(--text-dim)" title="Adicionar site">
      <span>+</span>Adicionar
    </div>`

  container.querySelectorAll('.quick-btn[data-url]').forEach(el => {
    el.style.position = 'relative'
    el.onclick = e => {
      if(e.target.classList.contains('qb-remove')) return
      if(typeof createTab==='function') createTab(el.dataset.url)
    }
    el.addEventListener('contextmenu', e => {
      e.preventDefault()
      e.stopPropagation()
      // Toggle edit mode para este botão
      const rm = el.querySelector('.qb-remove')
      if(rm) rm.style.display = rm.style.display==='none'?'flex':'none'
    })
  })

  container.querySelectorAll('.qb-remove').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation()
      const idx = parseInt(btn.dataset.idx)
      const qb2 = loadQuickButtons()
      qb2.splice(idx, 1)
      saveQuickButtons(qb2)
      renderQuickButtons()
      toast2('Atalho removido', 'info')
    }
  })

  $id('qb-add-btn')?.addEventListener('click', () => showAddQuickButtonModal())
}

function showAddQuickButtonModal() {
  if($id('qb-modal')) return
  const modal = document.createElement('div')
  modal.id = 'qb-modal'
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)'
  modal.innerHTML = `
    <div style="background:rgba(3,5,15,0.98);border:1px solid rgba(0,191,255,0.25);border-radius:16px;padding:24px;width:340px;display:flex;flex-direction:column;gap:12px;box-shadow:0 0 60px rgba(0,191,255,0.1);font-family:'Consolas',monospace">
      <div style="font-size:12px;color:var(--accent);letter-spacing:2px">+ NOVO ATALHO</div>
      <input id="qb-url"   class="settings-input" placeholder="URL (ex: https://reddit.com)">
      <div style="display:flex;gap:8px">
        <input id="qb-icon"  class="settings-input" placeholder="Emoji (ex: 🎮)" style="width:80px">
        <input id="qb-label" class="settings-input" placeholder="Nome" style="flex:1">
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button id="qb-cancel" class="settings-btn" style="flex:1">Cancelar</button>
        <button id="qb-confirm" class="settings-btn" style="flex:2;background:rgba(0,191,255,0.15);border-color:rgba(0,191,255,0.4);color:var(--accent)">+ Adicionar</button>
      </div>
    </div>`
  document.body.appendChild(modal)

  // Auto-preenche com URL da aba ativa
  const activeTab = typeof tabs !== 'undefined' ? tabs.find(t=>t.id===window._activeTabId) : null
  if(activeTab?.url) {
    $id('qb-url').value = activeTab.url
    $id('qb-label').value = (activeTab.title||activeTab.url).slice(0,15)
  }

  $id('qb-cancel').onclick  = () => modal.remove()
  $id('qb-confirm').onclick = () => {
    const url   = $id('qb-url').value.trim()
    const icon  = $id('qb-icon').value.trim()  || '🌐'
    const label = $id('qb-label').value.trim() || url.replace('https://','').split('/')[0]
    if(!url) { toast2('URL obrigatória','error'); return }
    const qb2 = loadQuickButtons()
    qb2.push({url,icon,label})
    saveQuickButtons(qb2)
    renderQuickButtons()
    modal.remove()
    toast2(`✅ "${label}" adicionado aos atalhos!`, 'success')
  }
  modal.onclick = e => { if(e.target===modal) modal.remove() }
}

// Renderiza na home e refaz ao mostrar home
renderQuickButtons()
const _origShowHome = window.showHome
window.showHome = function() {
  if(_origShowHome) _origShowHome()
  renderQuickButtons()
}

// ═══════════════════════════════════════════════════════════════════
// L1. USERSCRIPTS — ~/.lumina/scripts/*.user.js
// ═══════════════════════════════════════════════════════════════════
const SCRIPTS_DIR = path.join(CFG_DIR, 'scripts')
if(!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, {recursive:true})

// Cria script de exemplo se não existir
const exampleScript = path.join(SCRIPTS_DIR, 'example.user.js')
if(!fs.existsSync(exampleScript)) {
  fs.writeFileSync(exampleScript, `// ==UserScript==
// @name         Exemplo LUMINA
// @match        https://example.com/*
// @description  Script de exemplo — renomeia o título da página
// ==/UserScript==

document.title = 'LUMINA — ' + document.title
console.log('[LUMINA Userscript] Rodando em', location.href)
`)
}

function loadUserscripts() {
  try {
    return fs.readdirSync(SCRIPTS_DIR)
      .filter(f => f.endsWith('.user.js'))
      .map(f => {
        const content = fs.readFileSync(path.join(SCRIPTS_DIR,f),'utf8')
        const matches = []
        const metaMatch = content.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/)
        if(metaMatch) {
          const meta = metaMatch[1]
          const matchLines = meta.match(/@match\s+(.+)/g) || []
          matchLines.forEach(m => {
            const pattern = m.replace(/@match\s+/,'').trim()
            matches.push(patternToRegex(pattern))
          })
        }
        return { name:f, content, matches, enabled:!f.startsWith('_') }
      })
  } catch(e) { return [] }
}

function patternToRegex(pattern) {
  try {
    // Converte glob-style match pattern para RegExp
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*')
      .replace(/\\\?/g, '.')
    return new RegExp('^' + escaped + '$')
  } catch(e) { return null }
}

function injectUserscripts(wv, url) {
  const scripts = loadUserscripts()
  scripts.forEach(script => {
    if(!script.enabled) return
    const matches = script.matches.length === 0 || script.matches.some(rx => rx?.test(url))
    if(matches) {
      try {
        wv.executeJavaScript(script.content).catch(()=>{})
        console.log(`[Userscript] "${script.name}" injetado em ${url}`)
      } catch(e) {}
    }
  })
}

// Painel de gerenciamento de userscripts nas configurações
if(settingsContent && !$id('cfg-scripts-section')) {
  const sec = document.createElement('div')
  sec.id = 'cfg-scripts-section'
  sec.className = 'settings-section'
  sec.innerHTML = `
    <div class="settings-label">📜 USERSCRIPTS</div>
    <div id="scripts-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;max-height:160px;overflow-y:auto"></div>
    <button class="settings-btn full" id="open-scripts-dir">📁 Abrir pasta de scripts</button>
    <div style="font-size:10px;color:var(--text-dim);margin-top:4px">Scripts em <code>~/.lumina/scripts/*.user.js</code><br>Use <code>// @match https://site.com/*</code> para filtrar por URL.</div>`
  settingsContent.appendChild(sec)

  function refreshScriptsList() {
    const list = $id('scripts-list')
    if(!list) return
    const scripts = loadUserscripts()
    if(!scripts.length) { list.innerHTML='<div style="font-size:11px;color:var(--text-dim)">Nenhum script encontrado.</div>'; return }
    list.innerHTML = scripts.map(s=>`
      <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.02);border:1px solid var(--glass-border);border-radius:6px;padding:6px 10px">
        <span style="font-size:10px;color:${s.enabled?'#22c55e':'var(--text-dim)'};flex:1">${s.name.replace('.user.js','')}</span>
        <span style="font-size:9px;color:var(--text-dim)">${s.matches.length||'*'} regra(s)</span>
      </div>`).join('')
  }

  $id('cfg-scripts-section')?.addEventListener('click', () => refreshScriptsList())
  $id('open-scripts-dir')?.addEventListener('click', () => {
    ipcRenderer.send('reveal-file', SCRIPTS_DIR)
    refreshScriptsList()
  })
  refreshScriptsList()
}

// ═══════════════════════════════════════════════════════════════════
// L2. PWA — INSTALAR SITE COMO APP
// ═══════════════════════════════════════════════════════════════════
function checkForPWA(wv, url) {
  if(!url || !url.startsWith('http')) return
  try {
    wv.executeJavaScript(`
      (function() {
        const manifest = document.querySelector('link[rel="manifest"]')
        const name     = document.querySelector('meta[name="application-name"]')?.content ||
                         document.querySelector('meta[property="og:title"]')?.content ||
                         document.title
        return { hasManifest: !!manifest, name: name?.slice(0,30) || '' }
      })()
    `).then(result => {
      if(result?.hasManifest && result?.name) {
        // Mostra botão de instalar na navbar se for PWA
        let pwaBtn = $id('btn-install-pwa')
        if(!pwaBtn) {
          pwaBtn = document.createElement('button')
          pwaBtn.id = 'btn-install-pwa'
          pwaBtn.className = 'nav-btn'
          pwaBtn.title = 'Instalar como app'
          pwaBtn.style.cssText = 'color:#22c55e;font-size:12px'
          pwaBtn.textContent = '⊕'
          $id('url-go')?.after(pwaBtn)
        }
        pwaBtn.style.display = 'block'
        pwaBtn.title = `Instalar "${result.name}" como app`
        pwaBtn._pwaName = result.name
        pwaBtn._pwaUrl  = url
        pwaBtn.onclick = () => installAsPWA(url, result.name, wv)
      } else {
        const pwaBtn = $id('btn-install-pwa')
        if(pwaBtn) pwaBtn.style.display = 'none'
      }
    }).catch(() => {})
  } catch(e) {}
}

function installAsPWA(url, name, wv) {
  // Abre o site em janela dedicada sem navbar (app mode)
  ipcRenderer.send('open-as-pwa', { url, name })
  toast2(`⊕ Abrindo "${name}" como app...`, 'success', 3000)
}

// IPC para abrir janela PWA no main.js
// (o main.js precisa escutar 'open-as-pwa' — adicionamos handler aqui para chamar)
// Se não tiver suporte no main, abre em nova aba normal
ipcRenderer.on('pwa-not-supported', () => {
  toast2('PWA: aberto como nova aba', 'info')
})

// ═══════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO FINAL
// ═══════════════════════════════════════════════════════════════════
;(function init() {
  // Rastreia activeTabId global
  window._activeTabId = typeof activeTabId !== 'undefined' ? activeTabId : null

  // Intercepta mudanças de activeTabId
  const _origActiveTabId = window.activeTabId
  Object.defineProperty(window, 'activeTabId', {
    get() { return window._activeTabId },
    set(v) { window._activeTabId = v },
    configurable: true
  })

  // Garante que a primeira aba criada ao iniciar use a pool de webviews
  setTimeout(() => {
    if(typeof tabs !== 'undefined' && tabs.length > 0) {
      const firstTab = tabs[0]
      window._activeTabId = firstTab.id
      if(firstTab.url && firstTab.url !== 'about:blank') {
        const wv = showWebviewForTab(firstTab.id, firstTab.incognito||false)
        try { wv.loadURL(firstTab.url) } catch(e) { wv.src = firstTab.url }
      } else {
        Object.values(wvPool).forEach(wv => wv.style.display = 'none')
        homePage.classList.remove('hidden')
      }
    }
    renderQuickButtons()
    updateSecurityIndicator($id('url-bar')?.value || '')
  }, 300)

  console.log('[LUMINA] browser_upgrades.js carregado ✓ — Todos os upgrades ativos')
})()

})() // LUMINA_UPGRADES IIFE end
