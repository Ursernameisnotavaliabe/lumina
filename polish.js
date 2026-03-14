/**
 * LUMINA — polish.js
 * Adicione no index.html após os outros scripts:
 * <script src="browser_upgrades.js"></script>
 * <script src="polish.js"></script>  ← último
 *
 * Contém:
 *  P1. Tab preview (thumbnail ao hover)
 *  P2. Ctrl+Shift+T — reabrir aba fechada
 *  P3. Mute por aba (ícone na aba, clique muta)
 *  P4. URL bar — domínio em destaque
 *  P5. Ctrl+F melhorado (Enter = próxima, highlight, contador)
 *  P6. Transição suave entre abas (fade 150ms)
 *  P7. Onboarding da Groq API Key
 *  P8. Página de erro: jogo Iron Man
 */

;(function LUMINA_POLISH() {
'use strict'

const { ipcRenderer } = require('electron')
const path = require('path'), os = require('os'), fs = require('fs')
const CFG_DIR = path.join(os.homedir(), '.lumina')

function $id(id){ return document.getElementById(id) }
function loadJ(p,d){ try{ if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,'utf8')) }catch(e){} return d }
function saveJ(p,d){ try{ const dir=path.dirname(p); if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(p,JSON.stringify(d,null,2)) }catch(e){} }
function t2(m,t='info',d=3000){ if(typeof toast==='function') toast(m,t,d) }

// ─────────────────────────────────────────────────────────────────────────────
// P1. TAB PREVIEW — thumbnail ao hover
// ─────────────────────────────────────────────────────────────────────────────
const previewEl = document.createElement('div')
previewEl.id = 'tab-preview'
previewEl.style.cssText = `
  position:fixed; z-index:9000; pointer-events:none;
  background:rgba(3,5,15,0.98); border:1px solid rgba(0,191,255,0.25);
  border-radius:12px; padding:8px; box-shadow:0 12px 40px rgba(0,0,0,0.7);
  display:none; flex-direction:column; gap:6px; font-family:'Consolas',monospace;
  min-width:200px; max-width:280px;
  transition:opacity 0.15s;`
previewEl.innerHTML = `
  <canvas id="tab-preview-canvas" width="264" height="148" style="border-radius:6px;background:#0a0f1e;display:block"></canvas>
  <div id="tab-preview-title" style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
  <div id="tab-preview-url"   style="font-size:9px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>`
document.body.appendChild(previewEl)

let _previewTimer = null
let _previewVisible = false

function showTabPreview(tabEl, tab) {
  clearTimeout(_previewTimer)
  _previewTimer = setTimeout(async () => {
    const rect = tabEl.getBoundingClientRect()
    previewEl.style.display = 'flex'
    previewEl.style.opacity = '0'
    previewEl.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px'
    previewEl.style.top  = (rect.bottom + 6) + 'px'
    $id('tab-preview-title').textContent = tab.title || 'Nova guia'
    $id('tab-preview-url').textContent   = tab.url   || ''
    _previewVisible = true

    // Captura thumbnail da webview se for a aba ativa
    const wv = window._wvPool ? window._wvPool[tab.id] : null
    const canvas = $id('tab-preview-canvas')
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0,0,264,148)

    if(wv && tab.url && tab.url !== 'about:blank') {
      try {
        const img = await wv.capturePage({ x:0,y:0,width:800,height:450 })
        const dataUrl = img.toDataURL()
        const image = new Image()
        image.onload = () => {
          ctx.drawImage(image,0,0,264,148)
          previewEl.style.opacity = '1'
        }
        image.src = dataUrl
        return
      } catch(e) {}
    }
    // Fallback: mostra favicon e título centrado
    ctx.fillStyle = 'rgba(0,191,255,0.04)'
    ctx.fillRect(0,0,264,148)
    ctx.font = '32px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(tab.incognito ? '🕵' : '🌐', 132, 80)
    previewEl.style.opacity = '1'
  }, 400)
}

function hideTabPreview() {
  clearTimeout(_previewTimer)
  previewEl.style.display = 'none'
  _previewVisible = false
}

// Injeta eventos nos tabs (Observer para novos tabs)
function bindPreviewToTabs() {
  document.querySelectorAll('.tab').forEach(el => {
    if(el._previewBound) return
    el._previewBound = true
    el.addEventListener('mouseenter', () => {
      const id  = parseInt(el.dataset.id)
      const tab = typeof tabs !== 'undefined' ? tabs.find(t=>t.id===id) : null
      if(tab) showTabPreview(el, tab)
    })
    el.addEventListener('mouseleave', hideTabPreview)
  })
}

new MutationObserver(bindPreviewToTabs)
  .observe($id('tabs-container') || document.body, {childList:true, subtree:true})
bindPreviewToTabs()

// ─────────────────────────────────────────────────────────────────────────────
// P2. CTRL+SHIFT+T — reabrir última aba fechada
// ─────────────────────────────────────────────────────────────────────────────
const _closedTabs = []   // máx 15

// Intercepta closeTab para guardar na lista
const _prevClose = window.closeTab
window.closeTab = function(id) {
  const tab = typeof tabs !== 'undefined' ? tabs.find(t=>t.id===id) : null
  if(tab?.url && tab.url !== 'about:blank') {
    _closedTabs.push({ url:tab.url, title:tab.title||tab.url, time:Date.now() })
    if(_closedTabs.length > 15) _closedTabs.shift()
  }
  if(_prevClose) _prevClose(id)
}

