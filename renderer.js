const { ipcRenderer } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const BACKEND = 'http://localhost:5678'

// ── WINDOW CONTROLS ──────────────────────────────────────────────────────────
document.getElementById('btn-min').onclick   = () => ipcRenderer.send('minimize')
document.getElementById('btn-max').onclick   = () => ipcRenderer.send('maximize')
document.getElementById('btn-close').onclick = () => ipcRenderer.send('close')

// ── CONFIG ────────────────────────────────────────────────────────────────────
const UI_CFG  = path.join(os.homedir(), '.lumina', 'ui-config.json')
const HIST    = path.join(os.homedir(), '.lumina', 'history.json')
const BMARKS  = path.join(os.homedir(), '.lumina', 'bookmarks.json')

function loadJSON(p, def) {
  try { if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,'utf8')) } catch(e) {}
  return def
}
function saveJSON(p, d) {
  try {
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})
    fs.writeFileSync(p, JSON.stringify(d,null,2))
  } catch(e) {}
}

let uiCfg    = loadJSON(UI_CFG, {accent:'#00BFFF',bg:'stars',wallpaper:null,opacity:30,engine:'google'})
let history  = loadJSON(HIST,   [])
let bookmarks= loadJSON(BMARKS, [])

// ── THEME ─────────────────────────────────────────────────────────────────────
function applyAccent(color) {
  uiCfg.accent = color
  document.documentElement.style.setProperty('--accent', color)
  const hex=color.replace('#','')
  const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16)
  document.documentElement.style.setProperty('--accent-dim',   `rgba(${r},${g},${b},0.15)`)
  document.documentElement.style.setProperty('--accent-glow',  `rgba(${r},${g},${b},0.3)`)
  document.documentElement.style.setProperty('--glass-border', `rgba(${r},${g},${b},0.2)`)
  saveJSON(UI_CFG, uiCfg)
}

function applyWallpaper(src, opacity) {
  const el = document.getElementById('bg-wallpaper')
  if (src) { el.style.backgroundImage=`url('${src.replace(/\\/g,"\\\\")}')`; el.style.opacity=(opacity||uiCfg.opacity)/100 }
  else { el.style.backgroundImage='none'; el.style.opacity=0 }
}

// ── CANVAS BG ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('bg-canvas')
const ctx    = canvas.getContext('2d')
let bgMode   = uiCfg.bg || 'stars'
let stars=[], particles=[], animFrame=null

function resizeCanvas() { canvas.width=window.innerWidth; canvas.height=window.innerHeight }
window.addEventListener('resize',()=>{resizeCanvas();initBg()})
resizeCanvas()

function initStars() {
  stars = Array.from({length:200},()=>({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height,
    r:Math.random()*1.5+0.2, op:Math.random()*0.7+0.1,
    speed:Math.random()*0.15+0.02,
    tw:Math.random()*Math.PI*2, tws:Math.random()*0.02+0.003
  }))
}
function initParticles() {
  const hex=uiCfg.accent.replace('#','')
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16)
  particles = Array.from({length:70},()=>({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height,
    r:Math.random()*2+0.5, vx:(Math.random()-0.5)*0.5, vy:(Math.random()-0.5)*0.5,
    op:Math.random()*0.5+0.1, color:`rgba(${r},${g},${b}`
  }))
}
function initBg() {
  if(animFrame) cancelAnimationFrame(animFrame)
  if(bgMode==='stars')          {initStars();    animStars()}
  else if(bgMode==='particles') {initParticles();animParticles()}
  else if(bgMode==='gradient')  {animGradient()}
  else {ctx.clearRect(0,0,canvas.width,canvas.height)}
}
let gradT=0
function animGradient(){
  gradT+=0.003
  const hex=uiCfg.accent.replace('#','')
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16)
  const grd=ctx.createRadialGradient(canvas.width/2+Math.sin(gradT)*200,canvas.height/2+Math.cos(gradT)*150,0,canvas.width/2,canvas.height/2,canvas.width*0.8)
  grd.addColorStop(0,`rgba(${r},${g},${b},0.08)`)
  grd.addColorStop(0.5,`rgba(${r},${g},${b},0.03)`)
  grd.addColorStop(1,'rgba(3,5,15,0)')
  ctx.clearRect(0,0,canvas.width,canvas.height)
  ctx.fillStyle=grd; ctx.fillRect(0,0,canvas.width,canvas.height)
  animFrame=requestAnimationFrame(animGradient)
}
function animStars(){
  ctx.clearRect(0,0,canvas.width,canvas.height)
  stars.forEach(s=>{
    s.tw+=s.tws; s.y+=s.speed
    if(s.y>canvas.height){s.y=0;s.x=Math.random()*canvas.width}
    const op=s.op*(0.4+0.6*Math.sin(s.tw))
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2)
    ctx.fillStyle=`rgba(200,220,255,${op})`; ctx.fill()
  })
  animFrame=requestAnimationFrame(animStars)
}
function animParticles(){
  ctx.clearRect(0,0,canvas.width,canvas.height)
  particles.forEach((p,i)=>{
    p.x+=p.vx; p.y+=p.vy
    if(p.x<0||p.x>canvas.width)  p.vx*=-1
    if(p.y<0||p.y>canvas.height) p.vy*=-1
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2)
    ctx.fillStyle=`${p.color},${p.op})`; ctx.fill()
    for(let j=i+1;j<particles.length;j++){
      const dx=p.x-particles[j].x,dy=p.y-particles[j].y,d=Math.sqrt(dx*dx+dy*dy)
      if(d<100){ctx.beginPath();ctx.strokeStyle=`${p.color},${(1-d/100)*0.07})`;ctx.lineWidth=0.5;ctx.moveTo(p.x,p.y);ctx.lineTo(particles[j].x,particles[j].y);ctx.stroke()}
    }
  })
  animFrame=requestAnimationFrame(animParticles)
}
initBg(); applyAccent(uiCfg.accent)
if(uiCfg.wallpaper) applyWallpaper(uiCfg.wallpaper, uiCfg.opacity)

// ── TOAST NOTIFICATIONS ───────────────────────────────────────────────────────
function toast(msg, type='info', duration=3000) {
  const t = document.createElement('div')
  t.className = `toast toast-${type}`
  t.textContent = msg
  document.getElementById('toast-container').appendChild(t)
  setTimeout(()=>t.classList.add('show'),10)
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),400) }, duration)
}

// ── FIRST RUN DIALOG ─────────────────────────────────────────────────────────
ipcRenderer.on('first-run', () => {
  document.getElementById('first-run-modal').classList.remove('hidden')
})

document.getElementById('fr-yes').onclick = async () => {
  ipcRenderer.send('set-default-browser', true)
  ipcRenderer.send('set-startup', true)
  ipcRenderer.send('first-run-done')
  document.getElementById('first-run-modal').classList.add('hidden')
  toast('✅ LUMINA definido como navegador padrão!', 'success')
}
document.getElementById('fr-no').onclick = () => {
  ipcRenderer.send('first-run-done')
  document.getElementById('first-run-modal').classList.add('hidden')
}

// ── TABS ─────────────────────────────────────────────────────────────────────
let tabs=[], activeTabId=null, tabCounter=0, incognitoMode=false
const tabsContainer = document.getElementById('tabs-container')
const webview       = document.getElementById('main-webview')
const homePage      = document.getElementById('home-page')

function createTab(url=null, title='Nova guia', incognito=false) {
  const id = ++tabCounter
  tabs.push({id,url,title,incognito})
  const el = document.createElement('div')
  el.className = 'tab' + (incognito?' incognito':'')
  el.dataset.id = id
  el.innerHTML = `<img class="tab-favicon" style="display:none"><span class="tab-title">${incognito?'🕵 ':''} ${title}</span><button class="tab-close">✕</button>`
  el.onclick = e => { if(!e.target.classList.contains('tab-close')) switchTab(id) }
  el.querySelector('.tab-close').onclick = e => { e.stopPropagation(); closeTab(id) }
  tabsContainer.appendChild(el)
  switchTab(id)
  if(url) navigate(url)
  return id
}

function switchTab(id) {
  activeTabId = id
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',parseInt(t.dataset.id)===id))
  const tab = tabs.find(t=>t.id===id)
  if(!tab) return
  incognitoMode = tab.incognito || false
  if(tab.url) { homePage.classList.add('hidden'); webview.classList.remove('hidden'); if(webview.src!==tab.url) { try{webview.loadURL(tab.url)}catch(e){webview.src=tab.url} } }
  else showHome()
  urlBar.value = tab.url || ''
  document.getElementById('incognito-badge').classList.toggle('hidden', !incognitoMode)
}

function closeTab(id) {
  const idx = tabs.findIndex(t=>t.id===id)
  if(idx===-1) return
  tabs.splice(idx,1)
  document.querySelector(`.tab[data-id="${id}"]`)?.remove()
  if(tabs.length===0) createTab()
  else if(activeTabId===id) switchTab(tabs[Math.min(idx,tabs.length-1)].id)
}

function updateActiveTab(url, title) {
  const tab=tabs.find(t=>t.id===activeTabId); if(!tab) return
  tab.url=url; tab.title=title||url
  const el=document.querySelector(`.tab[data-id="${activeTabId}"]`)
  if(el) {
    el.querySelector('.tab-title').textContent=(tab.incognito?'🕵 ':'')+((tab.title||'').slice(0,20)||'Nova guia')
    if(url&&url.startsWith('http')) {
      try {
        const favicon=el.querySelector('.tab-favicon')
        favicon.src=`${new URL(url).origin}/favicon.ico`
        favicon.style.display='block'
        favicon.onerror=()=>favicon.style.display='none'
      } catch(e){}
    }
  }
  // Salva no histórico (não salva incógnito)
  if(url&&url.startsWith('http')&&!tab.incognito) {
    history.unshift({url, title:title||url, time:Date.now()})
    if(history.length>500) history.splice(500)
    saveJSON(HIST, history)
  }
}

document.getElementById('new-tab-btn').onclick = () => createTab()

// ── NAVIGATION ───────────────────────────────────────────────────────────────
const urlBar = document.getElementById('url-bar')
const ENGINES = {
  google:     q=>`https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing:       q=>`https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: q=>`https://duckduckgo.com/?q=${encodeURIComponent(q)}`
}

// Palavras que indicam que é uma pergunta pro JARVIS
const JARVIS_TRIGGERS = [
  'como','qual','quem','onde','quando','por que','porque','o que','oque',
  'what','how','why','who','where','when','which','is','are','can','does',
  'explica','explique','me diz','me fala','me conta','define','definição',
  'significado','diferença','melhor','pior','comparar','help','ajuda',
  'dica','dicas','conselho','recomenda','recomendação','tutorial',
]

function isJarvisQuestion(text) {
  const t = text.toLowerCase().trim()
  // Se tem ponto de interrogação = pergunta
  if(t.includes('?')) return true
  // Se começa com palavra-gatilho
  if(JARVIS_TRIGGERS.some(w => t.startsWith(w+' ') || t.startsWith(w+'?'))) return true
  // Se tem mais de 4 palavras e não parece URL = provavelmente pergunta
  const words = t.split(' ').length
  const isUrl = t.startsWith('http')||t.startsWith('//')||/^[a-z0-9-]+\.[a-z]{2,}/i.test(t)
  if(words > 4 && !isUrl) return true
  return false
}

function navigate(input) {
  let url=(input||'').trim(); if(!url) return
  const isUrl = url.startsWith('http')||url.startsWith('//')||/^[a-z0-9-]+\.[a-z]{2,}/i.test(url)

  // Verifica se é pergunta pro JARVIS (só se não for URL)
  if(!isUrl && isJarvisQuestion(url)) {
    askJarvisFromSearch(url)
    return
  }

  if(isUrl) { if(!url.startsWith('http')) url='https://'+url }
  else { url=(ENGINES[uiCfg.engine||'google']||ENGINES.google)(url) }
  homePage.classList.add('hidden'); webview.classList.remove('hidden')
  try{webview.loadURL(url)}catch(e){webview.src=url}
  urlBar.value=url; updateActiveTab(url,url)
}

async function askJarvisFromSearch(question) {
  // Abre o chat e manda a pergunta
  document.getElementById('panel-jarvis').classList.remove('hidden')
  document.getElementById('chat-input').value = question
  urlBar.value = ''
  // Pequeno delay pra UI atualizar
  await new Promise(r=>setTimeout(r,50))
  window._sendChatRemote ? window._sendChatRemote() : sendChat()
  toast('⚡ JARVIS respondendo...', 'info', 2000)
}

function showHome() {
  try{webview.loadURL('about:blank')}catch(e){webview.src='about:blank'}
  webview.classList.add('hidden'); homePage.classList.remove('hidden')
  urlBar.value=''; updateActiveTab(null,'Nova guia')
}

urlBar.addEventListener('keydown',e=>{if(e.key==='Enter')navigate(urlBar.value)})
document.getElementById('url-go').onclick=()=>navigate(urlBar.value)
document.getElementById('btn-back').onclick=()=>{try{webview.goBack()}catch(e){}}
document.getElementById('btn-fwd').onclick=()=>{try{webview.goForward()}catch(e){}}
document.getElementById('btn-reload').onclick=()=>{try{webview.reload()}catch(e){}}
document.getElementById('btn-home').onclick=()=>showHome()
document.getElementById('home-search').addEventListener('keydown',e=>{if(e.key==='Enter')navigate(document.getElementById('home-search').value)})
document.getElementById('home-search-btn').onclick=()=>navigate(document.getElementById('home-search').value)
document.querySelectorAll('.quick-btn').forEach(btn=>btn.onclick=()=>createTab(btn.dataset.url))

