/**
 * build-backend.js
 * Compila o server.py em executável usando PyInstaller.
 * Roda automaticamente antes do npm run build:win/mac/linux.
 * 
 * Instala PyInstaller se necessário e gera:
 *   backend/server.exe  (Windows)
 *   backend/server      (macOS/Linux)
 */

const { execSync, spawnSync } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const PLT = process.platform  // win32 | darwin | linux
const IS_WIN = PLT === 'win32'

// ── 1. Acha o Python ─────────────────────────────────────────────────────────
function findPython() {
  const candidates = IS_WIN
    ? [
        `${os.homedir()}\\AppData\\Local\\Programs\\Python\\Python314\\python.exe`,
        `${os.homedir()}\\AppData\\Local\\Programs\\Python\\Python313\\python.exe`,
        `${os.homedir()}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
        `${os.homedir()}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
        'python',
      ]
    : ['python3', 'python']

  for(const p of candidates) {
    try {
      const result = spawnSync(p, ['--version'], { encoding:'utf8' })
      if(result.status === 0) {
        console.log(`[BUILD-BACKEND] Python encontrado: ${p} (${result.stdout.trim()})`)
        return p
      }
    } catch(e) {}
  }
  return null
}

// ── 2. Instala PyInstaller se necessário ──────────────────────────────────────
function ensurePyInstaller(python) {
  try {
    const r = spawnSync(python, ['-m', 'PyInstaller', '--version'], { encoding:'utf8' })
    if(r.status === 0) {
      console.log(`[BUILD-BACKEND] PyInstaller já instalado: ${r.stdout.trim()}`)
      return true
    }
  } catch(e) {}

  console.log('[BUILD-BACKEND] Instalando PyInstaller...')
  const install = spawnSync(python, ['-m', 'pip', 'install', 'pyinstaller', '--break-system-packages'], {
    encoding: 'utf8', stdio: 'inherit'
  })
  return install.status === 0
}

// ── 3. Instala dependências do server.py ──────────────────────────────────────
function installDeps(python) {
  const deps = ['flask', 'flask-cors', 'flask-sock', 'psutil', 'requests', 'openai']
  console.log('[BUILD-BACKEND] Instalando dependências Python...')
  const r = spawnSync(python, ['-m', 'pip', 'install', ...deps, '--break-system-packages'], {
    encoding: 'utf8', stdio: 'inherit'
  })
  return r.status === 0
}

// ── 4. Compila o server.py com PyInstaller ────────────────────────────────────
function buildBackend(python) {
  const serverPy   = path.resolve(__dirname, 'backend', 'server.py')
  const distDir    = path.resolve(__dirname, 'backend')
  const outputName = 'server'

  if(!fs.existsSync(serverPy)) {
    console.error(`[BUILD-BACKEND] ❌ Não encontrei: ${serverPy}`)
    process.exit(1)
  }

  // Remove build anterior
  const exeName = IS_WIN ? 'server.exe' : 'server'
  const outExe  = path.join(distDir, exeName)
  if(fs.existsSync(outExe)) fs.unlinkSync(outExe)

  console.log('[BUILD-BACKEND] Compilando server.py...')

  const args = [
    '-m', 'PyInstaller',
    '--onefile',                    // tudo num único executável
    '--noconsole',                  // sem janela de terminal
    '--name', outputName,
    '--distpath', distDir,          // output direto em backend/
    '--workpath', path.join(__dirname, 'build', 'pyinstaller_tmp'),
    '--specpath', path.join(__dirname, 'build'),
    '--hidden-import', 'flask',
    '--hidden-import', 'flask_cors',
    '--hidden-import', 'flask_sock',
    '--hidden-import', 'psutil',
    '--hidden-import', 'openai',
    '--hidden-import', 'simple_websocket',
    serverPy,
  ]

  const result = spawnSync(python, args, { encoding:'utf8', stdio:'inherit' })

  if(result.status !== 0) {
    console.error('[BUILD-BACKEND] ❌ Falha na compilação!')
    process.exit(1)
  }

  if(fs.existsSync(outExe)) {
    const size = (fs.statSync(outExe).size / 1024 / 1024).toFixed(1)
    console.log(`[BUILD-BACKEND] ✅ Backend compilado: ${outExe} (${size} MB)`)
  } else {
    console.error('[BUILD-BACKEND] ❌ Executável não gerado!')
    process.exit(1)
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════╗')
console.log('║   LUMINA — Build Backend (Python)    ║')
console.log('╚══════════════════════════════════════╝\n')

const python = findPython()
if(!python) {
  console.error('[BUILD-BACKEND] ❌ Python não encontrado! Instale em python.org')
  process.exit(1)
}

installDeps(python)
if(!ensurePyInstaller(python)) {
  console.error('[BUILD-BACKEND] ❌ Falha ao instalar PyInstaller')
  process.exit(1)
}

buildBackend(python)
console.log('\n[BUILD-BACKEND] ✅ Pronto! Continuando build do Electron...\n')