document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.shiftKey && e.key === 'T') {
    e.preventDefault()
    const last = _closedTabs.pop()
    if(last && typeof createTab === 'function') {
      createTab(last.url, last.title)
      t2(`↩ "${(last.title||last.url).slice(0,30)}" restaurada`, 'success', 2000)
    } else {
      t2('Nenhuma aba fechada recentemente', 'info')
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// P3. MUTE POR ABA
// ─────────────────────────────────────────────────────────────────────────────
const _mutedTabs = new Set()

function updateTabAudioIcon(tabId, hasAudio, muted) {
  const el = document.querySelector(`.tab[data-id="${tabId}"]`)
  if(!el) return
  let audioBtn = el.querySelector('.tab-audio')
  if(!audioBtn) {
    audioBtn = document.createElement('button')
    audioBtn.className = 'tab-audio'
    audioBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:10px;padding:0 2px;
      color:rgba(0,191,255,0.7);transition:all 0.15s;flex-shrink:0;line-height:1`
    audioBtn.onclick = e => { e.stopPropagation(); toggleTabMute(tabId) }
    // Insere antes do tab-close
    el.querySelector('.tab-close')?.before(audioBtn)
  }
  if(hasAudio) {
    audioBtn.style.display = 'inline'
    audioBtn.textContent   = muted ? '🔇' : '🔊'
    audioBtn.title         = muted ? 'Clique para desmutar' : 'Clique para mutar'
    audioBtn.style.color   = muted ? 'rgba(255,68,85,0.7)' : 'rgba(0,191,255,0.7)'
  } else {
    audioBtn.style.display = 'none'
  }
}

function toggleTabMute(tabId) {
  const wv = window._wvPool?.[tabId]
  if(!wv) return
  const muted = _mutedTabs.has(tabId)
  if(muted) _mutedTabs.delete(tabId)
  else      _mutedTabs.add(tabId)
  try { wv.setAudioMuted(!muted) } catch(e) {}
  updateTabAudioIcon(tabId, true, !muted)
  t2(!muted ? '🔇 Aba mutada' : '🔊 Aba desmutada', 'info', 1500)
}

// Detecta audio nas webviews
function monitorTabAudio() {
  if(typeof tabs === 'undefined') return
  tabs.forEach(tab => {
    const wv = window._wvPool?.[tab.id]
    if(!wv) return
    wv.addEventListener('media-started-playing', () => {
      updateTabAudioIcon(tab.id, true, _mutedTabs.has(tab.id))
    })
    wv.addEventListener('media-paused', () => {
      setTimeout(() => updateTabAudioIcon(tab.id, false, false), 1000)
    })
  })
}
setTimeout(monitorTabAudio, 2000)
// Remonita quando novas tabs são criadas
new MutationObserver(monitorTabAudio)
  .observe($id('tabs-container') || document.body, {childList:true})

// ─────────────────────────────────────────────────────────────────────────────
// P4. URL BAR — domínio em destaque (domínio branco, path cinza)
// ─────────────────────────────────────────────────────────────────────────────
const urlBar = $id('url-bar')
const urlOverlay = document.createElement('div')
urlOverlay.id = 'url-display-overlay'
urlOverlay.style.cssText = `
  position:absolute; inset:0; display:flex; align-items:center;
  padding:0 14px; pointer-events:none; font-family:'Consolas',monospace;
  font-size:12px; overflow:hidden; white-space:nowrap;
  left:34px; /* deixa espaço pro ícone de segurança */`
$id('url-bar-wrap')?.appendChild(urlOverlay)

// O overlay precisa de position:relative no wrap
$id('url-bar-wrap') && ($id('url-bar-wrap').style.position = 'relative')

function updateUrlDisplay(url) {
  if(!urlBar || !urlOverlay) return
  if(document.activeElement === urlBar) {
    urlOverlay.style.display = 'none'
    urlBar.style.color = 'var(--text)'
    return
  }
  if(!url || url === 'about:blank' || url === '') {
    urlOverlay.style.display = 'none'
    urlBar.style.color = 'var(--text)'
    return
  }
  try {
    const u = new URL(url)
    const proto  = u.protocol + '//'
    const domain = u.hostname + (u.port ? ':'+u.port : '')
    const rest   = u.pathname + u.search + u.hash
    urlOverlay.innerHTML =
      `<span style="color:var(--text-dim);font-size:11px">${proto}</span>` +
      `<span style="color:var(--text);font-weight:bold">${domain}</span>` +
      `<span style="color:var(--text-dim)">${rest.slice(0,60)}</span>`
    urlOverlay.style.display = 'flex'
    urlBar.style.color = 'transparent'  // esconde o texto nativo
    urlBar.style.caretColor = 'var(--accent)'
  } catch(e) {
    urlOverlay.style.display = 'none'
    urlBar.style.color = 'var(--text)'
  }
}

if(urlBar) {
  urlBar.addEventListener('focus',  () => { urlOverlay.style.display='none'; urlBar.style.color='var(--text)' })
  urlBar.addEventListener('blur',   () => updateUrlDisplay(urlBar.value))
  urlBar.addEventListener('input',  () => { if(document.activeElement===urlBar){ urlOverlay.style.display='none' } })
}

// Atualiza ao navegar
const _origUpdateActiveTab = window.updateActiveTab
window.updateActiveTab = function(url, title) {
  if(_origUpdateActiveTab) _origUpdateActiveTab(url, title)
  if(document.activeElement !== urlBar) updateUrlDisplay(url || '')
}

updateUrlDisplay(urlBar?.value || '')

// ─────────────────────────────────────────────────────────────────────────────
// P5. CTRL+F MELHORADO
// ─────────────────────────────────────────────────────────────────────────────
let _findBar = null
let _findQuery = ''
let _findResults = 0

function showFindBarPro() {
  if(_findBar) { _findBar.querySelector('#fp-input')?.focus(); return }
  _findBar = document.createElement('div')
  _findBar.id = 'find-bar-pro'
  _findBar.style.cssText = `
    position:fixed; top:calc(var(--titlebar-h) + var(--navbar-h) + 8px); right:16px;
    z-index:5500; background:rgba(3,5,15,0.98);
    backdrop-filter:blur(20px); border:1px solid rgba(0,191,255,0.25);
    border-radius:12px; padding:8px 12px;
    display:flex; align-items:center; gap:8px;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);
    font-family:'Consolas',monospace;`
  _findBar.innerHTML = `
    <input id="fp-input" placeholder="Buscar na página..." style="background:none;border:none;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:200px">
    <span id="fp-count" style="font-size:10px;color:var(--text-dim);white-space:nowrap;min-width:40px"></span>
    <button id="fp-prev" style="background:none;border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;width:26px;height:26px;border-radius:6px;font-size:12px">▲</button>
    <button id="fp-next" style="background:none;border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;width:26px;height:26px;border-radius:6px;font-size:12px">▼</button>
    <button id="fp-cs"   style="background:none;border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;height:26px;padding:0 8px;border-radius:6px;font-size:9px" title="Case sensitive">Aa</button>
    <button id="fp-close" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:0 4px">✕</button>`
  document.body.appendChild(_findBar)

  const input  = $id('fp-input')
  const count  = $id('fp-count')
  let caseSensitive = false

  const doFind = (forward=true) => {
    const q = input.value
    if(!q) { window.webview?.stopFindInPage?.('clearSelection'); count.textContent=''; return }
    _findQuery = q
    window.webview?.findInPage?.(q, { forward, matchCase:caseSensitive, findNext: q === _findQuery })
  }

  input.addEventListener('input', () => { _findQuery = ''; doFind(true) })
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter')  { e.preventDefault(); doFind(!e.shiftKey) }
    if(e.key === 'Escape') { closeFindBarPro() }
  })
  $id('fp-prev').onclick  = () => doFind(false)
  $id('fp-next').onclick  = () => doFind(true)
  $id('fp-cs').onclick    = () => { caseSensitive=!caseSensitive; $id('fp-cs').style.color=caseSensitive?'var(--accent)':'var(--text-dim)'; doFind(true) }
  $id('fp-close').onclick = () => closeFindBarPro()

  // Resultado do find
  const wv = window._activeWebview
  if(wv) {
    wv.addEventListener('found-in-page', ev => {
      const n = ev.result
      count.textContent = n.matches ? `${n.activeMatchOrdinal}/${n.matches}` : 'Não encontrado'
      count.style.color = n.matches ? 'var(--accent)' : '#ff4455'
    })
  }

  input.focus()
}