webview.addEventListener('did-navigate',e=>{
  if(e.url==='about:blank'||e.url==='') return
  urlBar.value=e.url; updateActiveTab(e.url,e.url)
})
webview.addEventListener('did-navigate-in-page',e=>{
  if(!e.isMainFrame) return
  if(e.url==='about:blank'||e.url==='') return
  urlBar.value=e.url; updateActiveTab(e.url,e.url)
})
webview.addEventListener('page-title-updated',e=>updateActiveTab(webview.src,e.title))
webview.addEventListener('did-start-loading',()=>document.getElementById('btn-reload').textContent='✕')
webview.addEventListener('did-stop-loading', ()=>document.getElementById('btn-reload').textContent='↻')

// Popups de OAuth (Google, Pinterest, Discord, etc.) abrem em nova aba no Lumina
webview.addEventListener('new-window', e => {
  const url = e.url
  if(!url || url === 'about:blank') return
  // Abre como nova aba no browser
  createTab(url)
})

// Recebe pedido do main process pra abrir nova aba (vindo de setWindowOpenHandler)
ipcRenderer.on('open-new-tab', (e, url) => {
  if(url && url !== 'about:blank') createTab(url)
})

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if(e.ctrlKey) {
    if(e.key==='t')      { e.preventDefault(); createTab() }
    else if(e.key==='w') { e.preventDefault(); closeTab(activeTabId) }
    else if(e.key==='l') { e.preventDefault(); urlBar.focus(); urlBar.select() }
    else if(e.key==='r') { e.preventDefault(); try{webview.reload()}catch(ex){} }
    else if(e.key==='h') { e.preventDefault(); togglePanel('panel-history') }
    else if(e.key==='d') { e.preventDefault(); addBookmark() }
    else if(e.key==='i') { e.preventDefault(); createTab(null,'Nova guia',true) }
    else if(e.key==='f') { e.preventDefault(); toggleFocus() }
    else if(e.key==='Tab') {
      e.preventDefault()
      const idx=tabs.findIndex(t=>t.id===activeTabId)
      switchTab(tabs[(idx+1)%tabs.length].id)
    }
  }
})

// ── PANELS ───────────────────────────────────────────────────────────────────
function togglePanel(id) {
  const p=document.getElementById(id), was=p.classList.contains('hidden')
  document.querySelectorAll('.panel').forEach(x=>x.classList.add('hidden'))
  if(was) p.classList.remove('hidden')
}
document.getElementById('btn-jarvis').onclick  = ()=>togglePanel('panel-jarvis')
document.getElementById('btn-system').onclick  = ()=>{togglePanel('panel-system');refreshSystem()}
document.getElementById('btn-spotify').onclick = ()=>{togglePanel('panel-spotify');initSpotify()}
document.getElementById('btn-weather').onclick = ()=>{togglePanel('panel-weather');initWeather()}
document.getElementById('btn-settings').onclick= ()=>togglePanel('panel-settings')
document.getElementById('btn-bookmarks').onclick=()=>{togglePanel('panel-bookmarks');renderBookmarks()}
document.getElementById('btn-history').onclick = ()=>{togglePanel('panel-history');renderHistory()}
document.getElementById('btn-incognito').onclick=()=>createTab(null,'Nova guia',true)
document.getElementById('btn-focus').onclick   = ()=>toggleFocus()
document.getElementById('btn-summarize').onclick= ()=>summarizePage()
document.querySelectorAll('.panel-close').forEach(btn=>btn.onclick=()=>btn.closest('.panel').classList.add('hidden'))

// ── FOCUS MODE ────────────────────────────────────────────────────────────────
let focusMode = false
function toggleFocus() {
  focusMode = !focusMode
  document.getElementById('titlebar').classList.toggle('hidden', focusMode)
  document.getElementById('navbar').classList.toggle('hidden', focusMode)
  document.getElementById('content-area').style.height = focusMode ? '100vh' : ''
  document.getElementById('btn-focus').style.color = focusMode ? 'var(--accent)' : ''
  if(focusMode) toast('🎯 Modo foco ativado — Ctrl+F para sair','info')
}

// ── BOOKMARKS ─────────────────────────────────────────────────────────────────
function addBookmark() {
  const tab=tabs.find(t=>t.id===activeTabId)
  if(!tab||!tab.url) return
  if(bookmarks.find(b=>b.url===tab.url)) { toast('Já está nos favoritos','info'); return }
  bookmarks.unshift({url:tab.url, title:tab.title||tab.url, time:Date.now()})
  saveJSON(BMARKS,bookmarks)
  toast('⭐ Adicionado aos favoritos!','success')
  document.getElementById('btn-bookmark-star').textContent='⭐'
}
function removeBookmark(url) {
  bookmarks = bookmarks.filter(b=>b.url!==url)
  saveJSON(BMARKS,bookmarks)
  renderBookmarks()
  toast('Favorito removido','info')
}
function renderBookmarks() {
  const list=document.getElementById('bookmarks-list')
  if(!bookmarks.length) { list.innerHTML='<div class="empty-state">Nenhum favorito ainda.<br>Ctrl+D para adicionar.</div>'; return }
  list.innerHTML = bookmarks.map(b=>`
    <div class="hist-item" onclick="navigate('${b.url.replace(/'/g,"\\'")}')">
      <img class="hist-favicon" src="${tryOrigin(b.url)}/favicon.ico" onerror="this.style.display='none'">
      <div class="hist-info"><div class="hist-title">${(b.title||b.url).slice(0,40)}</div><div class="hist-url">${b.url.slice(0,50)}</div></div>
      <button class="hist-del" onclick="event.stopPropagation();removeBookmark('${b.url.replace(/'/g,"\\'")}')">✕</button>
    </div>`).join('')
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const list=document.getElementById('history-list')
  if(!history.length) { list.innerHTML='<div class="empty-state">Nenhum histórico ainda.</div>'; return }
  list.innerHTML = history.slice(0,100).map(h=>`
    <div class="hist-item" onclick="navigate('${h.url.replace(/'/g,"\\'")}')">
      <img class="hist-favicon" src="${tryOrigin(h.url)}/favicon.ico" onerror="this.style.display='none'">
      <div class="hist-info"><div class="hist-title">${(h.title||h.url).slice(0,40)}</div><div class="hist-url">${new Date(h.time).toLocaleString('pt-BR')}</div></div>
    </div>`).join('')
}
document.getElementById('clear-history').onclick = () => {
  history=[]; saveJSON(HIST,[]); renderHistory(); toast('Histórico limpo','info')
}

function tryOrigin(url) {
  try { return new URL(url).origin } catch(e) { return '' }
}

