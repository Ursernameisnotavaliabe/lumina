/**
 * LUMINA — main_patch.js
 *
 * Cole este trecho DENTRO do main.js existente,
 * logo antes da última linha (o app.on('web-contents-created',...))
 *
 * Adiciona:
 *  - Suporte a PWA (abrir site como janela de app)
 *  - IPC para userscripts (abrir pasta)
 *  - Remoção do auto-update (como solicitado)
 */

// ── PWA: abre site como janela de app dedicada ────────────────────────────────
ipcMain.on('open-as-pwa', (e, { url, name }) => {
  try {
    const pwaWin = new BrowserWindow({
      width:  1024,
      height: 768,
      minWidth:  400,
      minHeight: 300,
      title:  name || 'App',
      // Sem frame customizado — usa frame nativo para parecer app real
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration:    false,
        contextIsolation:   true,
        partition:          'persist:pwa-' + encodeURIComponent(new URL(url).hostname),
        webviewTag:         false,
      }
    })
    pwaWin.setMenuBarVisibility(false)
    pwaWin.loadURL(url)

    // Título dinâmico
    pwaWin.webContents.on('page-title-updated', (e, title) => {
      pwaWin.setTitle(title || name)
    })

    // Intercepta links externos — abre no LUMINA principal
    pwaWin.webContents.setWindowOpenHandler(({ url: newUrl }) => {
      if(mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('open-new-tab', newUrl)
      return { action: 'deny' }
    })

    console.log(`[PWA] Aberto: ${name} → ${url}`)
  } catch(err) {
    console.error('[PWA]', err.message)
    if(e.sender && !e.sender.isDestroyed())
      e.sender.send('pwa-not-supported')
  }
})

// ── Expose reveal-file já existente (confirma que está no main) ──────────────
// ipcMain.on('reveal-file', ...) já existe no main.js anterior — não duplicar.

// ── Versão do app para a UI ───────────────────────────────────────────────────
// ipcMain.handle('get-app-version', ...) já existe — não duplicar.