function closeFindBarPro() {
  window.webview?.stopFindInPage?.('clearSelection')
  _findBar?.remove()
  _findBar = null
}

// Sobrescreve Ctrl+F
document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.key === 'f' && !(typeof focusMode !== 'undefined' && focusMode)) {
    e.preventDefault()
    e.stopImmediatePropagation()
    if(_findBar) closeFindBarPro()
    else showFindBarPro()
  }
  if(e.key === 'Escape' && _findBar) closeFindBarPro()
}, true)  // capture = true para sobrescrever handler do renderer.js

// ─────────────────────────────────────────────────────────────────────────────
// P6. TRANSIÇÃO SUAVE ENTRE ABAS (fade 150ms)
// ─────────────────────────────────────────────────────────────────────────────
const fadeStyle = document.createElement('style')
fadeStyle.textContent = `
  webview { transition: opacity 0.15s ease !important; }
  webview.tab-switching { opacity: 0 !important; }
  #home-page { transition: opacity 0.15s ease; }
  #home-page.tab-switching { opacity: 0; }
`
document.head.appendChild(fadeStyle)

const _prevSwitchTab = window.switchTab
window.switchTab = function(id) {
  // Fade out
  const allWv = document.querySelectorAll('webview')
  allWv.forEach(w => w.classList.add('tab-switching'))
  $id('home-page')?.classList.add('tab-switching')

  setTimeout(() => {
    if(_prevSwitchTab) _prevSwitchTab(id)
    // Fade in
    setTimeout(() => {
      allWv.forEach(w => w.classList.remove('tab-switching'))
      $id('home-page')?.classList.remove('tab-switching')
    }, 20)
  }, 80)
}

// ─────────────────────────────────────────────────────────────────────────────
// P7. ONBOARDING GROQ API KEY
// ─────────────────────────────────────────────────────────────────────────────
function checkGroqOnboarding() {
  const cfg = loadJ(path.join(CFG_DIR,'config.json'), {})
  if(cfg.groq_key || cfg.onboarding_done) return

  const modal = document.createElement('div')
  modal.id = 'groq-onboarding'
  modal.style.cssText = `
    position:fixed; inset:0; z-index:10000;
    background:rgba(0,0,0,0.8); backdrop-filter:blur(12px);
    display:flex; align-items:center; justify-content:center;`
  modal.innerHTML = `
    <div style="background:rgba(3,5,15,0.99);border:1px solid rgba(0,191,255,0.3);border-radius:20px;
                padding:32px 28px;width:440px;font-family:'Consolas',monospace;
                box-shadow:0 0 80px rgba(0,191,255,0.12);">

      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;margin-bottom:4px">
        <span style="color:#00BFFF;text-shadow:0 0 20px #00BFFF">L</span><span style="color:#1a3a5a">UMINA</span>
      </div>
      <div style="font-size:9px;color:#1a3a5a;letter-spacing:4px;text-align:center;margin-bottom:24px">INTELLIGENT BROWSER</div>

      <div style="font-size:13px;color:var(--text);margin-bottom:8px;font-weight:bold">⚡ Configure o JARVIS</div>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.7;margin-bottom:20px">
        O JARVIS usa a API da Groq para responder — é <strong style="color:var(--text)">gratuita</strong> e não precisa de cartão.<br>
        Leva menos de 2 minutos para configurar.
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;background:rgba(0,191,255,0.04);border:1px solid rgba(0,191,255,0.1);border-radius:10px;padding:10px 14px">
          <span style="font-size:18px;flex-shrink:0">1️⃣</span>
          <div>
            <div style="font-size:11px;color:var(--text)">Acesse console.groq.com</div>
            <div style="font-size:10px;color:var(--text-dim)">Crie uma conta gratuita</div>
          </div>
          <button id="ob-open-groq" style="background:rgba(0,191,255,0.12);border:1px solid rgba(0,191,255,0.3);color:var(--accent);cursor:pointer;padding:5px 10px;border-radius:6px;font-size:10px;font-family:inherit;margin-left:auto;white-space:nowrap">Abrir →</button>
        </div>
        <div style="display:flex;align-items:center;gap:10px;background:rgba(0,191,255,0.04);border:1px solid rgba(0,191,255,0.1);border-radius:10px;padding:10px 14px">
          <span style="font-size:18px;flex-shrink:0">2️⃣</span>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text);margin-bottom:6px">Cole sua API Key aqui</div>
            <input id="ob-apikey" type="password" placeholder="gsk_..." style="width:100%;background:rgba(10,21,37,0.8);border:1px solid rgba(0,191,255,0.2);color:var(--text);font-family:var(--font);font-size:12px;padding:8px 12px;border-radius:7px;outline:none">
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button id="ob-skip"  style="flex:1;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);color:var(--text-dim);cursor:pointer;padding:12px;border-radius:10px;font-family:inherit;font-size:11px">Agora não</button>
        <button id="ob-save"  style="flex:2;background:var(--accent);border:none;color:#000;cursor:pointer;padding:12px;border-radius:10px;font-family:inherit;font-size:11px;font-weight:bold">⚡ Ativar JARVIS</button>
      </div>
      <div style="font-size:10px;color:var(--text-dim);text-align:center;margin-top:12px;opacity:0.6">Você pode configurar depois em Configurações → API Key</div>
    </div>`
  document.body.appendChild(modal)

  $id('ob-open-groq').onclick = () => {
    if(typeof createTab === 'function') createTab('https://console.groq.com/keys')
    else ipcRenderer.send('open-external','https://console.groq.com/keys')
  }

  $id('ob-skip').onclick = () => {
    const c = loadJ(path.join(CFG_DIR,'config.json'),{})
    c.onboarding_done = true; saveJ(path.join(CFG_DIR,'config.json'),c)
    modal.remove()
  }

  $id('ob-save').onclick = () => {
    const key = $id('ob-apikey').value.trim()
    if(!key || !key.startsWith('gsk_')) {
      $id('ob-apikey').style.borderColor = '#ff4455'
      $id('ob-apikey').placeholder = 'Chave inválida — começa com gsk_...'
      setTimeout(() => { $id('ob-apikey').style.borderColor=''; $id('ob-apikey').placeholder='gsk_...' }, 2000)
      return
    }
    const c = loadJ(path.join(CFG_DIR,'config.json'),{})
    c.groq_key = key; c.onboarding_done = true
    saveJ(path.join(CFG_DIR,'config.json'),c)
    modal.remove()
    t2('⚡ JARVIS ativado! Você pode começar a conversar.','success',4000)
    // Força reload da key no renderer
    const inp = $id('cfg-apikey')
    if(inp) inp.value = '••••••••••••'
  }
}