// ── SUMMARIZE PAGE ────────────────────────────────────────────────────────────
async function summarizePage() {
  const tab=tabs.find(t=>t.id===activeTabId)
  if(!tab||!tab.url||!tab.url.startsWith('http')) { toast('Abra um site para resumir','info'); return }
  togglePanel('panel-jarvis')
  appendMsg('lumina',`Resumindo "${tab.title||tab.url}"...`,'⚡ JARVIS')
  try {
    const res  = await fetch(`${BACKEND}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`Por favor, faça um resumo conciso e informativo desta página: ${tab.url} — Título: "${tab.title||''}"`})})
    const data = await res.json()
    appendMsg('lumina',data.reply,'⚡ JARVIS')
  } catch(e) { appendMsg('lumina','Erro ao resumir.','⚡ JARVIS') }
}

// ════════════════════════════════════════════════════════════════════
// ── JARVIS MULTI-CHAT ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
const chatMessages  = document.getElementById('chat-messages')
const chatInput     = document.getElementById('chat-input')
const chatSend      = document.getElementById('chat-send')
const convList      = document.getElementById('conversations-list')
const titleDisplay  = document.getElementById('chat-title-display')
const titleInput    = document.getElementById('chat-title-input')
const CHATS_FILE    = path.join(os.homedir(), '.lumina', 'chats.json')

let conversations = loadJSON(CHATS_FILE, [])
let activeConvId  = null

function convIcon(title) {
  const t = title.toLowerCase()
  if(t.includes('game')||t.includes('jogo')||t.includes('roblox')||t.includes('minecraft')) return '🎮'
  if(t.includes('estud')||t.includes('study')||t.includes('escola')) return '📚'
  if(t.includes('código')||t.includes('code')||t.includes('program')) return '💻'
  if(t.includes('música')||t.includes('music')||t.includes('spotify')) return '🎵'
  if(t.includes('filme')||t.includes('movie')||t.includes('série')) return '🎬'
  return '💬'
}

function saveChats() { saveJSON(CHATS_FILE, conversations) }

function createConversation(title='Nova conversa') {
  const conv = { id:Date.now(), title, messages:[], created:Date.now(), updated:Date.now() }
  conversations.unshift(conv)
  saveChats()
  return conv
}

function getActiveConv() { return conversations.find(c => c.id === activeConvId) }

function switchConversation(id) {
  activeConvId = id
  renderConversationList()
  renderMessages()
  const conv = getActiveConv()
  if(conv) { titleDisplay.textContent = conv.title; titleInput.value = conv.title }
}

function renderConversationList() {
  convList.innerHTML = conversations.map(c => `
    <div class="conv-item ${c.id===activeConvId?'active':''}" onclick="switchConversation(${c.id})">
      <span class="conv-icon">${convIcon(c.title)}</span>
      <div class="conv-info">
        <span class="conv-title">${c.title}</span>
        <span class="conv-preview">${c.messages.length?(c.messages[c.messages.length-1]?.content||'').slice(0,28):'Sem mensagens'}</span>
      </div>
      <button class="conv-del" onclick="event.stopPropagation();deleteConversation(${c.id})">✕</button>
    </div>`).join('')
}

function renderMessages() {
  chatMessages.innerHTML = ''
  const conv = getActiveConv()
  if(!conv) return
  if(!conv.messages.length) { appendMsg('lumina','Olá, sir. Nova conversa iniciada. Como posso ajudar?','⚡ JARVIS'); return }
  conv.messages.forEach(m => {
    if(m.role==='user') appendMsg('you', m.content)
    else appendMsg('lumina', m.content, '⚡ JARVIS')
  })
}

function deleteConversation(id) {
  conversations = conversations.filter(c => c.id !== id)
  saveChats()
  if(activeConvId === id) {
    if(conversations.length) switchConversation(conversations[0].id)
    else { const c=createConversation(); switchConversation(c.id) }
  } else renderConversationList()
}

if(!conversations.length) {
  const c = createConversation('Geral'); activeConvId = c.id
} else { activeConvId = conversations[0].id }
renderConversationList()
renderMessages()

document.getElementById('new-chat-btn').onclick = () => {
  const c = createConversation(); switchConversation(c.id); chatInput.focus()
}
document.getElementById('clear-all-chats-btn').onclick = () => {
  if(!confirm('Limpar todas as conversas?')) return
  conversations = []
  const c = createConversation('Geral'); switchConversation(c.id)
  toast('🗑 Conversas limpas','info')
}

titleDisplay.ondblclick = startEditTitle
function startEditTitle() {
  titleDisplay.style.display='none'; titleInput.style.display='block'
  titleInput.value=titleDisplay.textContent; titleInput.focus(); titleInput.select()
}
function finishEditTitle() {
  const t = titleInput.value.trim() || 'Nova conversa'
  titleDisplay.textContent=t; titleDisplay.style.display='block'; titleInput.style.display='none'
  const conv = getActiveConv()
  if(conv) { conv.title=t; saveChats(); renderConversationList() }
}
titleInput.onblur    = finishEditTitle
titleInput.onkeydown = e => { if(e.key==='Enter') finishEditTitle() }

document.getElementById('export-chat-btn').onclick = () => {
  const conv = getActiveConv(); if(!conv) return
  const text = conv.messages.map(m=>`[${m.role==='user'?'Você':'JARVIS'}]\n${m.content}`).join('\n---\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([`# ${conv.title}\n\n${text}`],{type:'text/plain'}))
  a.download = `jarvis-${Date.now()}.txt`; a.click()
  toast('💾 Exportado!','success')
}

function appendMsg(type, text, label='') {
  const div=document.createElement('div'); div.className=`msg msg-${type}`
  if(label){const l=document.createElement('div');l.className='msg-label';l.textContent=label;div.appendChild(l)}
  const t=document.createElement('div');t.className='msg-text';t.textContent=text;div.appendChild(t)
  chatMessages.appendChild(div); chatMessages.scrollTop=chatMessages.scrollHeight
  return div
}

function appendTyping() {
  const div=document.createElement('div'); div.className='msg msg-lumina'; div.id='typing-indicator'
  div.innerHTML='<div class="msg-label">⚡ JARVIS</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>'
  chatMessages.appendChild(div); chatMessages.scrollTop=chatMessages.scrollHeight
  return div
}

async function sendChat() {
  const q=chatInput.value.trim(); if(!q) return
  chatInput.value=''; chatSend.textContent='...'; chatSend.disabled=true
  const conv=getActiveConv(); if(!conv) return
  conv.messages.push({role:'user',content:q}); conv.updated=Date.now(); saveChats()
  appendMsg('you',q)
  const typing=appendTyping()
  try {
    const url=SERVER_URL?`${SERVER_URL}/chat`:`${BACKEND}/chat`
    const res=await fetch(url,{method:'POST',headers:authHeaders(),body:JSON.stringify({message:q,history:conv.messages.slice(-20)})})
    const data=await res.json()
    typing.remove()
    const reply=data.reply||'Sem resposta.'
    conv.messages.push({role:'assistant',content:reply}); conv.updated=Date.now(); saveChats()
    appendMsg('lumina',reply,'⚡ JARVIS')
    if(conv.messages.length===2&&conv.title==='Nova conversa') autoTitle(conv,q)
    if(data.needs_key){togglePanel('panel-settings');toast('⚠ Configure sua Groq API Key','error',5000)}
  } catch(e){typing.remove();appendMsg('lumina','Sistemas offline.','⚡ JARVIS')}
  renderConversationList()
  chatSend.textContent='SEND'; chatSend.disabled=false
}

async function autoTitle(conv, firstMsg) {
  try {
    const url=SERVER_URL?`${SERVER_URL}/chat`:`${BACKEND}/chat`
    const res=await fetch(url,{method:'POST',headers:authHeaders(),body:JSON.stringify({message:`Give a short title (max 4 words, no quotes) for: "${firstMsg}". Reply ONLY with the title.`,history:[]})})
    const data=await res.json()
    if(data.reply&&!data.needs_key){
      conv.title=data.reply.replace(/['"]/g,'').slice(0,30)
      titleDisplay.textContent=conv.title; saveChats(); renderConversationList()
    }
  } catch(e){}
}

chatSend.onclick=sendChat
chatInput.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()})

// ── SYSTEM ───────────────────────────────────────────────────────────────────
const CIRC=2*Math.PI*24
function setRing(id,pct) {
  const ring=document.getElementById(`${id}-ring`)
  ring.style.strokeDashoffset=CIRC-(pct/100)*CIRC
  ring.style.stroke=pct>85?'#ff4455':pct>60?'#ffaa00':'var(--accent)'
}
async function refreshSystem() {
  try {
    const d=await fetch(`${BACKEND}/system`).then(r=>r.json())
    setRing('cpu',d.cpu);  document.getElementById('cpu-val').textContent=`${d.cpu}%`
    setRing('ram',d.ram);  document.getElementById('ram-val').textContent=`${d.ram}%`
    setRing('disk',d.disk);document.getElementById('disk-val').textContent=`${d.disk}%`
    document.getElementById('temp-val').textContent=d.temp?`${d.temp}°C`:'N/A'
    document.getElementById('game-val').textContent=d.game||'Nenhum'
    document.getElementById('uptime-val').textContent=d.uptime||'--'
    document.getElementById('h-cpu').textContent=`${d.cpu}%`
    document.getElementById('h-ram').textContent=`${d.ram}%`
    document.getElementById('h-temp').textContent=d.temp?`${d.temp}°C`:'--'
    document.getElementById('h-game').textContent=d.game||'--'
  } catch(e){}
}
setInterval(refreshSystem,3000); refreshSystem()

// ── CLOCK ─────────────────────────────────────────────────────────────────────
function updateClock(){
  const now=new Date()
  const t=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const d=now.toLocaleDateString('pt-BR',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
  document.getElementById('home-time').textContent=`${t}  ·  ${d}`.toUpperCase()
}
setInterval(updateClock,1000); updateClock()

// ── SPOTIFY ──────────────────────────────────────────────────────────────────
let spotifyOk=false
async function initSpotify(){
  try {
    const d=await fetch(`${BACKEND}/spotify/status`).then(r=>r.json())
    if(d.configured){spotifyOk=true;document.getElementById('spotify-setup').classList.add('hidden');document.getElementById('spotify-player').classList.remove('hidden');refreshSpotify()}
    else{document.getElementById('spotify-setup').classList.remove('hidden');document.getElementById('spotify-player').classList.add('hidden')}
  } catch(e){document.getElementById('spotify-setup').classList.remove('hidden')}
}
document.getElementById('sp-save-btn').onclick=async()=>{
  const cid=document.getElementById('sp-client-id').value.trim(),sec=document.getElementById('sp-client-secret').value.trim()
  if(!cid||!sec) return
  await fetch(`${BACKEND}/spotify/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:sec})})
  initSpotify()
}
document.getElementById('sp-link').onclick=e=>{e.preventDefault();createTab('https://developer.spotify.com/dashboard')}
async function refreshSpotify(){
  if(!spotifyOk) return
  try {
    const d=await fetch(`${BACKEND}/spotify/current`).then(r=>r.json())
    document.getElementById('sp-track').textContent=d.track||'--'
    document.getElementById('sp-artist').textContent=d.artist||'--'
    if(d.art) document.getElementById('sp-art').src=d.art
    document.getElementById('sp-play').textContent=d.playing?'⏸':'▶'
    if(d.duration>0){document.getElementById('sp-progress-fill').style.width=`${(d.progress/d.duration)*100}%`;document.getElementById('sp-cur').textContent=fmt(d.progress);document.getElementById('sp-dur').textContent=fmt(d.duration)}
  } catch(e){}
}
async function spAction(a){try{await fetch(`${BACKEND}/spotify/${a}`,{method:'POST'})}catch(e){};setTimeout(refreshSpotify,500)}
document.getElementById('sp-play').onclick=()=>spAction('toggle')
document.getElementById('sp-prev').onclick=()=>spAction('prev')
document.getElementById('sp-next').onclick=()=>spAction('next')
document.getElementById('sp-volume').oninput=async e=>{try{await fetch(`${BACKEND}/spotify/volume`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({volume:parseInt(e.target.value)})})}catch(ex){}}
function fmt(ms){const s=Math.floor(ms/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
setInterval(refreshSpotify,5000)

// ── WEATHER ──────────────────────────────────────────────────────────────────
let locGranted=false
function initWeather(){
  if(locGranted){fetchWeather();return}
  document.getElementById('weather-permission').classList.remove('hidden')
  document.getElementById('weather-data').classList.add('hidden')
}
document.getElementById('allow-location').onclick=()=>{
  navigator.geolocation.getCurrentPosition(pos=>{
    locGranted=true
    document.getElementById('weather-permission').classList.add('hidden')
    document.getElementById('weather-data').classList.remove('hidden')
    fetchWeatherCoords(pos.coords.latitude,pos.coords.longitude)
  },()=>fetchWeather())
}
document.getElementById('deny-location').onclick=()=>document.getElementById('weather-permission').classList.add('hidden')
async function fetchWeather(){try{updateWeatherUI(await fetch(`${BACKEND}/weather`).then(r=>r.json()))}catch(e){}}
async function fetchWeatherCoords(lat,lon){try{updateWeatherUI(await fetch(`${BACKEND}/weather?lat=${lat}&lon=${lon}`).then(r=>r.json()))}catch(e){}}
const WX={'clear':'☀️','clouds':'☁️','rain':'🌧️','drizzle':'🌦️','thunderstorm':'⛈️','snow':'❄️','mist':'🌫️','fog':'🌫️','haze':'🌫️'}
function updateWeatherUI(d){
  const desc=(d.description||'').toLowerCase()
  const icon=Object.entries(WX).find(([k])=>desc.includes(k))?.[1]||'🌡️'
  document.getElementById('weather-icon').textContent=icon
  document.getElementById('weather-temp').textContent=`${Math.round(d.temp||0)}°C`
  document.getElementById('weather-desc').textContent=d.description||'--'
  document.getElementById('w-city').textContent=d.city||'--'
  document.getElementById('w-feels').textContent=`${Math.round(d.feels_like||0)}°C`
  document.getElementById('w-humidity').textContent=`${d.humidity||0}%`
  document.getElementById('w-wind').textContent=`${d.wind_speed||0} km/h`
  document.getElementById('w-coords').textContent=d.lat?`${d.lat.toFixed(4)}, ${d.lon.toFixed(4)}`:'--'
  if(d.lat&&d.lon) document.getElementById('map-frame').src=`https://www.openstreetmap.org/export/embed.html?bbox=${d.lon-0.05},${d.lat-0.05},${d.lon+0.05},${d.lat+0.05}&layer=mapnik&marker=${d.lat},${d.lon}`
}
setInterval(()=>{if(locGranted)fetchWeather()},60000)

// ── SETTINGS ─────────────────────────────────────────────────────────────────
document.getElementById('cfg-apikey-save').onclick=async()=>{
  const k=document.getElementById('cfg-apikey').value.trim(); if(!k) return
  try {
    await fetch(`${BACKEND}/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:k})})
    toast('✅ API Key salva!','success')
    document.getElementById('cfg-apikey-save').textContent='✓'
    setTimeout(()=>document.getElementById('cfg-apikey-save').textContent='Salvar',2000)
  } catch(e){}
}
document.getElementById('groq-link').onclick=e=>{e.preventDefault();createTab('https://console.groq.com/keys')}
document.getElementById('cfg-color').oninput=e=>applyAccent(e.target.value)
document.getElementById('cfg-color-save').onclick=()=>{saveJSON(UI_CFG,uiCfg);initBg();toast('🎨 Tema aplicado!','success')}
document.querySelectorAll('.color-dot').forEach(dot=>dot.onclick=()=>{applyAccent(dot.dataset.color);document.getElementById('cfg-color').value=dot.dataset.color;initBg()})
document.querySelectorAll('.bg-opt').forEach(opt=>{
  opt.onclick=()=>{document.querySelectorAll('.bg-opt').forEach(o=>o.classList.remove('active'));opt.classList.add('active');bgMode=opt.dataset.bg;uiCfg.bg=bgMode;initBg();saveJSON(UI_CFG,uiCfg)}
  if(opt.dataset.bg===bgMode) opt.classList.add('active')
})
document.getElementById('cfg-wallpaper-btn').onclick=()=>document.getElementById('cfg-wallpaper-input').click()
document.getElementById('cfg-wallpaper-input').onchange=e=>{
  const file=e.target.files[0]; if(!file) return
  uiCfg.wallpaper=file.path; applyWallpaper(file.path,uiCfg.opacity)
  const prev=document.getElementById('wallpaper-preview')
  prev.style.backgroundImage=`url('${file.path.replace(/\\/g,"\\\\")}')`; prev.style.display='block'
  saveJSON(UI_CFG,uiCfg); toast('🖼 Wallpaper aplicado!','success')
}
document.getElementById('cfg-wallpaper-clear').onclick=()=>{uiCfg.wallpaper=null;applyWallpaper(null);document.getElementById('wallpaper-preview').style.display='none';saveJSON(UI_CFG,uiCfg)}
document.getElementById('cfg-opacity').oninput=e=>{uiCfg.opacity=parseInt(e.target.value);if(uiCfg.wallpaper)applyWallpaper(uiCfg.wallpaper,uiCfg.opacity);saveJSON(UI_CFG,uiCfg)}
document.getElementById('cfg-opacity').value=uiCfg.opacity||30
document.querySelectorAll('.search-opt').forEach(opt=>{
  opt.onclick=()=>{document.querySelectorAll('.search-opt').forEach(o=>o.classList.remove('active'));opt.classList.add('active');uiCfg.engine=opt.dataset.engine;saveJSON(UI_CFG,uiCfg)}
  if(opt.dataset.engine===(uiCfg.engine||'google')) opt.classList.add('active')
})
document.getElementById('cfg-startup').onclick=async()=>{
  const on=await ipcRenderer.invoke('is-startup')
  ipcRenderer.send('set-startup',!on)
  toast(on?'Startup desativado':'✅ Startup ativado!',on?'info':'success')
}
fetch(`${BACKEND}/config`).then(r=>r.json()).then(d=>{if(d.api_key)document.getElementById('cfg-apikey').value='••••••••••••'}).catch(()=>{})

// ── INIT ─────────────────────────────────────────────────────────────────────
createTab()

// ── SERVER URL + AUTH TOKEN ───────────────────────────────────────────────────
let SERVER_URL = ''
let authToken  = ''
let currentUser = null

// Pega a URL do servidor e token do main process
ipcRenderer.invoke('get-server-url').then(url => { SERVER_URL = url })
ipcRenderer.on('user-info', (e, user) => {
  currentUser = user
  if(user) {
    // Mostra avatar e nome do usuário nas configurações
    document.getElementById('user-avatar').src  = user.avatar || ''
    document.getElementById('user-name').textContent   = user.username || 'Usuário'
    document.getElementById('user-email').textContent  = user.email || ''
    document.getElementById('user-avatar').style.display = user.avatar ? 'block' : 'none'
  }
  // Carrega token salvo
  try {
    const cfg = JSON.parse(require('fs').readFileSync(
      require('path').join(require('os').homedir(), '.lumina', 'config.json'), 'utf8'
    ))
    authToken = cfg.token || ''
    if(cfg.groq_key) document.getElementById('cfg-apikey').value = '••••••••••••'
  } catch(e) {}
})

// ── HELPERS DE REQUEST COM AUTH ───────────────────────────────────────────────
function getGroqKey() {
  try {
    const cfg = JSON.parse(require('fs').readFileSync(
      require('path').join(require('os').homedir(), '.lumina', 'config.json'), 'utf8'
    ))
    return cfg.groq_key || ''
  } catch(e) { return '' }
}

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'X-Groq-Key': getGroqKey(),
    ...extra
  }
}

// ── OVERRIDE SEND CHAT pra usar servidor remoto ───────────────────────────────
// (substitui a função sendChat original pra usar SERVER_URL em vez de BACKEND)
const _origSendChat = sendChat
window._sendChatRemote = async function() {
  const q = chatInput.value.trim(); if(!q) return
  chatInput.value=''; chatSend.textContent='...'; chatSend.disabled=true
  appendMsg('you', q)
  const loading = appendMsg('loading','⟳ processando...')
  try {
    const url = SERVER_URL ? `${SERVER_URL}/chat` : `${BACKEND}/chat`
    const res  = await fetch(url, {
      method:'POST',
      headers: authHeaders(),
      body: JSON.stringify({message:q})
    })
    const data = await res.json()
    loading.remove()
    if(data.needs_key) {
      appendMsg('lumina', data.reply, '⚡ JARVIS')
      togglePanel('panel-settings')
      toast('⚠ Configure sua Groq API Key nas configurações', 'error', 5000)
    } else {
      appendMsg('lumina', data.reply, '⚡ JARVIS')
    }
  } catch(e) { loading.remove(); appendMsg('lumina','Servidor offline.','⚡ JARVIS') }
  chatSend.textContent='SEND'; chatSend.disabled=false
}
// Substitui o bind do botão
chatSend.onclick = window._sendChatRemote
chatInput.onkeydown = e => { if(e.key==='Enter') window._sendChatRemote() }

// ── SALVA GROQ KEY LOCALMENTE ─────────────────────────────────────────────────
document.getElementById('cfg-apikey-save').onclick = () => {
  const k = document.getElementById('cfg-apikey').value.trim()
  if(!k || k === '••••••••••••') return
  try {
    const cfgPath = require('path').join(require('os').homedir(), '.lumina', 'config.json')
    const cfg = JSON.parse(require('fs').readFileSync(cfgPath,'utf8'))
    cfg.groq_key = k
    require('fs').writeFileSync(cfgPath, JSON.stringify(cfg,null,2))
    document.getElementById('cfg-apikey').value = '••••••••••••'
    toast('✅ API Key salva localmente!', 'success')
  } catch(e) { toast('Erro ao salvar API Key', 'error') }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout')?.addEventListener('click', () => {
  ipcRenderer.send('logout')
})

// ── ULTRON POLLING (usa SERVER_URL) ───────────────────────────────────────────
function pollUltron() {
  if(!SERVER_URL) { setTimeout(pollUltron, 5000); return }
  fetch(`${SERVER_URL}/ultron/status`)
    .then(r=>r.json())
    .then(data => {
      const was = _is_ultron_local()
      _set_ultron(data.active, data.ends_at)
      if(data.active && !was) overlayRef?._apply_ultron_theme?.()
      else if(!data.active && was) overlayRef?._apply_jarvis_theme?.()
    })
    .catch(()=>{})
    .finally(()=>setTimeout(pollUltron, 10000))
}

let _ultronActive=false, _ultronEnd=0
function _is_ultron_local(){ return _ultronActive && Date.now()/1000 < _ultronEnd }
function _set_ultron(active, endsAt){ _ultronActive=active; _ultronEnd=endsAt||0 }
pollUltron()

// ── PROCESSOS ─────────────────────────────────────────────────────────────────
document.getElementById('btn-processes').onclick = () => {
  togglePanel('panel-processes')
  refreshProcesses()
}

async function refreshProcesses() {
  try {
    const procs = await fetch(`${BACKEND}/processes`).then(r=>r.json())
    const list  = document.getElementById('processes-list')
    list.innerHTML = procs.map(p => `
      <div class="hist-item">
        <div class="hist-info">
          <div class="hist-title">${p.name||'--'} <span style="color:var(--text-dim);font-size:10px">PID ${p.pid}</span></div>
          <div class="hist-url">CPU: ${(p.cpu_percent||0).toFixed(1)}%  RAM: ${(p.memory_percent||0).toFixed(1)}%  ${p.status||''}</div>
        </div>
        <button class="hist-del" onclick="killProcess(${p.pid},'${(p.name||'').replace(/'/g,'')}')" title="Encerrar">✕</button>
      </div>`).join('')
  } catch(e) {}
}

async function killProcess(pid, name) {
  if(!confirm(`Encerrar "${name}"?`)) return
  try {
    await fetch(`${BACKEND}/process/kill`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pid})})
    toast(`Processo ${name} encerrado`,'info')
    refreshProcesses()
  } catch(e) { toast('Erro ao encerrar processo','error') }
}

setInterval(()=>{ if(!document.getElementById('panel-processes').classList.contains('hidden')) refreshProcesses() }, 3000)

// ── TRADUTOR ──────────────────────────────────────────────────────────────────
document.getElementById('btn-translate').onclick = () => togglePanel('panel-translate')

document.querySelectorAll('.lang-opt').forEach(opt => {
  opt.onclick = () => {
    const tab = tabs.find(t=>t.id===activeTabId)
    if(!tab||!tab.url||!tab.url.startsWith('http')) {
      toast('Abra um site para traduzir','info'); return
    }
    const lang = opt.dataset.lang
    const translateUrl = `https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent(tab.url)}`
    navigate(translateUrl)
    togglePanel('panel-translate')
    toast(`🌐 Traduzindo para ${opt.textContent}...`,'info')
  }
})

// ── MODO LEITURA ──────────────────────────────────────────────────────────────
document.getElementById('btn-reader').onclick = toggleReaderMode

let readerActive = false

function toggleReaderMode() {
  if(readerActive) {
    document.getElementById('reader-overlay').classList.remove('active')
    readerActive = false
    document.getElementById('btn-reader').style.color = ''
    return
  }

  const tab = tabs.find(t=>t.id===activeTabId)
  if(!tab||!tab.url||!tab.url.startsWith('http')) {
    toast('Abra um site para usar o modo leitura','info'); return
  }

  // Injeta script no webview pra extrair texto limpo
  webview.executeJavaScript(`
    (function() {
      const article = document.querySelector('article') ||
                      document.querySelector('main') ||
                      document.querySelector('.content') ||
                      document.querySelector('.post') ||
                      document.body
      const h1 = document.querySelector('h1')?.innerText || document.title
      const ps = Array.from(article.querySelectorAll('p,h1,h2,h3,blockquote'))
                      .map(el => {
                        const tag = el.tagName.toLowerCase()
                        if(tag==='h1'||tag==='h2'||tag==='h3') return '<'+tag+'>'+el.innerText+'</'+tag+'>'
                        return '<p>'+el.innerText+'</p>'
                      }).join('')
      return {title: h1, content: ps}
    })()
  `).then(data => {
    if(!data||!data.content) { toast('Não foi possível extrair o conteúdo','info'); return }
    const overlay = document.getElementById('reader-overlay')
    overlay.innerHTML = `
      <button id="reader-close" onclick="toggleReaderMode()">✕ Fechar leitura</button>
      <div id="reader-content">
        <h1 style="font-family:var(--font);color:var(--accent);margin-bottom:32px">${data.title||''}</h1>
        ${data.content}
      </div>`
    overlay.classList.add('active')
    readerActive = true
    document.getElementById('btn-reader').style.color = 'var(--accent)'
    toast('📖 Modo leitura ativado','success')
  }).catch(() => toast('Erro ao ativar modo leitura','error'))
}

// Cria o overlay de leitura se não existir
if(!document.getElementById('reader-overlay')) {
  const el = document.createElement('div')
  el.id = 'reader-overlay'
  document.getElementById('content-area').appendChild(el)
}

// ════════════════════════════════════════════════════════════════════
// ── MODO GAMING ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
const GAME_THEMES = {
  'Roblox':              { accent:'#ff4444', name:'ROBLOX' },
  'Minecraft':           { accent:'#4CAF50', name:'MINECRAFT' },
  'Valorant':            { accent:'#ff4655', name:'VALORANT' },
  'CS2':                 { accent:'#f59e0b', name:'CS2' },
  'GTA V':               { accent:'#00b4d8', name:'GTA V' },
  'League of Legends':   { accent:'#c89b3c', name:'LEAGUE' },
  'Fortnite':            { accent:'#7c3aed', name:'FORTNITE' },
  'Marvel Rivals':       { accent:'#ef4444', name:'MARVEL RIVALS' },
  'Terraria':            { accent:'#84cc16', name:'TERRARIA' },
  'Garry\'s Mod':        { accent:'#94a3b8', name:'GMOD' },
  'Helldivers 2':        { accent:'#f97316', name:'HELLDIVERS 2' },
  'Red Dead Redemption 2':{ accent:'#dc2626', name:'RDR2' },
  'Five Nights at Freddy\'s':{ accent:'#7c2d12', name:'FNAF' },
}

let currentGameTheme = null

async function checkGamingMode() {
  try {
    const d = await fetch(`${BACKEND}/system`).then(r=>r.json())
    const game = d.game
    if(game && GAME_THEMES[game] && currentGameTheme !== game) {
      currentGameTheme = game
      const theme = GAME_THEMES[game]
      applyAccent(theme.accent)
      initBg()
      toast(`🎮 ${theme.name} detectado — tema atualizado!`, 'success', 4000)
      // Mostra badge de jogo na navbar
      document.getElementById('gaming-badge').textContent = `🎮 ${theme.name}`
      document.getElementById('gaming-badge').classList.remove('hidden')
    } else if(!game && currentGameTheme) {
      currentGameTheme = null
      applyAccent(uiCfg.accent || '#00BFFF')
      initBg()
      document.getElementById('gaming-badge').classList.add('hidden')
      toast('🎮 Jogo fechado — tema restaurado', 'info')
    }
  } catch(e) {}
}
setInterval(checkGamingMode, 5000)
checkGamingMode()

// ════════════════════════════════════════════════════════════════════
// ── GERENCIADOR DE SENHAS ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
const PASS_FILE = require('path').join(require('os').homedir(), '.lumina', 'passwords.enc')
const crypto    = require('crypto')

function getPassKey() {
  // Usa JWT token como base da chave de criptografia — único por usuário
  const base = authToken || 'lumina_default_key'
  return crypto.createHash('sha256').update(base).digest()
}

function encryptPasswords(data) {
  const iv  = crypto.randomBytes(16)
  const key = getPassKey()
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const enc  = Buffer.concat([cipher.update(JSON.stringify(data),'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

function decryptPasswords(str) {
  try {
    const [ivHex, encHex] = str.split(':')
    const iv  = Buffer.from(ivHex, 'hex')
    const key = getPassKey()
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex,'hex')), decipher.final()])
    return JSON.parse(dec.toString('utf8'))
  } catch(e) { return [] }
}

function loadPasswords() {
  try {
    if(require('fs').existsSync(PASS_FILE))
      return decryptPasswords(require('fs').readFileSync(PASS_FILE,'utf8'))
  } catch(e) {}
  return []
}

function savePasswords(list) {
  require('fs').writeFileSync(PASS_FILE, encryptPasswords(list))
}

document.getElementById('btn-passwords').onclick = () => {
  togglePanel('panel-passwords')
  renderPasswords()
}

function renderPasswords() {
  const list  = loadPasswords()
  const panel = document.getElementById('passwords-list')
  if(!list.length) {
    panel.innerHTML = '<div class="empty-state">Nenhuma senha salva ainda.<br>Clique em + para adicionar.</div>'
    return
  }
  panel.innerHTML = list.map((p,i) => `
    <div class="hist-item">
      <div class="hist-info">
        <div class="hist-title">${p.site||'--'}</div>
        <div class="hist-url">${p.user||''} · ${'•'.repeat(8)}</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="hist-del" onclick="copyPassword(${i})" title="Copiar senha" style="color:var(--accent)">📋</button>
        <button class="hist-del" onclick="deletePassword(${i})" title="Deletar">✕</button>
      </div>
    </div>`).join('')
}

function copyPassword(i) {
  const list = loadPasswords()
  require('electron').clipboard.writeText(list[i].pass || '')
  toast('📋 Senha copiada!', 'success')
}

function deletePassword(i) {
  const list = loadPasswords()
  list.splice(i,1)
  savePasswords(list)
  renderPasswords()
  toast('Senha removida', 'info')
}

document.getElementById('save-password-btn').onclick = () => {
  const site = document.getElementById('pass-site').value.trim()
  const user = document.getElementById('pass-user').value.trim()
  const pass = document.getElementById('pass-pass').value.trim()
  if(!site||!pass) { toast('Preencha site e senha','error'); return }
  const list = loadPasswords()
  list.unshift({site, user, pass, date: Date.now()})
  savePasswords(list)
  document.getElementById('pass-site').value = ''
  document.getElementById('pass-user').value = ''
  document.getElementById('pass-pass').value = ''
  renderPasswords()
  toast('🔐 Senha salva com criptografia!','success')
}

// ════════════════════════════════════════════════════════════════════
// ── ASSISTENTE DE VOZ ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
let recognition = null
let voiceActive  = false

document.getElementById('btn-voice').onclick = toggleVoice

function toggleVoice() {
  if(voiceActive) {
    stopVoice()
  } else {
    startVoice()
  }
}

function startVoice() {
  if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('⚠ Reconhecimento de voz não suportado neste sistema','error'); return
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  recognition = new SR()
  recognition.lang = uiCfg.lang === 'en' ? 'en-US' : 'pt-BR'
  recognition.continuous     = false
  recognition.interimResults = false

  recognition.onstart = () => {
    voiceActive = true
    document.getElementById('btn-voice').style.color    = '#ff4444'
    document.getElementById('btn-voice').style.animation = 'pulse 1s infinite'
    toast('🎙 Ouvindo... Fale com o JARVIS','info', 5000)
  }

  recognition.onresult = e => {
    const transcript = e.results[0][0].transcript
    stopVoice()
    // Abre o chat e manda a mensagem
    document.getElementById('panel-jarvis').classList.remove('hidden')
    document.getElementById('chat-input').value = transcript
    window._sendChatRemote()
  }

  recognition.onerror = e => {
    stopVoice()
    toast(`Erro no microfone: ${e.error}`,'error')
  }

  recognition.onend = () => stopVoice()
  recognition.start()
}

function stopVoice() {
  voiceActive = false
  document.getElementById('btn-voice').style.color     = ''
  document.getElementById('btn-voice').style.animation = ''
  if(recognition) { try{recognition.stop()}catch(e){} ; recognition = null }
}

// ════════════════════════════════════════════════════════════════════
// ── CAPTURA DE TELA COM ANOTAÇÕES ────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
document.getElementById('btn-screenshot').onclick = takeScreenshot

async function takeScreenshot() {
  try {
    // Captura o webview
    const image = await webview.capturePage()
    const dataUrl = image.toDataURL()

    // Abre painel de anotações
    const overlay = document.getElementById('screenshot-overlay')
    const canvas  = document.getElementById('screenshot-canvas')
    const img     = new Image()
    img.onload = () => {
      canvas.width  = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      overlay.classList.add('active')
      initDrawing(canvas, ctx)
    }
    img.src = dataUrl
    toast('📸 Captura feita — use as ferramentas para anotar!','success')
  } catch(e) {
    toast('Abra um site para capturar','info')
  }
}

let drawing=false, drawColor='#ff4444', drawSize=3, drawTool='pen'

function initDrawing(canvas, ctx) {
  canvas.onmousedown = e => { drawing=true; ctx.beginPath(); ctx.moveTo(e.offsetX,e.offsetY) }
  canvas.onmousemove = e => {
    if(!drawing) return
    if(drawTool==='pen') {
      ctx.strokeStyle=drawColor; ctx.lineWidth=drawSize; ctx.lineCap='round'
      ctx.lineTo(e.offsetX,e.offsetY); ctx.stroke()
    } else if(drawTool==='eraser') {
      ctx.clearRect(e.offsetX-10,e.offsetY-10,20,20)
    }
  }
  canvas.onmouseup   = () => drawing=false
  canvas.onmouseleave= () => drawing=false
}

function saveScreenshot() {
  const canvas = document.getElementById('screenshot-canvas')
  const link   = document.createElement('a')
  link.download = `lumina-screenshot-${Date.now()}.png`
  link.href     = canvas.toDataURL()
  link.click()
  toast('💾 Screenshot salvo!','success')
}

function closeScreenshot() {
  document.getElementById('screenshot-overlay').classList.remove('active')
}

// Seletor de cor/ferramenta
document.getElementById('draw-color').oninput = e => drawColor=e.target.value
document.getElementById('draw-size').oninput  = e => drawSize=parseInt(e.target.value)
document.querySelectorAll('.draw-tool').forEach(btn => {
  btn.onclick = () => {
    drawTool = btn.dataset.tool
    document.querySelectorAll('.draw-tool').forEach(b=>b.classList.remove('active'))
    btn.classList.add('active')
  }
})

// ════════════════════════════════════════════════════════════════════
// ── LEGENDAS AO VIVO ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
let captionsWS     = null
let captionsActive = false
let captionsPos    = 'bottom'
let captionsFontSize = 22

document.getElementById('btn-captions').onclick = () => {
  togglePanel('panel-captions')
  loadAudioDevices()
}

async function loadAudioDevices() {
  const sel = document.getElementById('captions-device')
  try {
    const devs = await fetch(`${BACKEND}/captions/devices`).then(r=>r.json())
    if(devs && devs.length) {
      sel.innerHTML = devs.map(d=>`<option value="${d.id}" ${d.loopback?'style="color:var(--accent)"':''}>
        ${d.loopback ? '🔁 ' : ''}${d.name}</option>`).join('')
      // Auto-seleciona primeiro loopback
      const loop = devs.find(d=>d.loopback)
      if(loop) sel.value = loop.id
    } else {
      sel.innerHTML = '<option value="">Nenhum dispositivo — use ID manual abaixo</option>'
    }
  } catch(e) {
    sel.innerHTML = '<option value="">Erro ao listar — use ID manual abaixo</option>'
  }
}

document.getElementById('captions-scan-btn').onclick = loadAudioDevices

document.getElementById('captions-start-btn').onclick = startCaptions

async function startCaptions() {
  const btn    = document.getElementById('captions-start-btn')
  const status = document.getElementById('captions-status')

  btn.textContent = '⏳ Carregando Whisper...'
  btn.disabled    = true
  status.textContent = 'Isso pode levar alguns segundos na primeira vez...'

  try {
    // Pega device ID do select ou do campo manual
    let deviceId = document.getElementById('captions-device').value
    const manualId = document.getElementById('captions-device-manual').value
    if((!deviceId || deviceId === '') && manualId !== '') {
      deviceId = manualId
    }
    const res  = await fetch(`${BACKEND}/captions/start`, {
      method:'POST',
      headers: {'Content-Type':'application/json', 'X-Groq-Key': getGroqKey()},
      body: JSON.stringify({device_id: deviceId !== '' && deviceId != null ? parseInt(deviceId) : null})
    })
    const data = await res.json()

    if(!data.ok) {
      status.textContent = '❌ ' + (data.error || 'Erro ao iniciar')
      btn.textContent = '🎙 Iniciar Legendas'
      btn.disabled    = false
      return
    }

    // Conecta WebSocket
    captionsWS = new WebSocket(`ws://localhost:5678/ws/captions`)

    captionsWS.onopen = () => {
      captionsActive = true
      document.getElementById('captions-overlay').classList.add('active')
      document.getElementById('btn-captions').style.color = '#f59e0b'
      btn.textContent  = '■ Parar Legendas'
      btn.disabled     = false
      btn.onclick      = stopCaptions
      btn.style.background = 'rgba(255,68,85,0.15)'
      btn.style.border     = '1px solid rgba(255,68,85,0.3)'
      btn.style.color      = '#ff4455'
      status.textContent   = '🟢 Legendas ativas — ouvindo...'
      toast('🎙 Legendas ao vivo ativadas!', 'success')
    }

    captionsWS.onmessage = e => {
      const msg = JSON.parse(e.data)
      if(msg.type === 'caption') updateCaption(msg)
    }

    captionsWS.onerror = () => {
      status.textContent = '❌ Erro na conexão'
      stopCaptions()
    }

    captionsWS.onclose = () => {
      if(captionsActive) stopCaptions()
    }

  } catch(err) {
    status.textContent  = '❌ ' + err.message
    btn.textContent     = '🎙 Iniciar Legendas'
    btn.disabled        = false
  }
}

function updateCaption(msg) {
  const orig = document.getElementById('captions-original')
  const tran = document.getElementById('captions-translated')
  const lang = document.getElementById('captions-lang-badge')

  // Animação de entrada
  tran.classList.remove('caption-new')
  void tran.offsetWidth // reflow
  tran.classList.add('caption-new')

  orig.textContent = msg.original  || ''
  tran.textContent = msg.translated || msg.original || ''
  lang.textContent = (msg.lang || 'AUTO').toUpperCase()

  // Ajusta tamanho
  tran.style.fontSize = captionsFontSize + 'px'
}

async function stopCaptions() {
  captionsActive = false
  if(captionsWS) { captionsWS.close(); captionsWS = null }

  try { await fetch(`${BACKEND}/captions/stop`, {method:'POST'}) } catch(e) {}

  document.getElementById('captions-overlay').classList.remove('active')
  document.getElementById('btn-captions').style.color = ''
  document.getElementById('captions-original').textContent  = ''
  document.getElementById('captions-translated').textContent = ''

  const btn = document.getElementById('captions-start-btn')
  btn.textContent  = '🎙 Iniciar Legendas'
  btn.disabled     = false
  btn.onclick      = startCaptions
  btn.style.background = ''
  btn.style.border     = ''
  btn.style.color      = ''
  document.getElementById('captions-status').textContent = ''
  toast('Legendas encerradas', 'info')
}

// Configurações de posição
document.querySelectorAll('[data-pos]').forEach(opt => {
  opt.onclick = () => {
    document.querySelectorAll('[data-pos]').forEach(o=>o.classList.remove('active'))
    opt.classList.add('active')
    captionsPos = opt.dataset.pos
    const overlay = document.getElementById('captions-overlay')
    overlay.className = captionsActive ? `active pos-${captionsPos}` : `pos-${captionsPos}`
  }
})

// Tamanho da fonte
document.getElementById('captions-size').oninput = e => {
  captionsFontSize = parseInt(e.target.value)
  document.getElementById('captions-translated').style.fontSize = captionsFontSize + 'px'
}

// Opacidade do fundo
document.getElementById('captions-opacity').oninput = e => {
  const op = parseInt(e.target.value) / 100
  document.getElementById('captions-box').style.background = `rgba(0,0,0,${op})`
}

// ════════════════════════════════════════════════════════════════════
// ── ZOOM ─────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
let zoomLevel = 1.0
const zoomIndicator = document.getElementById('zoom-indicator')

function setZoom(level) {
  zoomLevel = Math.max(0.25, Math.min(5.0, level))
  try { webview.setZoomFactor(zoomLevel) } catch(e) {
    webview.executeJavaScript(`document.body.style.zoom='${zoomLevel}'`)
  }
  zoomIndicator.textContent = Math.round(zoomLevel * 100) + '%'
  zoomIndicator.classList.add('show')
  clearTimeout(zoomIndicator._t)
  zoomIndicator._t = setTimeout(() => zoomIndicator.classList.remove('show'), 1500)
}

document.addEventListener('keydown', e => {
  if(e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoomLevel + 0.1) }
  if(e.ctrlKey && e.key === '-') { e.preventDefault(); setZoom(zoomLevel - 0.1) }
  if(e.ctrlKey && e.key === '0') { e.preventDefault(); setZoom(1.0) }
})

// ════════════════════════════════════════════════════════════════════
// ── CTRL+F — BUSCA NA PÁGINA ──────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
let findActive = false
document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.key === 'f' && !focusMode) {
    e.preventDefault()
    if(findActive) {
      webview.stopFindInPage('clearSelection')
      findActive = false
      document.getElementById('find-bar')?.remove()
    } else {
      showFindBar()
    }
  }
  if(e.key === 'Escape' && findActive) {
    webview.stopFindInPage('clearSelection')
    findActive = false
    document.getElementById('find-bar')?.remove()
  }
})