// Roda onboarding 2s após inicializar (dá tempo da UI carregar)
setTimeout(checkGroqOnboarding, 2000)

// ─────────────────────────────────────────────────────────────────────────────
// P8. PÁGINA DE ERRO — JOGO IRON MAN
// ─────────────────────────────────────────────────────────────────────────────
const ERROR_GAME_HTML = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>LUMINA — Sem sinal</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--accent:#00BFFF;--bg:#03050f;--text:#c8d8e8;--dim:#1a3a5a}
html,body{width:100%;height:100%;background:var(--bg);font-family:'Consolas','Courier New',monospace;overflow:hidden;user-select:none;color:var(--text)}
#bg{position:fixed;inset:0;z-index:0}
#ui{position:fixed;inset:0;z-index:10;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:20px}
#hud-top{display:flex;justify-content:space-between;align-items:flex-start}
#hud-score{font-size:28px;font-weight:bold;color:var(--accent);text-shadow:0 0 20px var(--accent);letter-spacing:2px}
#hud-best{font-size:11px;color:var(--dim);margin-top:4px;letter-spacing:1px}
#hud-right{text-align:right}
#hud-lives{font-size:22px;letter-spacing:4px}
#hud-wave{font-size:10px;color:var(--dim);letter-spacing:2px;margin-top:4px}
#hud-bottom{display:flex;justify-content:space-between;align-items:flex-end}
#hud-status{font-size:10px;color:var(--dim);letter-spacing:2px}
#hud-health-wrap{width:200px}
#hud-health-label{font-size:9px;color:var(--dim);letter-spacing:2px;margin-bottom:4px}
#hud-health-bg{height:4px;background:rgba(0,191,255,0.1);border-radius:2px}
#hud-health-fill{height:100%;background:var(--accent);border-radius:2px;width:100%;transition:width 0.3s,background 0.3s;box-shadow:0 0 8px var(--accent)}
#overlay{position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(3,5,15,0.92);backdrop-filter:blur(10px)}
#overlay.hidden{display:none}
#ov-logo{font-size:42px;font-weight:bold;letter-spacing:8px}
#ov-logo .l{color:var(--accent);text-shadow:0 0 30px var(--accent)}
#ov-logo .r{color:var(--dim)}
#ov-title{font-size:13px;color:var(--dim);letter-spacing:4px;margin-top:-8px}
#ov-msg{font-size:11px;color:var(--text);text-align:center;line-height:1.8;max-width:400px;margin:8px 0}
#ov-score-big{font-size:48px;font-weight:bold;color:var(--accent);text-shadow:0 0 30px var(--accent);letter-spacing:4px}
#ov-score-label{font-size:10px;color:var(--dim);letter-spacing:3px;margin-top:-8px}
#ov-best{font-size:11px;color:var(--dim)}
#btn-play{background:var(--accent);border:none;color:#000;cursor:pointer;font-family:inherit;font-size:13px;font-weight:bold;padding:16px 48px;border-radius:12px;letter-spacing:3px;transition:all 0.2s;margin-top:8px}
#btn-play:hover{transform:translateY(-3px);box-shadow:0 8px 30px rgba(0,191,255,0.4)}
#btn-retry{background:transparent;border:1px solid rgba(0,191,255,0.3);color:var(--accent);cursor:pointer;font-family:inherit;font-size:11px;padding:10px 24px;border-radius:8px;letter-spacing:2px}
#btn-retry:hover{background:rgba(0,191,255,0.1)}
#ov-instructions{font-size:10px;color:var(--dim);text-align:center;line-height:2;opacity:0.7}
canvas{position:fixed;inset:0;z-index:1}
</style>
</head>
<body>
<canvas id="bg"></canvas>
<canvas id="c"></canvas>

<div id="ui">
  <div id="hud-top">
    <div>
      <div id="hud-score">0</div>
      <div id="hud-best">MELHOR: 0</div>
    </div>
    <div id="hud-right">
      <div id="hud-lives">❤❤❤</div>
      <div id="hud-wave">WAVE 1</div>
    </div>
  </div>
  <div id="hud-bottom">
    <div id="hud-status">STARK INDUSTRIES — MARK XLVII ONLINE</div>
    <div id="hud-health-wrap">
      <div id="hud-health-label">ARMOR INTEGRITY</div>
      <div id="hud-health-bg"><div id="hud-health-fill"></div></div>
    </div>
  </div>
</div>

<div id="overlay">
  <div id="ov-logo"><span class="l">L</span><span class="r">UMINA</span></div>
  <div id="ov-title">INTELLIGENT BROWSER</div>
  <div id="ov-msg" id="ov-error-msg">Sem conexão — mas você ainda pode voar.</div>
  <div id="ov-score-big" style="display:none">0</div>
  <div id="ov-score-label" style="display:none">PONTOS</div>
  <div id="ov-best" style="display:none"></div>
  <button id="btn-play">▶ INICIAR MISSÃO</button>
  <button id="btn-retry" style="display:none">↩ TENTAR NOVAMENTE</button>
  <div id="ov-instructions">ESPAÇO / CLIQUE — voar · SETINHAS — mover · Esquive dos obstáculos</div>
</div>

<script>
const bgCanvas = document.getElementById('bg')
const bgCtx    = bgCanvas.getContext('2d')
const c = document.getElementById('c')
const ctx = c.getContext('2d')

let W, H
function resize() {
  W = c.width  = bgCanvas.width  = window.innerWidth
  H = c.height = bgCanvas.height = window.innerHeight
}
resize()
window.onresize = resize

// ── STARS ────────────────────────────────────────────────────────────────────
const stars = Array.from({length:200}, () => ({
  x: Math.random(), y: Math.random(),
  r: Math.random()*1.4+0.2, op: Math.random()*0.6+0.1,
  tw: Math.random()*Math.PI*2, tws: Math.random()*0.015+0.003
}))

function drawBg() {
  bgCtx.clearRect(0,0,W,H)
  stars.forEach(s => {
    s.tw += s.tws
    bgCtx.beginPath()
    bgCtx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2)
    bgCtx.fillStyle = 'rgba(180,210,255,' + (s.op*(0.4+0.6*Math.sin(s.tw))) + ')'
    bgCtx.fill()
  })
}
setInterval(drawBg, 50)
drawBg()

// ── GAME STATE ───────────────────────────────────────────────────────────────
let gameRunning = false
let score = 0, bestScore = parseInt(localStorage.getItem('im_best')||'0')
let frame = 0, wave = 1

// Iron Man
const IM = {
  x: 0, y: 0,
  vy: 0, vx: 0,
  w: 52, h: 52,
  thrust: false,
  hp: 100, maxHp: 100,
  lives: 3,
  invincible: 0,
  trail: [],
  flare: 0,
  blastCooldown: 0,
  blasts: []
}