function showFindBar() {
  findActive = true
  const bar = document.createElement('div')
  bar.id = 'find-bar'
  bar.style.cssText = `position:fixed;top:calc(var(--titlebar-h) + var(--navbar-h) + 8px);right:16px;z-index:500;background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--glass-border);border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 32px rgba(0,0,0,0.4)`
  bar.innerHTML = `
    <input id="find-input" placeholder="Buscar na página..." style="background:none;border:none;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:200px">
    <span id="find-count" style="font-size:10px;color:var(--text-dim);white-space:nowrap"></span>
    <button onclick="webview.findInPage(document.getElementById('find-input').value,{forward:false})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px">▲</button>
    <button onclick="webview.findInPage(document.getElementById('find-input').value,{forward:true})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px">▼</button>
    <button onclick="webview.stopFindInPage('clearSelection');document.getElementById('find-bar').remove();findActive=false" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px">✕</button>`
  document.body.appendChild(bar)
  const input = document.getElementById('find-input')
  input.focus()
  input.oninput = () => {
    if(input.value) webview.findInPage(input.value)
    else webview.stopFindInPage('clearSelection')
  }
  input.onkeydown = e => { if(e.key==='Enter') webview.findInPage(input.value,{forward:!e.shiftKey}) }
  webview.addEventListener('found-in-page', ev => {
    const el = document.getElementById('find-count')
    if(el) el.textContent = ev.result.activeMatchOrdinal + '/' + ev.result.matches
  })
}

// ════════════════════════════════════════════════════════════════════
// ── DOWNLOAD MANAGER ─────────────────────────────────────────════════
// ════════════════════════════════════════════════════════════════════
const downloadBar = document.getElementById('download-bar')
let downloads = {}

webview.addEventListener('did-start-loading', () => {
  // Intercepta downloads via Electron main
})

ipcRenderer.on('download-started', (e, {id, filename, totalBytes}) => {
  downloads[id] = {filename, total: totalBytes, received: 0}
  renderDownloads()
  downloadBar.classList.add('show')
  toast(`⬇ Baixando: ${filename}`, 'info', 3000)
})

ipcRenderer.on('download-progress', (e, {id, received, total}) => {
  if(downloads[id]) { downloads[id].received = received; downloads[id].total = total }
  renderDownloads()
})

ipcRenderer.on('download-done', (e, {id, filename, path: savePath}) => {
  if(downloads[id]) { downloads[id].done = true; downloads[id].path = savePath }
  renderDownloads()
  toast(`✅ Download completo: ${filename}`, 'success', 5000)
})

function renderDownloads() {
  const items = Object.entries(downloads)
  if(!items.length) { downloadBar.classList.remove('show'); return }
  downloadBar.innerHTML = items.map(([id, dl]) => {
    const pct  = dl.total ? Math.round(dl.received/dl.total*100) : 0
    const size = dl.total ? `${(dl.received/1024/1024).toFixed(1)}/${(dl.total/1024/1024).toFixed(1)}MB` : ''
    return `<div class="download-item">
      <span style="font-size:14px">${dl.done?'✅':'⬇'}</span>
      <div style="flex:1;min-width:0">
        <div class="dl-name">${dl.filename}</div>
        ${!dl.done?`<div class="download-progress"><div class="download-progress-fill" style="width:${pct}%"></div></div>`:''}
      </div>
      <span class="dl-size">${dl.done?'Concluído':size||pct+'%'}</span>
      <button class="dl-close" onclick="delete downloads['${id}'];renderDownloads()">✕</button>
    </div>`
  }).join('')
}

// ════════════════════════════════════════════════════════════════════
// ── AD BLOCKER REAL (bloqueio na camada de rede via main process) ─────
// ════════════════════════════════════════════════════════════════════
let adBlockEnabled = true
let adsBlocked     = 0

// Inicializa cor do botão e estado vindo do main
ipcRenderer.invoke('adblock-status').then(s => {
  adBlockEnabled = s.enabled
  adsBlocked     = s.count
  _updateAdBlockBtn()
}).catch(()=>{})

function _updateAdBlockBtn() {
  const btn = document.getElementById('btn-adblock')
  if(!btn) return
  btn.style.color    = adBlockEnabled ? '#22c55e' : 'var(--text-dim)'
  btn.title          = adBlockEnabled ? `🛡 AdBlock ON — ${adsBlocked} bloqueados` : '🛡 AdBlock OFF'
}

document.getElementById('btn-adblock').onclick = () => {
  adBlockEnabled = !adBlockEnabled
  ipcRenderer.send('adblock-toggle', adBlockEnabled)
  if(!adBlockEnabled) adsBlocked = 0
  _updateAdBlockBtn()
  toast(adBlockEnabled ? '🛡 Bloqueador ativado' : '🛡 Bloqueador desativado', adBlockEnabled ? 'success' : 'info')
}
_updateAdBlockBtn()

// Recebe contagem atualizada do main process cada vez que bloqueia algo
ipcRenderer.on('ad-blocked', (e, count) => {
  adsBlocked = count
  const badge = document.getElementById('adblocker-badge')
  if(badge) {
    badge.textContent = '🛡 ' + adsBlocked
    badge.classList.add('show')
  }
  _updateAdBlockBtn()
})