// Obstacles & particles
let obstacles = []
let particles = []
let explosions = []
let powerups = []

// Controls
const keys = {}
let clicking = false

document.addEventListener('keydown', e => {
  keys[e.code] = true
  if(e.code === 'Space') { e.preventDefault(); clicking = true }
})
document.addEventListener('keyup', e => {
  keys[e.code] = false
  if(e.code === 'Space') clicking = false
})
document.addEventListener('mousedown', () => clicking = true)
document.addEventListener('mouseup',   () => clicking = false)
document.addEventListener('touchstart', e => { e.preventDefault(); clicking = true }, {passive:false})
document.addEventListener('touchend',   e => { e.preventDefault(); clicking = false }, {passive:false})

// ── OBSTACLE TYPES ────────────────────────────────────────────────────────────
const OBS_TYPES = [
  { id:'drone',    color:'#ff4444', glow:'#ff000088', w:36, h:28, draw: drawDrone   },
  { id:'missile',  color:'#f97316', glow:'#ff440066', w:44, h:16, draw: drawMissile },
  { id:'rock',     color:'#64748b', glow:'#33445566', w:40, h:40, draw: drawRock    },
  { id:'laser',    color:'#a855f7', glow:'#9900ff88', w:8,  h:80, draw: drawLaser   },
  { id:'emp',      color:'#22c55e', glow:'#00ff4488', w:28, h:28, draw: drawEmp     },
  { id:'satellite',color:'#f59e0b', glow:'#ffaa0066', w:50, h:30, draw: drawSatellite},
]

function drawDrone(ctx, x, y, w, h, t, col) {
  const grd = ctx.createLinearGradient(x,y,x,y+h)
  grd.addColorStop(0, '#334')
  grd.addColorStop(1, '#556')
  ctx.fillStyle = grd
  ctx.beginPath(); ctx.roundRect(x-w/2, y-h/2, w, h, 5); ctx.fill()
  ctx.strokeStyle = col; ctx.lineWidth=1.5; ctx.stroke()
  // Rotores
  ;[-1,1].forEach(s => {
    ctx.save(); ctx.translate(x+s*(w/2-2), y-h/4)
    ctx.rotate(t*0.15)
    for(let i=0;i<3;i++){
      ctx.rotate(Math.PI*2/3)
      ctx.fillStyle='rgba(200,220,255,0.6)'
      ctx.fillRect(-8,-1.5,16,3)
    }
    ctx.restore()
  })
  // Red eye
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2)
  ctx.fillStyle = '#ff3333'
  ctx.shadowBlur=12; ctx.shadowColor='#ff0000'; ctx.fill()
  ctx.shadowBlur = 0
}

function drawMissile(ctx, x, y, w, h, t, col) {
  ctx.save(); ctx.translate(x,y)
  const grd = ctx.createLinearGradient(-w/2,0,w/2,0)
  grd.addColorStop(0,'#cc3300'); grd.addColorStop(0.7,'#ff6600'); grd.addColorStop(1,'#ffcc00')
  ctx.fillStyle = grd
  ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(-w/2+8,-h/2); ctx.lineTo(-w/2,0); ctx.lineTo(-w/2+8,h/2); ctx.closePath(); ctx.fill()
  ctx.strokeStyle=col; ctx.lineWidth=1; ctx.stroke()
  // Exhaust flame
  const fl = ctx.createRadialGradient(w/2+4,0,0,w/2+12,0,16)
  fl.addColorStop(0,'rgba(255,200,50,0.9)'); fl.addColorStop(1,'transparent')
  ctx.fillStyle=fl
  ctx.beginPath(); ctx.ellipse(w/2+12, 0, 16, 6, 0, 0, Math.PI*2); ctx.fill()
  ctx.restore()
}

function drawRock(ctx, x, y, w, h, t, col) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(t*0.02)
  ctx.beginPath()
  const pts = 7
  for(let i=0;i<pts;i++){
    const a = (i/pts)*Math.PI*2
    const r = (w/2)*(0.7+0.3*Math.sin(i*2.3))
    i===0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r) : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r)
  }
  ctx.closePath()
  const grd = ctx.createRadialGradient(0,0,2,0,0,w/2)
  grd.addColorStop(0,'#78909c'); grd.addColorStop(1,'#263238')
  ctx.fillStyle=grd; ctx.fill()
  ctx.strokeStyle='#546e7a'; ctx.lineWidth=1.5; ctx.stroke()
  ctx.restore()
}

function drawLaser(ctx, x, y, w, h, t, col) {
  const pulse = 0.6 + 0.4*Math.sin(t*0.25)
  ctx.shadowBlur = 20*pulse; ctx.shadowColor = col
  const grd = ctx.createLinearGradient(x,y-h/2,x,y+h/2)
  grd.addColorStop(0,'transparent'); grd.addColorStop(0.3,col); grd.addColorStop(0.7,col); grd.addColorStop(1,'transparent')
  ctx.fillStyle=grd
  ctx.fillRect(x-w/2, y-h/2, w, h)
  ctx.fillStyle='rgba(255,255,255,'+pulse*0.6+')'
  ctx.fillRect(x-w/4, y-h/2, w/2, h)
  ctx.shadowBlur=0
}

function drawEmp(ctx, x, y, w, h, t, col) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(t*0.05)
  for(let ring=0;ring<3;ring++){
    ctx.beginPath(); ctx.arc(0,0,(ring+1)*w/4,0,Math.PI*2)
    ctx.strokeStyle=col; ctx.lineWidth=ring===1?2:1; ctx.globalAlpha=0.4+0.2*ring
    ctx.stroke()
  }
  ctx.globalAlpha=1
  ctx.beginPath(); ctx.arc(0,0,w/4,0,Math.PI*2)
  ctx.fillStyle='rgba(34,197,94,0.3)'; ctx.fill()
  ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke()
  // Spark
  for(let i=0;i<6;i++){
    const a = (i/6)*Math.PI*2 + t*0.08
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*w/4,Math.sin(a)*w/4)
    ctx.lineTo(Math.cos(a)*w/2.2,Math.sin(a)*w/2.2)
    ctx.strokeStyle='rgba(34,197,94,0.8)'; ctx.lineWidth=1.5; ctx.stroke()
  }
  ctx.restore()
}

function drawSatellite(ctx, x, y, w, h, t, col) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(Math.sin(t*0.02)*0.3)
  // Body
  ctx.fillStyle='#334155'
  ctx.fillRect(-w/4, -h/2, w/2, h)
  ctx.strokeStyle=col; ctx.lineWidth=1.5
  ctx.strokeRect(-w/4,-h/2,w/2,h)
  // Solar panels
  ;[-1,1].forEach(s => {
    ctx.fillStyle='rgba(30,100,200,0.7)'
    ctx.fillRect(s*(w/4)+s*2, -h/3, s*w/2.2, h*0.6)
    ctx.strokeStyle='#60a5fa'; ctx.lineWidth=0.5
    ctx.strokeRect(s*(w/4)+s*2, -h/3, s*w/2.2, h*0.6)
    for(let row=0;row<3;row++){
      ctx.beginPath(); ctx.moveTo(s*(w/4)+s*2, -h/3 + row*(h*0.6/3))
      ctx.lineTo(s*(w/4)+s*(w/2.2)+s*2, -h/3 + row*(h*0.6/3))
      ctx.strokeStyle='rgba(100,160,255,0.4)'; ctx.stroke()
    }
  })
  // Dish
  ctx.beginPath(); ctx.arc(0,-h/2-6,8,Math.PI,0); ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0,-h/2-6); ctx.lineTo(0,-h/2)
  ctx.stroke()
  // Signal pulse
  const sp = (t%60)/60
  ctx.beginPath(); ctx.arc(0,-h/2-6,8+sp*20,Math.PI,0)
  ctx.strokeStyle='rgba(0,191,255,'+(1-sp)*0.4+')'; ctx.lineWidth=1; ctx.stroke()
  ctx.restore()
}

// ── IRON MAN DRAW ─────────────────────────────────────────────────────────────
function drawIronMan(x, y, thrust, flare, t, invincible) {
  const alpha = invincible > 0 ? (Math.sin(t*0.5)>0?1:0.3) : 1
  ctx.globalAlpha = alpha
  ctx.save(); ctx.translate(x, y)

  // Thrusters glow
  if(thrust) {
    const tg = ctx.createRadialGradient(0,20,0,0,24,28)
    tg.addColorStop(0,'rgba(255,160,30,0.9)')
    tg.addColorStop(0.4,'rgba(255,80,10,0.6)')
    tg.addColorStop(1,'transparent')
    ctx.fillStyle=tg
    ctx.beginPath(); ctx.ellipse(0,26,12,22,0,0,Math.PI*2); ctx.fill()
  }

  // BODY — HEX RED/GOLD ARMOR
  // Torso
  ctx.fillStyle='#b91c1c'
  ctx.beginPath(); ctx.roundRect(-13,-14,26,26,4); ctx.fill()
  // Gold chest stripe
  ctx.fillStyle='#d97706'
  ctx.fillRect(-8,-4,16,10)
  // Arc reactor
  const arc = ctx.createRadialGradient(0,2,0,0,2,7)
  arc.addColorStop(0,'rgba(200,240,255,1)')
  arc.addColorStop(0.3,'rgba(0,191,255,0.9)')
  arc.addColorStop(1,'rgba(0,100,200,0.2)')
  ctx.fillStyle=arc
  ctx.shadowBlur=18; ctx.shadowColor='#00BFFF'
  ctx.beginPath(); ctx.arc(0,2,7,0,Math.PI*2); ctx.fill()
  ctx.shadowBlur=0

  // Shoulders
  ;[-1,1].forEach(s => {
    ctx.fillStyle='#b91c1c'
    ctx.beginPath(); ctx.roundRect(s*13,-12,s*10,18,s>0?[0,5,5,0]:[5,0,0,5]); ctx.fill()
    ctx.fillStyle='#d97706'
    ctx.fillRect(s*13,-4,s*10,8)
  })

  // Helmet
  ctx.fillStyle='#b91c1c'
  ctx.beginPath(); ctx.roundRect(-12,-30,24,18,6); ctx.fill()
  // Face plate
  ctx.fillStyle='#d97706'
  ctx.beginPath(); ctx.roundRect(-9,-28,18,13,4); ctx.fill()
  // Eyes glow
  const eyeColor = flare > 0 ? '#ffffff' : '#00BFFF'
  ;[-5,5].forEach(ex => {
    const eg = ctx.createRadialGradient(ex,-22,0,ex,-22,4)
    eg.addColorStop(0,'rgba(255,255,255,1)')
    eg.addColorStop(0.5,eyeColor)
    eg.addColorStop(1,'transparent')
    ctx.fillStyle=eg
    ctx.shadowBlur=flare>0?20:10; ctx.shadowColor=eyeColor
    ctx.beginPath(); ctx.ellipse(ex,-22,4,2.5,0,0,Math.PI*2); ctx.fill()
  })
  ctx.shadowBlur=0

  // Legs
  ;[-1,1].forEach(s => {
    ctx.fillStyle='#b91c1c'
    ctx.beginPath(); ctx.roundRect(s*3,12,s*9,16,3); ctx.fill()
    // Boot thruster
    if(thrust){
      const bt = ctx.createRadialGradient(s*7,30,0,s*7,34,10)
      bt.addColorStop(0,'rgba(255,160,30,0.8)')
      bt.addColorStop(1,'transparent')
      ctx.fillStyle=bt
      ctx.beginPath(); ctx.ellipse(s*7,32,6,10,0,0,Math.PI*2); ctx.fill()
    }
  })

  // Repulsor blast visual
  if(flare>0){
    ;[-10,10].forEach(bx => {
      const rep = ctx.createRadialGradient(bx+s*0,3,0,bx,3,flare*8)
      rep.addColorStop(0,'rgba(200,240,255,0.95)')
      rep.addColorStop(0.5,'rgba(0,191,255,0.6)')
      rep.addColorStop(1,'transparent')
      ctx.fillStyle=rep
      ctx.shadowBlur=20; ctx.shadowColor='#00BFFF'
      ctx.beginPath(); ctx.arc(bx,3,flare*8,0,Math.PI*2); ctx.fill()
      ctx.shadowBlur=0
    })
  }

  ctx.restore()
  ctx.globalAlpha=1
}

// ── POWERUP ───────────────────────────────────────────────────────────────────
const PU_TYPES = [
  {id:'shield', color:'#00BFFF', icon:'🛡', label:'SHIELD', effect: () => { IM.hp = Math.min(IM.maxHp, IM.hp+40); updateHealthHud() }},
  {id:'blast',  color:'#f59e0b', icon:'⚡', label:'REPULSOR', effect: () => { IM.blastCooldown=0; fireShotgun() }},
  {id:'extra',  color:'#22c55e', icon:'❤', label:'+LIFE',   effect: () => { IM.lives = Math.min(5,IM.lives+1); updateLivesHud() }},
  {id:'speed',  color:'#a855f7', icon:'💨', label:'BOOST',  effect: () => { score += 500; updateScoreHud() }},
]

function spawnPowerup() {
  const t = PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)]
  powerups.push({ x:W+30, y:80+Math.random()*(H-160), r:16, type:t, t:0 })
}

// ── EXPLOSION ─────────────────────────────────────────────────────────────────
function spawnExplosion(x, y, col='#ff6600', big=false) {
  const n = big ? 28 : 14
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2
    const v = 2+Math.random()*(big?8:5)
    explosions.push({
      x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v,
      life:1, maxLife:0.5+Math.random()*0.5,
      r:2+Math.random()*(big?6:4),
      col: col, glow:col
    })
  }
  // Shockwave ring
  particles.push({ type:'ring', x, y, r:0, maxR:big?100:60, life:1, col })
}