// Cosmetic filter: esconde containers de anúncio que ainda sobram no DOM
// (complemento ao bloqueio de rede — lida com anúncios first-party)
webview.addEventListener('did-finish-load', () => {
  if(!adBlockEnabled) return
  webview.executeJavaScript(`
    (function(){
      const sel = [
        '.adsbygoogle','[id^="google_ads"]','[id^="div-gpt-ad"]',
        '[class*="advertisement"]','[class*="banner-ad"]','[class*="ad-banner"]',
        '[class*="ad-slot"]','[data-ad-slot]','[data-adunit]',
        'iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]',
        'iframe[src*="adnxs"]','iframe[src*="amazon-adsystem"]',
        '[id*="taboola"]','[class*="taboola"]',
        '[id*="outbrain"]','[class*="outbrain"]',
      ].join(',')
      let n = 0
      try {
        document.querySelectorAll(sel).forEach(el => {
          el.style.setProperty('display','none','important')
          n++
        })
      } catch(e) {}
      return n
    })()
  `).catch(()=>{})
})

// ════════════════════════════════════════════════════════════════════
// ── SPOTLIGHT / COMMAND PALETTE ───────────────────────════════════════
// ════════════════════════════════════════════════════════════════════
const spotlight     = document.getElementById('spotlight')
const spotInput     = document.getElementById('spotlight-input')
const spotResults   = document.getElementById('spotlight-results')
let spotSelected    = 0

const COMMANDS = [
  {icon:'⚡',title:'Chat JARVIS',        sub:'Abrir painel de chat',         action:()=>togglePanel('panel-jarvis'),      shortcut:''},
  {icon:'📊',title:'Monitor do sistema', sub:'CPU, RAM, temperatura',         action:()=>{togglePanel('panel-system');refreshSystem()}, shortcut:''},
  {icon:'⭐',title:'Favoritos',          sub:'Ver seus favoritos',             action:()=>{togglePanel('panel-bookmarks');renderBookmarks()}, shortcut:''},
  {icon:'🕐',title:'Histórico',          sub:'Ver histórico de navegação',     action:()=>{togglePanel('panel-history');renderHistory()}, shortcut:'Ctrl+H'},
  {icon:'🔐',title:'Senhas',             sub:'Gerenciador de senhas',          action:()=>{togglePanel('panel-passwords');renderPasswords()}, shortcut:''},
  {icon:'🌍',title:'Clima',              sub:'Ver temperatura e localização',  action:()=>{togglePanel('panel-weather');initWeather()}, shortcut:''},
  {icon:'🎵',title:'Spotify',            sub:'Controles de música',            action:()=>{togglePanel('panel-spotify');initSpotify()}, shortcut:''},
  {icon:'📸',title:'Captura de tela',    sub:'Screenshot com anotações',       action:()=>takeScreenshot(), shortcut:''},
  {icon:'📖',title:'Modo leitura',       sub:'Ler sem distrações',             action:()=>toggleReaderMode(), shortcut:''},
  {icon:'🕵',title:'Nova aba incógnita', sub:'Navegar sem salvar histórico',   action:()=>createTab(null,'Nova guia',true), shortcut:'Ctrl+I'},
  {icon:'⛶', title:'Modo foco',          sub:'Esconder interface',             action:()=>toggleFocus(), shortcut:'Ctrl+F'},
  {icon:'🍅',title:'Timer Pomodoro',     sub:'25 minutos de foco',             action:()=>startPomodoro(), shortcut:''},
  {icon:'⬜',title:'Dividir tela',       sub:'Ver dois sites ao mesmo tempo',  action:()=>toggleSplit(), shortcut:''},
  {icon:'⚙', title:'Configurações',      sub:'Personalizar o LUMINA',          action:()=>togglePanel('panel-settings'), shortcut:''},
]

document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.key === 'k') { e.preventDefault(); openSpotlight() }
})
document.getElementById('btn-spotlight').onclick = openSpotlight

function openSpotlight() {
  spotlight.classList.add('show')
  spotInput.value = ''
  spotInput.focus()
  renderSpotlight('')
}

function closeSpotlight() {
  spotlight.classList.remove('show')
  spotInput.value = ''
}

spotlight.onclick = e => { if(e.target === spotlight) closeSpotlight() }

spotInput.onkeydown = e => {
  const items = spotResults.querySelectorAll('.spotlight-item')
  if(e.key==='ArrowDown') { e.preventDefault(); spotSelected=Math.min(spotSelected+1,items.length-1); updateSpotSelection(items) }
  else if(e.key==='ArrowUp') { e.preventDefault(); spotSelected=Math.max(spotSelected-1,0); updateSpotSelection(items) }
  else if(e.key==='Enter') { e.preventDefault(); items[spotSelected]?.click() }
  else if(e.key==='Escape') closeSpotlight()
}

spotInput.oninput = () => { spotSelected=0; renderSpotlight(spotInput.value) }

function updateSpotSelection(items) {
  items.forEach((it,i) => it.classList.toggle('selected', i===spotSelected))
  items[spotSelected]?.scrollIntoView({block:'nearest'})
}

function renderSpotlight(query) {
  const q   = query.toLowerCase().trim()
  const hist= history.slice(0,5)
  const bm  = bookmarks.slice(0,5)
  let html  = ''

  // Comandos
  const cmds = COMMANDS.filter(c => !q || c.title.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q))
  if(cmds.length) {
    html += `<div class="spotlight-section">COMANDOS</div>`
    html += cmds.map((c,i) => `
      <div class="spotlight-item ${i===spotSelected&&!q?'selected':''}" data-action="${i}">
        <div class="spotlight-item-icon">${c.icon}</div>
        <div class="spotlight-item-info">
          <div class="spotlight-item-title">${c.title}</div>
          <div class="spotlight-item-sub">${c.sub}</div>
        </div>
        ${c.shortcut?`<div class="spotlight-item-shortcut"><kbd>${c.shortcut}</kbd></div>`:''}
      </div>`).join('')
  }

  // Histórico filtrado
  const hf = q ? hist.filter(h=>(h.title||h.url).toLowerCase().includes(q)) : hist
  if(hf.length) {
    html += `<div class="spotlight-section">HISTÓRICO</div>`
    html += hf.map(h => `
      <div class="spotlight-item" onclick="navigate('${h.url.replace(/'/g,"\\'")}');closeSpotlight()">
        <div class="spotlight-item-icon">🕐</div>
        <div class="spotlight-item-info">
          <div class="spotlight-item-title">${(h.title||h.url).slice(0,40)}</div>
          <div class="spotlight-item-sub">${h.url.slice(0,50)}</div>
        </div>
      </div>`).join('')
  }

  spotResults.innerHTML = html

  // Bind commands
  spotResults.querySelectorAll('.spotlight-item[data-action]').forEach(el => {
    el.onclick = () => { COMMANDS[parseInt(el.dataset.action)].action(); closeSpotlight() }
  })
}

// ════════════════════════════════════════════════════════════════════
// ── CONTEXT MENU ──────────────────────────────────────════════════════
// ════════════════════════════════════════════════════════════════════
const ctxMenu = document.getElementById('context-menu')

document.addEventListener('contextmenu', e => {
  if(e.target.closest('webview') || e.target.closest('#content-area')) {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY)
  }
})
document.addEventListener('click', () => ctxMenu.classList.remove('show'))
document.addEventListener('keydown', e => { if(e.key==='Escape') ctxMenu.classList.remove('show') })

function showContextMenu(x, y) {
  ctxMenu.style.left = Math.min(x, window.innerWidth-220)+'px'
  ctxMenu.style.top  = Math.min(y, window.innerHeight-280)+'px'
  ctxMenu.classList.add('show')
}

document.getElementById('ctx-jarvis-explain').onclick = async () => {
  ctxMenu.classList.remove('show')
  const sel = await webview.executeJavaScript('window.getSelection().toString()').catch(()=>'')
  if(!sel) { toast('Selecione um texto primeiro','info'); return }
  document.getElementById('panel-jarvis').classList.remove('hidden')
  document.getElementById('chat-input').value = `Explique isso: "${sel.slice(0,300)}"`
  window._sendChatRemote ? window._sendChatRemote() : sendChat()
}

document.getElementById('ctx-jarvis-translate').onclick = async () => {
  ctxMenu.classList.remove('show')
  const sel = await webview.executeJavaScript('window.getSelection().toString()').catch(()=>'')
  if(!sel) { toast('Selecione um texto primeiro','info'); return }
  document.getElementById('panel-jarvis').classList.remove('hidden')
  document.getElementById('chat-input').value = `Traduza para português: "${sel.slice(0,500)}"`
  window._sendChatRemote ? window._sendChatRemote() : sendChat()
}

document.getElementById('ctx-copy').onclick = async () => {
  ctxMenu.classList.remove('show')
  const sel = await webview.executeJavaScript('window.getSelection().toString()').catch(()=>'')
  if(sel) { require('electron').clipboard.writeText(sel); toast('📋 Copiado!','success') }
}

document.getElementById('ctx-search').onclick = async () => {
  ctxMenu.classList.remove('show')
  const sel = await webview.executeJavaScript('window.getSelection().toString()').catch(()=>'')
  if(sel) createTab((ENGINES[uiCfg.engine||'google']||ENGINES.google)(sel))
}

document.getElementById('ctx-screenshot').onclick = () => { ctxMenu.classList.remove('show'); takeScreenshot() }

document.getElementById('ctx-fullpage').onclick = async () => {
  ctxMenu.classList.remove('show')
  try {
    const image = await webview.capturePage()
    const link  = document.createElement('a')
    link.download = `lumina-${Date.now()}.png`
    link.href     = image.toDataURL()
    link.click()
    toast('💾 Screenshot salvo!','success')
  } catch(e) { toast('Erro ao capturar','error') }
}

document.getElementById('ctx-newtab').onclick = async () => {
  ctxMenu.classList.remove('show')
  const url = await webview.executeJavaScript('window.location.href').catch(()=>'')
  if(url) createTab(url)
}

document.getElementById('ctx-split').onclick = async () => {
  ctxMenu.classList.remove('show')
  const url = await webview.executeJavaScript('window.location.href').catch(()=>'')
  toggleSplit(url)
}

document.getElementById('ctx-close-tab').onclick = () => { ctxMenu.classList.remove('show'); closeTab(activeTabId) }

// ════════════════════════════════════════════════════════════════════
// ── SPLIT VIEW ────────────────────────────────────════════════════════
// ════════════════════════════════════════════════════════════════════
let splitActive = false
const sidePanel  = document.getElementById('side-panel')
const sideWebview= document.getElementById('side-webview')

document.getElementById('btn-split').onclick    = () => toggleSplit()
document.getElementById('split-close').onclick  = () => toggleSplit()
document.getElementById('split-go').onclick     = () => {
  const url = document.getElementById('split-url-input').value.trim()
  if(url) { try{sideWebview.loadURL(url.startsWith('http')?url:'https://'+url)}catch(e){sideWebview.src=url} }
}
document.getElementById('split-url-input').onkeydown = e => {
  if(e.key==='Enter') document.getElementById('split-go').click()
}

function toggleSplit(url=null) {
  splitActive = !splitActive
  sidePanel.classList.toggle('show', splitActive)
  document.getElementById('content-area').classList.toggle('split', splitActive)
  document.getElementById('btn-split').style.color = splitActive ? 'var(--accent)' : ''
  if(splitActive && url) {
    try{sideWebview.loadURL(url)}catch(e){sideWebview.src=url}
    document.getElementById('split-url-input').value = url
  }
  if(splitActive) toast('⬜ Modo dividido ativado','info')
}

// ════════════════════════════════════════════════════════════════════
// ── POMODORO TIMER ────────────────────────────────════════════════════
// ════════════════════════════════════════════════════════════════════
let pomodoroInterval = null
let pomodoroSecs     = 25 * 60
let pomodoroActive   = false

document.getElementById('btn-pomodoro').onclick = () => {
  if(pomodoroActive) stopPomodoro()
  else startPomodoro()
}

function startPomodoro(mins=25) {
  pomodoroSecs   = mins * 60
  pomodoroActive = true
  document.getElementById('focus-timer').classList.add('show')
  document.getElementById('btn-pomodoro').style.color = '#f97316'
  updatePomodoroDisplay()
  pomodoroInterval = setInterval(() => {
    pomodoroSecs--
    updatePomodoroDisplay()
    if(pomodoroSecs <= 0) {
      stopPomodoro()
      toast('🍅 Pomodoro completo! Hora de descansar.', 'success', 8000)
      // Notificação do sistema
      if('Notification' in window && Notification.permission === 'granted')
        new Notification('LUMINA — Pomodoro', {body:'25 minutos completados! Faça uma pausa.', icon:''})
    }
  }, 1000)
}

function stopPomodoro() {
  clearInterval(pomodoroInterval)
  pomodoroActive = false
  document.getElementById('focus-timer').classList.remove('show')
  document.getElementById('btn-pomodoro').style.color = ''
}