// ── BLAST / REPULSOR ──────────────────────────────────────────────────────────
function fireBlast() {
  if(IM.blastCooldown > 0) return
  IM.flare = 8
  IM.blastCooldown = 20
  IM.blasts.push({ x:IM.x+26, y:IM.y, vy:0, life:1, r:8, col:'#00BFFF', speed:16 })
}

function fireShotgun() {
  IM.flare = 12
  for(let a=-15;a<=15;a+=7.5){
    const rad = (a/180)*Math.PI
    IM.blasts.push({ x:IM.x+26, y:IM.y, vy:Math.tan(rad)*14, life:1, r:6, col:'#00BFFF', speed:14 })
  }
}

// ── HUD HELPERS ───────────────────────────────────────────────────────────────
function updateScoreHud() {
  document.getElementById('hud-score').textContent = score
  if(score > bestScore){ bestScore=score; localStorage.setItem('im_best',bestScore) }
  document.getElementById('hud-best').textContent = 'MELHOR: '+bestScore
}
function updateLivesHud() {
  document.getElementById('hud-lives').textContent = '❤'.repeat(IM.lives)
}
function updateHealthHud() {
  const pct = (IM.hp/IM.maxHp)*100
  const fill = document.getElementById('hud-health-fill')
  fill.style.width = pct+'%'
  fill.style.background = pct>60?'var(--accent)':pct>30?'#f59e0b':'#ef4444'
  fill.style.boxShadow  = '0 0 8px '+(pct>60?'var(--accent)':pct>30?'#f59e0b':'#ef4444')
}
function updateWaveHud() {
  document.getElementById('hud-wave').textContent = 'WAVE '+wave
}

// ── SPAWN OBSTACLES ───────────────────────────────────────────────────────────
function spawnObstacle() {
  const t = OBS_TYPES[Math.floor(Math.random()*OBS_TYPES.length)]
  const speed = 3 + wave*0.8 + Math.random()*2
  let y = 60+Math.random()*(H-120)
  let vy = 0
  if(t.id==='missile') vy = (Math.random()-0.5)*1.5
  if(t.id==='laser')   y  = 40+Math.random()*(H-80)
  obstacles.push({ x:W+t.w, y, vx:-speed, vy, w:t.w, h:t.h, type:t, t:0, hp:t.id==='satellite'?3:1 })
}

// ── COLLISION (AABB) ──────────────────────────────────────────────────────────
function aabb(ax,ay,aw,ah, bx,by,bw,bh) {
  return ax-aw/2 < bx+bw/2 && ax+aw/2 > bx-bw/2 &&
         ay-ah/2 < by+bh/2 && ay+ah/2 > by-bh/2
}

// ── MAIN LOOP ─────────────────────────────────────────────────────────────────
let lastObstacle = 0
let lastPowerup  = 0
let animId       = null

function gameLoop() {
  if(!gameRunning){ ctx.clearRect(0,0,W,H); return }
  animId = requestAnimationFrame(gameLoop)
  frame++

  ctx.clearRect(0,0,W,H)

  // ── Iron Man physics
  const thrust = clicking || keys['Space'] || keys['ArrowUp']
  IM.thrust = thrust
  if(thrust)       IM.vy -= 0.5
  else             IM.vy += 0.35
  if(keys['ArrowDown'])  IM.vy += 0.3
  if(keys['ArrowLeft'])  IM.vx = Math.max(IM.vx-0.4,-6)
  if(keys['ArrowRight']) IM.vx = Math.min(IM.vx+0.4, 6)
  else IM.vx *= 0.92

  IM.vy = Math.max(-10, Math.min(10, IM.vy))
  IM.x  = Math.max(IM.w/2+60, Math.min(W*0.45, IM.x + IM.vx))
  IM.y  = Math.max(IM.h/2+10, Math.min(H-IM.h/2-10, IM.y + IM.vy))

  if(IM.invincible > 0) IM.invincible--
  if(IM.blastCooldown > 0) IM.blastCooldown--
  if(IM.flare > 0) IM.flare--

  // Auto-fire repulsor every 40 frames
  if(frame % 40 === 0) fireBlast()

  // Trail
  IM.trail.push({x:IM.x, y:IM.y, t:1})
  if(IM.trail.length > 18) IM.trail.shift()

  // ── Spawn
  const spawnRate = Math.max(28, 80 - wave*6)
  if(frame - lastObstacle > spawnRate + Math.random()*20) {
    spawnObstacle()
    if(wave > 3 && Math.random() < 0.35) spawnObstacle()
    lastObstacle = frame
  }
  if(frame - lastPowerup > 360 && Math.random() < 0.015) {
    spawnPowerup(); lastPowerup = frame
  }

  // Wave up every 600 frames
  if(frame % 600 === 0) {
    wave++
    updateWaveHud()
    spawnExplosion(IM.x, IM.y, '#00BFFF', true)
    t2('⚡ WAVE '+wave+' — INTENSIDADE AUMENTADA!', 'info', 2500)
  }

  // Score
  if(frame % 6 === 0) { score += wave; updateScoreHud() }

  // ── Draw trail
  IM.trail.forEach((pt,i) => {
    const a = (i/IM.trail.length)*0.5
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 3*(i/IM.trail.length), 0, Math.PI*2)
    ctx.fillStyle = 'rgba(0,191,255,'+a+')'
    ctx.shadowBlur=10; ctx.shadowColor='#00BFFF'; ctx.fill(); ctx.shadowBlur=0
    pt.t -= 0.06
  })

  // ── Draw Iron Man
  drawIronMan(IM.x, IM.y, IM.thrust, IM.flare, frame, IM.invincible)

  // ── Blasts
  IM.blasts = IM.blasts.filter(b => {
    b.x += b.speed; b.y += b.vy; b.life -= 0.02
    if(b.x > W+40 || b.life <= 0) return false
    // Hit obstacle?
    let hit = false
    obstacles = obstacles.filter(o => {
      if(aabb(b.x,b.y,b.r*2,b.r*2, o.x,o.y,o.w,o.h)) {
        o.hp--; hit=true
        spawnExplosion(o.x,o.y,'#ff6600',false)
        if(o.hp<=0){ score+=100*wave; updateScoreHud(); return false }
        return true
      }
      return true
    })
    if(hit) return false
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2)
    const bg = ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r)
    bg.addColorStop(0,'rgba(200,240,255,0.95)')
    bg.addColorStop(1,'rgba(0,191,255,0.2)')
    ctx.fillStyle=bg; ctx.shadowBlur=15; ctx.shadowColor='#00BFFF'; ctx.fill(); ctx.shadowBlur=0
    return true
  })

  // ── Obstacles
  obstacles = obstacles.filter(o => {
    o.x += o.vx; o.y += o.vy; o.t++
    // Bounce vertically
    if(o.y < 30 || o.y > H-30) { o.vy *= -1; o.y = Math.max(30,Math.min(H-30,o.y)) }
    if(o.x < -o.w) return false
    // Draw
    ctx.shadowBlur=16; ctx.shadowColor=o.type.glow; o.type.draw(ctx,o.x,o.y,o.w,o.h,o.t,o.type.color); ctx.shadowBlur=0
    // Collision with Iron Man
    const pad = 8
    if(IM.invincible===0 && aabb(IM.x,IM.y,IM.w-pad,IM.h-pad, o.x,o.y,o.w-4,o.h-4)){
      IM.hp -= o.type.id==='laser'?20:o.type.id==='missile'?35:25
      IM.invincible = 80
      spawnExplosion(IM.x,IM.y,'#ff4444',false)
      updateHealthHud()
      if(IM.hp<=0){ loseLife(); return false }
      return false  // remove obstacle on hit
    }
    return true
  })

  // ── Powerups
  powerups = powerups.filter(p => {
    p.x -= 2.5; p.t++
    if(p.x < -40) return false
    // Pulse ring
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r*(1+0.15*Math.sin(p.t*0.1)), 0, Math.PI*2)
    ctx.strokeStyle=p.type.color; ctx.lineWidth=2
    ctx.shadowBlur=14; ctx.shadowColor=p.type.color; ctx.stroke(); ctx.shadowBlur=0
    // Icon
    ctx.font='16px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(p.type.icon, p.x, p.y)
    // Collect
    if(aabb(IM.x,IM.y,IM.w,IM.h, p.x,p.y,p.r*2,p.r*2)){
      p.type.effect()
      spawnExplosion(p.x,p.y,p.type.color,false)
      t2('⚡ '+p.type.label+' COLETADO!','success',2000)
      return false
    }
    return true
  })

  // ── Explosions / particles
  explosions = explosions.filter(e => {
    e.x+=e.vx; e.y+=e.vy; e.vx*=0.94; e.vy*=0.94
    e.life -= 0.035
    if(e.life<=0) return false
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r*e.life,0,Math.PI*2)
    ctx.fillStyle='rgba('+hexToRgb(e.col)+','+e.life+')'
    ctx.shadowBlur=8; ctx.shadowColor=e.glow; ctx.fill(); ctx.shadowBlur=0
    return true
  })
  particles = particles.filter(p => {
    if(p.type==='ring'){
      p.r += 4; p.life -= 0.05
      if(p.life<=0) return false
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2)
      ctx.strokeStyle='rgba('+hexToRgb(p.col)+','+p.life+')'
      ctx.lineWidth=3*p.life; ctx.stroke()
    }
    return true
  })
}

function hexToRgb(hex){
  const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? parseInt(r[1],16)+','+parseInt(r[2],16)+','+parseInt(r[3],16) : '255,255,255'
}

function loseLife(){
  IM.lives--; updateLivesHud()
  IM.hp=IM.maxHp; IM.invincible=120
  updateHealthHud()
  if(IM.lives<=0) endGame()
  else {
    spawnExplosion(IM.x,IM.y,'#ff4444',true)
    t2('💥 DANO CRÍTICO NA ARMADURA!','error',2500)
  }
}

function endGame(){
  gameRunning=false
  cancelAnimationFrame(animId)
  if(score>bestScore){ bestScore=score; localStorage.setItem('im_best',bestScore) }
  const ov=document.getElementById('overlay')
  ov.classList.remove('hidden')
  ov.querySelector('#ov-msg').innerHTML='Armadura destruída, sir.<br>Mas a missão continua.'
  document.getElementById('ov-score-big').style.display='block'
  document.getElementById('ov-score-big').textContent=score
  document.getElementById('ov-score-label').style.display='block'
  document.getElementById('ov-best').style.display='block'
  document.getElementById('ov-best').textContent='Melhor: '+bestScore
  const bp=document.getElementById('btn-play')
  bp.style.display='none'
  document.getElementById('btn-retry').style.display='block'
  ov.querySelector('#ov-instructions').style.display='none'
}

function startGame(){
  document.getElementById('overlay').classList.add('hidden')
  gameRunning=true; score=0; frame=0; wave=1
  obstacles=[]; particles=[]; explosions=[]; powerups=[]; IM.blasts=[]
  IM.x=W*0.18; IM.y=H/2; IM.vy=0; IM.vx=0
  IM.hp=IM.maxHp; IM.lives=3; IM.invincible=0; IM.flare=0; IM.blastCooldown=0
  IM.trail=[]; lastObstacle=0; lastPowerup=0
  updateScoreHud(); updateLivesHud(); updateHealthHud(); updateWaveHud()
  document.getElementById('hud-best').textContent='MELHOR: '+bestScore
  cancelAnimationFrame(animId)
  gameLoop()
}

document.getElementById('btn-play').onclick  = startGame
document.getElementById('btn-retry').onclick = startGame
</script>
</body>
</html>`

// Injeta página de erro como data URL quando webview falha a carregar
function injectErrorPage(wv, errorUrl) {
  if(!wv) return
  const encoded = 'data:text/html;charset=utf-8,' + encodeURIComponent(ERROR_GAME_HTML)
  try { wv.loadURL(encoded) } catch(e) {}
}

// Escuta failed-load em todas as webviews
// Feito via MutationObserver para pegar webviews criadas depois
function bindErrorPages() {
  document.querySelectorAll('webview').forEach(wv => {
    if(wv._errorBound) return
    wv._errorBound = true
    wv.addEventListener('did-fail-load', ev => {
      if(ev.errorCode === -3)  return  // abortado
      if(ev.errorCode === -27) return  // blocked by CSP
      if(!ev.validatedURL || ev.validatedURL.startsWith('data:')) return
      // Só mostra erro se for a aba ativa
      const tabId = parseInt(wv.id.replace('wv-',''))
      if(tabId === window._activeTabId) {
        injectErrorPage(wv, ev.validatedURL)
      }
    })
  })
}

new MutationObserver(bindErrorPages)
  .observe(document.getElementById('content-area') || document.body, {childList:true, subtree:true})
bindErrorPages()

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
;(function init() {
  // Expõe função de teste do Iron Man para o botão nas configurações
  window._openIronManGame = function() {
    // Abre o jogo numa nova aba como data URL
    if(typeof createTab !== 'function') return
    const encoded = 'data:text/html;charset=utf-8,' + encodeURIComponent(ERROR_GAME_HTML)
    createTab(encoded, '🦾 Iron Man')
    if(typeof toast === 'function') toast('🦾 Boa sorte, sir.', 'success', 2000)
  }

  console.log('[LUMINA] polish.js carregado ✓')
})()

})() // LUMINA_POLISH IIFE end