function updatePomodoroDisplay() {
  const m = Math.floor(pomodoroSecs/60)
  const s = pomodoroSecs % 60
  document.getElementById('focus-timer-display').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

document.getElementById('focus-timer-btn').onclick = stopPomodoro

// ════════════════════════════════════════════════════════════════════
// ── READING PROGRESS BAR ──────────────────────════════════════════════
// ════════════════════════════════════════════════════════════════════
webview.addEventListener('did-finish-load', () => {
  webview.executeJavaScript(`
    window.addEventListener('scroll', () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      const pct   = total > 0 ? (window.scrollY / total) * 100 : 0
      window._luminaScrollPct = pct
    })
  `).catch(()=>{})
})

setInterval(async () => {
  if(!webview.src || webview.src==='about:blank') { document.getElementById('reading-progress').style.width='0%'; return }
  try {
    const pct = await webview.executeJavaScript('window._luminaScrollPct || 0')
    document.getElementById('reading-progress').style.width = pct + '%'
  } catch(e) {}
}, 300)

// ════════════════════════════════════════════════════════════════════
// ── TAB GROUPS ────────────────────────────────════════════════════════
// ════════════════════════════════════════════════════════════════════
let tabGroups   = loadJSON(path.join(os.homedir(),'.lumina','groups.json'), [])
let selectedGroupColor = '#8b5cf6'

document.getElementById('new-group-btn').onclick = () => togglePanel('panel-groups')

document.querySelectorAll('#group-color-picker .color-dot').forEach(dot => {
  dot.onclick = () => {
    selectedGroupColor = dot.dataset.color
    document.querySelectorAll('#group-color-picker .color-dot').forEach(d => d.style.outline='none')
    dot.style.outline = `2px solid #fff`
  }
})

document.getElementById('create-group-btn').onclick = () => {
  const name  = document.getElementById('group-name').value.trim()
  if(!name) { toast('Digite um nome para o grupo','error'); return }
  const tab   = tabs.find(t=>t.id===activeTabId)
  if(!tab)  { toast('Nenhuma aba ativa','error'); return }
  const group = {id: Date.now(), name, color: selectedGroupColor, tabs:[activeTabId]}
  tabGroups.push(group)
  saveJSON(path.join(os.homedir(),'.lumina','groups.json'), tabGroups)
  tab.groupId = group.id; tab.groupColor = selectedGroupColor
  applyTabGroupStyle(activeTabId, selectedGroupColor)
  document.getElementById('group-name').value = ''
  renderGroups()
  toast(`▤ Grupo "${name}" criado!`, 'success')
}

function applyTabGroupStyle(tabId, color) {
  const el = document.querySelector(`.tab[data-id="${tabId}"]`)
  if(el) { el.style.borderTopColor = color; el.classList.add('grouped') }
}

function renderGroups() {
  const list = document.getElementById('groups-list')
  if(!tabGroups.length) { list.innerHTML='<div class="empty-state">Nenhum grupo ainda.</div>'; return }
  list.innerHTML = tabGroups.map(g => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--glass-border);border-radius:8px;padding:8px 12px;border-left:3px solid ${g.color}">
      <span style="font-size:12px;color:${g.color};font-weight:bold;flex:1">${g.name}</span>
      <span style="font-size:10px;color:var(--text-dim)">${g.tabs.length} aba(s)</span>
      <button class="hist-del" onclick="deleteGroup(${g.id})">✕</button>
    </div>`).join('')
}

function deleteGroup(id) {
  tabGroups = tabGroups.filter(g=>g.id!==id)
  saveJSON(path.join(os.homedir(),'.lumina','groups.json'), tabGroups)
  renderGroups()
}

// ════════════════════════════════════════════════════════════════════
// ── SMART FILL (JARVIS preenche formulários) ──────────────────════════
// ════════════════════════════════════════════════════════════════════
webview.addEventListener('did-finish-load', async () => {
  try {
    const hasForm = await webview.executeJavaScript(
      `document.querySelectorAll('input[type="text"],input[type="email"],input[name]').length > 2`
    )
    const sfBtn = document.getElementById('smartfill-btn')
    if(hasForm) { sfBtn.classList.add('show') }
    else { sfBtn.classList.remove('show') }
  } catch(e) {}
})

document.getElementById('smartfill-btn').onclick = async () => {
  document.getElementById('panel-jarvis').classList.remove('hidden')
  const url  = tabs.find(t=>t.id===activeTabId)?.url || ''
  document.getElementById('chat-input').value = `Estou em ${url}. Quais informações eu provavelmente precisaria preencher neste formulário? Me dê um resumo do que geralmente é pedido neste tipo de site.`
  window._sendChatRemote ? window._sendChatRemote() : sendChat()
  document.getElementById('smartfill-btn').classList.remove('show')
}

// ════════════════════════════════════════════════════════════════════
// ── 🎁 SURPRESAS ──────────────────────────────────════════════════════
// ════════════════════════════════════════════════════════════════════

// SURPRESA 1: JARVIS comenta quando você fica muito tempo numa página
let pageTimer = null
let currentPageStart = Date.now()
webview.addEventListener('did-navigate', () => {
  currentPageStart = Date.now()
  clearTimeout(pageTimer)
  pageTimer = setTimeout(async () => {
    const tab = tabs.find(t=>t.id===activeTabId)
    if(!tab?.url?.startsWith('http')) return
    const mins = Math.round((Date.now()-currentPageStart)/60000)
    // Toast sutil
    toast(`⚡ ${mins} minutos em "${(tab.title||tab.url).slice(0,25)}..."`, 'info', 4000)
  }, 15 * 60 * 1000) // 15 minutos
})

// SURPRESA 2: Detecta quando está em site de formulário e sugere Smart Fill
// (já implementado acima)

// SURPRESA 3: Easter egg — digita "jarvis" na url bar e abre o chat
urlBar.addEventListener('keydown', e => {
  if(e.key === 'Enter' && urlBar.value.toLowerCase().trim() === 'jarvis') {
    e.preventDefault()
    urlBar.value = ''
    document.getElementById('panel-jarvis').classList.remove('hidden')
    document.getElementById('chat-input').focus()
    toast('⚡ Olá, sir.', 'info', 2000)
  }
})

// SURPRESA 4: Atalho global Ctrl+K abre spotlight (já implementado)
// SURPRESA 5: Modo cinematográfico — pressiona F11 para fullscreen total
document.addEventListener('keydown', e => {
  if(e.key === 'F11') {
    e.preventDefault()
    ipcRenderer.send('toggle-fullscreen')
  }
})

// SURPRESA 6: JARVIS dá boas-vindas diferente baseado na hora do dia
const hour = new Date().getHours()
const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
setTimeout(() => {
  const jarvisGreeting = `${greeting}, sir. LUMINA inicializado e todos os sistemas operacionais.`
  appendMsg('lumina', jarvisGreeting, '⚡ JARVIS')
}, 2000)

// SURPRESA 7: Barra de pesquisa da home mostra sugestões enquanto digita
const homeSearchEl = document.getElementById('home-search')
let suggestionsBox = null

homeSearchEl.oninput = async () => {
  const q = homeSearchEl.value.trim()
  if(!q) { suggestionsBox?.remove(); return }

  // Sugestões de histórico
  const matches = history.filter(h => (h.title||h.url).toLowerCase().includes(q.toLowerCase())).slice(0,4)
  if(!matches.length) { suggestionsBox?.remove(); return }

  if(!suggestionsBox) {
    suggestionsBox = document.createElement('div')
    suggestionsBox.style.cssText = 'position:absolute;background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--glass-border);border-radius:12px;overflow:hidden;z-index:100;box-shadow:0 8px 32px rgba(0,0,0,0.5);margin-top:4px;width:580px;max-width:90vw'
    homeSearchEl.parentElement.style.position = 'relative'
    homeSearchEl.parentElement.appendChild(suggestionsBox)
  }

  suggestionsBox.innerHTML = matches.map(h => `
    <div onclick="navigate('${h.url.replace(/'/g,"\\'")}');this.parentElement?.remove()" style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;font-size:12px;color:var(--text-dim);transition:background 0.1s" onmouseover="this.style.background='var(--accent-dim)'" onmouseout="this.style.background='transparent'">
      <span>🕐</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(h.title||h.url).slice(0,50)}</span>
    </div>`).join('')
}

document.addEventListener('click', e => {
  if(!e.target.closest('#home-search-wrap')) suggestionsBox?.remove()
})

// ── SIDEBAR RESIZE ────────────────────────────────────────────────────────────
let sbResizing  = false
let sbStartX    = 0
let sbStartW    = 56
const sidebar   = document.getElementById('sidebar')

document.getElementById('sb-resize-handle').addEventListener('mousedown', e => {
  sbResizing = true
  sbStartX   = e.clientX
  sbStartW   = sidebar.offsetWidth
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
})

document.addEventListener('mousemove', e => {
  if(!sbResizing) return
  const newW = Math.max(56, Math.min(300, sbStartW + e.clientX - sbStartX))
  sidebar.style.width = newW + 'px'
  document.getElementById('content-area').style.marginLeft = newW + 'px'
  document.getElementById('content-area').style.width = `calc(100% - ${newW}px)`
  document.getElementById('navbar').style.paddingLeft = (newW + 8) + 'px'
})

document.addEventListener('mouseup', () => {
  if(sbResizing) {
    sbResizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    // Salva largura
    uiCfg.sidebarWidth = sidebar.offsetWidth
    saveJSON(UI_CFG, uiCfg)
  }
})

// Restaura largura salva
if(uiCfg.sidebarWidth) {
  const w = uiCfg.sidebarWidth
  sidebar.style.width = w + 'px'
  document.getElementById('content-area').style.marginLeft = w + 'px'
  document.getElementById('content-area').style.width = `calc(100% - ${w}px)`
  document.getElementById('navbar').style.paddingLeft = (w + 8) + 'px'
}

// ── SIDEBAR ACTIVE STATE ──────────────────────────────────────────────────────
function setSidebarActive(btnId) {
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'))
  document.getElementById(btnId)?.classList.add('active')
}

// Override togglePanel pra marcar botão ativo
const _origTogglePanel = togglePanel
window.togglePanel = function(id) {
  _origTogglePanel(id)
  // Mapeia painel → botão
  const map = {
    'panel-jarvis':    'btn-jarvis',
    'panel-system':    'btn-system',
    'panel-spotify':   'btn-spotify',
    'panel-weather':   'btn-weather',
    'panel-bookmarks': 'btn-bookmarks',
    'panel-history':   'btn-history',
    'panel-passwords': 'btn-passwords',
    'panel-processes': 'btn-processes',
    'panel-translate': 'btn-translate',
    'panel-captions':  'btn-captions',
    'panel-settings':  'btn-settings',
  }
  const btnId = map[id]
  const isOpen = !document.getElementById(id).classList.contains('hidden')
  if(isOpen && btnId) setSidebarActive(btnId)
  else document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'))
}

// ════════════════════════════════════════════════════════════════════
// ⚡ SURPRESAS
// ════════════════════════════════════════════════════════════════════

// ── 1. RELÓGIO GRANDE NA HOME ─────────────────────────────────────────────
function updateBigClock() {
  const now  = new Date()
  const h    = String(now.getHours()).padStart(2,'0')
  const m    = String(now.getMinutes()).padStart(2,'0')
  const s    = String(now.getSeconds()).padStart(2,'0')
  const el   = document.getElementById('home-clock-big')
  if(el) el.textContent = `${h}:${m}`
  // Status bar clock
  const sb = document.getElementById('sb-time')
  if(sb) sb.textContent = `${h}:${m}:${s}`
}
setInterval(updateBigClock, 1000)
updateBigClock()

// ── 2. STATUS BAR ATUALIZA COM SISTEMA ────────────────────────────────────
setInterval(async () => {
  try {
    const d = await fetch(`${BACKEND}/system`).then(r=>r.json())
    const cpu  = document.getElementById('sb-cpu')
    const ram  = document.getElementById('sb-ram')
    const game = document.getElementById('sb-game')
    if(cpu)  cpu.textContent  = `${d.cpu}%`
    if(ram)  ram.textContent  = `${d.ram}%`
    if(game) game.textContent = d.game ? `🎮 ${d.game}` : '🎮 Nenhum jogo'
  } catch(e) {}
}, 3000)

// ── 3. WEATHER NA HOME ────────────────────────────────────────────────────
async function loadHomeWeather() {
  try {
    const d = await fetch(`${BACKEND}/weather`).then(r=>r.json())
    const icon = document.getElementById('home-weather-icon')
    const temp = document.getElementById('home-weather-temp')
    const city = document.getElementById('home-weather-city')
    const sb   = document.getElementById('sb-weather')
    const WX   = {'clear':'☀️','clouds':'☁️','rain':'🌧️','drizzle':'🌦️','thunderstorm':'⛈️','snow':'❄️','mist':'🌫️'}
    const desc = (d.description||'').toLowerCase()
    const emoji= Object.entries(WX).find(([k])=>desc.includes(k))?.[1] || '🌡️'
    if(icon) icon.textContent = emoji
    if(temp) temp.textContent = `${Math.round(d.temp||0)}°C`
    if(city) city.textContent = (d.city||'--').toUpperCase()
    if(sb)   sb.textContent   = `${emoji} ${Math.round(d.temp||0)}°C`
  } catch(e) {}
}
loadHomeWeather()
setInterval(loadHomeWeather, 5 * 60 * 1000)

// ── 4. SITES RECENTES NA HOME ─────────────────────────────────────────────
function renderRecentSites() {
  const recents = document.getElementById('home-recents')
  if(!recents) return
  const seen    = new Set()
  const recent  = history.filter(h => {
    try {
      const origin = new URL(h.url).origin
      if(seen.has(origin)) return false
      seen.add(origin); return true
    } catch(e) { return false }
  }).slice(0, 6)

  if(!recent.length) { recents.style.display='none'; return }
  recents.innerHTML = recent.map(h => {
    let origin = ''
    try { origin = new URL(h.url).origin } catch(e) { return '' }
    const title = (h.title||h.url).slice(0,12)
    return `<div class="recent-card" onclick="navigate('${h.url.replace(/'/g,"\\'")}')">
      <img class="recent-card-favicon" src="${origin}/favicon.ico" onerror="this.style.display='none'">
      <div class="recent-card-title">${title}</div>
    </div>`
  }).filter(Boolean).join('')
}
renderRecentSites()

// ── 5. MOOD INDICATOR ────────────────────────────────────────────────────
const MOODS = [
  {condition: () => _is_ultron_local(),                    color:'#FF4000', text:'ULTRON MODE'},
  {condition: () => currentGameTheme !== null,              color:'#22c55e', text:'GAME MODE'},
  {condition: () => focusMode,                              color:'#8b5cf6', text:'FOCUS MODE'},
  {condition: () => pomodoroActive,                         color:'#f97316', text:'POMODORO'},
  {condition: () => captionsActive,                         color:'#f59e0b', text:'CAPTIONS ON'},
  {condition: () => voiceActive,                            color:'#ef4444', text:'OUVINDO...'},
  {condition: () => true,                                   color:'#00BFFF', text:'LUMINA ONLINE'},
]

function updateMood() {
  const mood    = MOODS.find(m => m.condition())
  const dot     = document.getElementById('mood-dot')
  const text    = document.getElementById('mood-text')
  const ind     = document.getElementById('mood-indicator')
  const ambient = document.getElementById('ambient-ring')
  if(!dot||!text||!ind) return
  dot.style.background  = mood.color
  dot.style.boxShadow   = `0 0 8px ${mood.color}`
  text.textContent      = mood.text
  if(ambient) {
    ambient.style.background = `radial-gradient(circle,${mood.color}22 0%,transparent 70%)`
  }
  // Mostra por 3s quando muda
  ind.classList.add('show')
  clearTimeout(ind._t)
  ind._t = setTimeout(() => ind.classList.remove('show'), 3000)
}
setInterval(updateMood, 2000)

// ── 6. URL BAR GLOW QUANDO JARVIS RESPONDE ────────────────────────────────
const urlBarWrap = document.getElementById('url-bar-wrap')
function flashUrlBar() {
  urlBarWrap.classList.add('jarvis-active')
  setTimeout(() => urlBarWrap.classList.remove('jarvis-active'), 1000)
}

// ── 7. AMBIENT RING RESPONDE AO SISTEMA ──────────────────────────────────
setInterval(async () => {
  try {
    const d = await fetch(`${BACKEND}/system`).then(r=>r.json())
    const ambient = document.getElementById('ambient-ring')
    if(!ambient) return
    // CPU alta = anel fica mais intenso/vermelho
    if(d.cpu > 85) {
      ambient.style.background = 'radial-gradient(circle,rgba(255,68,85,0.15) 0%,transparent 70%)'
    } else if(d.game) {
      ambient.style.background = `radial-gradient(circle,var(--accent-dim) 0%,transparent 70%)`
    } else {
      ambient.style.background = 'radial-gradient(circle,var(--accent-dim) 0%,transparent 70%)'
    }
  } catch(e) {}
}, 5000)

// ── 8. JARVIS COMENTA O CLIMA AO ABRIR ───────────────────────────────────
setTimeout(async () => {
  try {
    const d = await fetch(`${BACKEND}/weather`).then(r=>r.json())
    if(!d.temp) return
    const temp = Math.round(d.temp)
    const desc = d.description || ''
    const city = d.city || ''
    let comment = ''
    if(temp > 35)      comment = `${temp}°C em ${city}. Recomendo hidratação, sir.`
    else if(temp > 28) comment = `Está quente lá fora — ${temp}°C em ${city}.`
    else if(temp < 10) comment = `${temp}°C em ${city}. Bastante frio, sir.`
    else if(temp < 18) comment = `${temp}°C em ${city}. Uma temperatura agradável.`
    else               comment = `${temp}°C e ${desc.toLowerCase()} em ${city}.`
    if(comment) {
      // Adiciona na primeira conversa como mensagem de contexto
      setTimeout(() => {
        const conv = getActiveConv ? getActiveConv() : null
        if(conv && conv.messages.length === 0) {
          appendMsg('lumina', comment, '⚡ JARVIS')
        }
      }, 3500)
    }
  } catch(e) {}
}, 4000)

// ── 9. DRAG & DROP DE IMAGENS E ARQUIVOS NA JANELA ───────────────────────
document.addEventListener('dragover', e => e.preventDefault())
document.addEventListener('drop', e => {
  e.preventDefault()
  const files = Array.from(e.dataTransfer.files)
  const urls  = e.dataTransfer.getData('text/uri-list')
  if(files.length) {
    const img = files.find(f => f.type.startsWith('image/'))
    const url = files.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'))
    if(img) {
      // Imagem → mostra no JARVIS
      document.getElementById('panel-jarvis').classList.remove('hidden')
      appendMsg('lumina', `📎 Imagem recebida: ${img.name} (${(img.size/1024).toFixed(1)}KB). Para análise de imagens, use a API de visão do JARVIS.`, '⚡ JARVIS')
    } else if(url) {
      navigate('file://' + url.path)
    }
  } else if(urls) {
    navigate(urls.split('\n')[0].trim())
  }
  toast('📎 Arquivo recebido!', 'info')
})

// ── 10. ATALHO SECRETO: KONAMI CODE ──────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
// ── PICTURE IN PICTURE ───────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
let pipOpen     = false
let pipMinified = false

const pipOverlay    = document.getElementById('pip-overlay')
const pipTitlebar   = document.getElementById('pip-titlebar')
const pipVideoList  = document.getElementById('pip-video-list')
const pipNoVideo    = document.getElementById('pip-no-video')
const pipCountLabel = document.getElementById('pip-count-label')

// ── Scan de vídeos no webview ──────────────────────────────────────────
async function pipScanVideos() {
  pipVideoList.innerHTML = ''
  pipNoVideo.style.display = 'block'
  pipCountLabel.textContent = 'Escaneando...'

  try {
    const videos = await webview.executeJavaScript(`
      (function() {
        const vs = Array.from(document.querySelectorAll('video')).filter(v => v.readyState >= 1 || v.src || v.currentSrc)
        return vs.map((v, i) => ({
          index:    i,
          src:      v.currentSrc || v.src || '',
          width:    v.videoWidth  || v.offsetWidth  || 0,
          height:   v.videoHeight || v.offsetHeight || 0,
          duration: v.duration    || 0,
          paused:   v.paused,
          muted:    v.muted,
          site:     location.hostname.replace('www.',''),
        }))
      })()
    `)

    if(!videos || !videos.length) {
      pipNoVideo.style.display = 'block'
      pipNoVideo.textContent   = 'Nenhum vídeo detectado. Tente iniciar a reprodução primeiro.'
      pipCountLabel.textContent = '0 vídeos encontrados'
      return
    }

    pipNoVideo.style.display = 'none'
    pipCountLabel.textContent = `${videos.length} vídeo${videos.length > 1 ? 's' : ''} encontrado${videos.length > 1 ? 's' : ''}`

    videos.forEach(v => {
      const dur = v.duration && isFinite(v.duration)
        ? `${Math.floor(v.duration/60)}:${String(Math.floor(v.duration%60)).padStart(2,'0')}`
        : '--'

      const siteIcon = {
        'youtube.com': '▶', 'youtu.be': '▶',
        'twitch.tv': '📺', 'netflix.com': '🎬',
        'primevideo.com': '🎬', 'disneyplus.com': '🎬',
        'globoplay.globo.com': '📡', 'globo.com': '📡',
        'pornhub.com': '🔞', 'twitter.com': '𝕏', 'x.com': '𝕏',
        'instagram.com': '📷', 'tiktok.com': '🎵',
        'vimeo.com': '🎞', 'dailymotion.com': '🎞',
      }[v.site] || '🎬'

      const item = document.createElement('div')
      item.className = 'pip-video-item'
      item.innerHTML = `
        <div class="pip-video-thumb">${siteIcon}</div>
        <div class="pip-video-info">
          <div class="pip-video-site">${v.site || 'desconhecido'}</div>
          <div class="pip-video-dims">${v.width > 0 ? `${v.width}×${v.height}` : 'Dimensões desconhecidas'}</div>
          <div class="pip-video-duration">${v.paused ? '⏸ Pausado' : '▶ Reproduzindo'} · ${dur}</div>
        </div>
        <button class="pip-btn" data-idx="${v.index}" title="Ativar Picture in Picture">⧉ PiP</button>
      `
      item.querySelector('.pip-btn').onclick = () => activatePip(v.index)
      pipVideoList.appendChild(item)
    })

  } catch(e) {
    pipNoVideo.style.display  = 'block'
    pipNoVideo.textContent    = 'Erro ao escanear. O site pode bloquear scripts.'
    pipCountLabel.textContent = 'Erro'
  }
}

// ── Ativar PiP nativo via API do browser ──────────────────────────────
async function activatePip(videoIndex) {
  try {
    const result = await webview.executeJavaScript(`
      (function() {
        const videos = Array.from(document.querySelectorAll('video'))
        const v = videos[${videoIndex}]
        if(!v) return { ok: false, err: 'Vídeo não encontrado' }

        // Tenta API nativa de Picture in Picture
        if(document.pictureInPictureEnabled && v.requestPictureInPicture) {
          v.requestPictureInPicture()
            .then(() => {})
            .catch(e => console.warn('PiP error:', e))
          return { ok: true, method: 'native' }
        }

        // Fallback: webkit (Safari-based)
        if(v.webkitSetPresentationMode) {
          v.webkitSetPresentationMode('picture-in-picture')
          return { ok: true, method: 'webkit' }
        }

        return { ok: false, err: 'API PiP não disponível neste site' }
      })()
    `)

    if(result && result.ok) {
      toast(`⧉ Picture in Picture ativado!`, 'success')
      document.getElementById('btn-pip').classList.add('pip-active')
      // Atualiza visual do botão clicado
      pipVideoList.querySelectorAll('.pip-btn').forEach((b,i) => {
        b.classList.toggle('active', parseInt(b.dataset.idx) === videoIndex)
        b.textContent = parseInt(b.dataset.idx) === videoIndex ? '✓ Ativo' : '⧉ PiP'
      })
    } else {
      toast(`⧉ ${result?.err || 'Erro ao ativar PiP'}`, 'error')
    }
  } catch(e) {
    toast('Erro ao ativar Picture in Picture', 'error')
  }
}

// ── Toggle do painel PiP ──────────────────────────────────────────────
function togglePip() {
  pipOpen = !pipOpen
  pipOverlay.classList.toggle('hidden', !pipOpen)
  document.getElementById('btn-pip').classList.toggle('pip-active', pipOpen)
  if(pipOpen) pipScanVideos()
}

document.getElementById('btn-pip').onclick = togglePip

document.getElementById('pip-close-btn').onclick = () => {
  pipOpen = false
  pipOverlay.classList.add('hidden')
  document.getElementById('btn-pip').classList.remove('pip-active')
}

document.getElementById('pip-minimize-btn').onclick = () => {
  pipMinified = !pipMinified
  pipOverlay.classList.toggle('pip-mini', pipMinified)
  document.getElementById('pip-minimize-btn').textContent = pipMinified ? '□' : '─'
}

document.getElementById('pip-native-btn').onclick = async () => {
  // Ativa PiP no primeiro vídeo em reprodução, ou no primeiro disponível
  try {
    const result = await webview.executeJavaScript(`
      (function() {
        const playing = Array.from(document.querySelectorAll('video')).find(v => !v.paused && v.readyState >= 2)
        const v = playing || document.querySelector('video')
        if(!v) return { ok: false }
        if(document.pictureInPictureEnabled && v.requestPictureInPicture) {
          v.requestPictureInPicture().catch(()=>{})
          return { ok: true }
        }
        return { ok: false }
      })()
    `)
    if(result?.ok) toast('⧉ PiP ativado!', 'success')
    else toast('Nenhum vídeo em reprodução encontrado', 'info')
  } catch(e) {}
}

document.getElementById('pip-refresh-btn').onclick = pipScanVideos

// ── Drag para mover o painel ──────────────────────────────────────────
let pipDragging = false, pipDragOX = 0, pipDragOY = 0
pipTitlebar.addEventListener('mousedown', e => {
  if(e.target.tagName === 'BUTTON') return
  pipDragging = true
  const rect  = pipOverlay.getBoundingClientRect()
  pipDragOX   = e.clientX - rect.left
  pipDragOY   = e.clientY - rect.top
  pipOverlay.style.transition = 'none'
})
document.addEventListener('mousemove', e => {
  if(!pipDragging) return
  pipOverlay.style.right  = 'auto'
  pipOverlay.style.bottom = 'auto'
  pipOverlay.style.left   = (e.clientX - pipDragOX) + 'px'
  pipOverlay.style.top    = (e.clientY - pipDragOY) + 'px'
})
document.addEventListener('mouseup', () => {
  pipDragging = false
  pipOverlay.style.transition = ''
})

// ── Auto-detectar vídeo quando navega ─────────────────────────────────
webview.addEventListener('did-finish-load', async () => {
  try {
    const count = await webview.executeJavaScript(`document.querySelectorAll('video').length`)
    const pipBtn = document.getElementById('btn-pip')
    if(count > 0) {
      pipBtn.style.opacity = '1'
      pipBtn.title = `⧉ Picture in Picture — ${count} vídeo${count>1?'s':''} nesta página`
      // Rescan se o painel já estiver aberto
      if(pipOpen) pipScanVideos()
    } else {
      pipBtn.style.opacity = '0.4'
      pipBtn.title = '⧉ Picture in Picture — Nenhum vídeo detectado'
    }
  } catch(e) {}
})

// ── Atalho Ctrl+Shift+P ───────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.shiftKey && e.key === 'P') {
    e.preventDefault()
    togglePip()
  }
})

// ════════════════════════════════════════════════════════════════════
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']
let konamiIdx = 0
document.addEventListener('keydown', e => {
  if(e.key === KONAMI[konamiIdx]) {
    konamiIdx++
    if(konamiIdx === KONAMI.length) {
      konamiIdx = 0
      // Easter egg: ativa modo Ultron por 5s localmente
      applyAccent('#FF4000')
      initBg()
      toast('🔴 PROTOCOLO ULTRON ATIVADO — Modo secreto!', 'error', 5000)
      document.getElementById('mood-dot').style.background = '#FF4000'
      setTimeout(() => { applyAccent(uiCfg.accent||'#00BFFF'); initBg() }, 5000)
    }
  } else { konamiIdx = 0 }
})
