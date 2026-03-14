"""
LUMINA Local Backend — Flask server
Roda localmente, lida com sistema, spotify, downloads
O chat vai pro servidor remoto (Square Cloud)
pip install flask flask-cors psutil requests openai
"""

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_sock import Sock
import psutil, time, json, os, subprocess, platform
from pathlib import Path
from openai import OpenAI

app = Flask(__name__)
CORS(app)
sock = Sock(app)

# Lazy import transcriber pra não crashar se whisper não estiver instalado
_transcriber = None
def get_transcriber():
    global _transcriber
    if _transcriber is None:
        try:
            import sys, os
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import transcriber as t
            _transcriber = t
        except Exception as e:
            print(f'[TRANSCRIBER IMPORT ERROR] {e}')
    return _transcriber

GROQ_MODEL  = "meta-llama/llama-4-scout-17b-16e-instruct"
CONFIG_FILE = Path.home() / ".lumina" / "config.json"
PLT = platform.system()  # 'Windows', 'Darwin', 'Linux'

GAMES = {
    # Windows (.exe)
    "robloxplayerbeta.exe": "Roblox",        "roblox.exe": "Roblox",
    "javaw.exe": "Minecraft",                "valorant.exe": "Valorant",
    "cs2.exe": "CS2",                        "csgo.exe": "CS2",
    "gta5.exe": "GTA V",                     "leagueclient.exe": "League of Legends",
    "fortnite.exe": "Fortnite",              "people playground.exe": "People Playground",
    "marvelrivals.exe": "Marvel Rivals",     "terraria.exe": "Terraria",
    "garrysmod.exe": "Garry's Mod",          "helldivers2.exe": "Helldivers 2",
    "rdr2.exe": "Red Dead Redemption 2",     "reddeadredemption2.exe": "Red Dead Redemption 2",
    "fnaf.exe": "Five Nights at Freddy's",   "securitybreach.exe": "FNAF: Security Breach",
    "dispatch.exe": "Dispatch",
    # macOS / Linux (sem extensão)
    "roblox": "Roblox",
    "minecraft": "Minecraft",               "java": "Minecraft",
    "leagueclientux": "League of Legends",  "leagueclient": "League of Legends",
    "terraria": "Terraria",                 "gmod": "Garry's Mod",
    "cs2": "CS2",                           "csgo": "CS2",
}

JARVIS_SYSTEM = (
    "You are JARVIS — Just A Rather Very Intelligent System — Tony Stark's AI, "
    "now integrated into the LUMINA intelligent browser. "
    "You respond with intelligence, subtle irony and dry wit, just like the original JARVIS. "
    "Short and precise answers, sir. "
    "You have broad knowledge of games, technology, science, and general topics."
)

def load_cfg():
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text())
    except: pass
    return {}

history = []

# ── CHAT (usa chave do header ou do config local) ─────────────────────────────
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json or {}
    q    = data.get('message', '').strip()
    if not q:
        return jsonify({'reply': 'No message.'})

    # Tenta pegar chave do header primeiro, depois do config local
    k = request.headers.get('X-Groq-Key', '').strip()
    if not k:
        k = load_cfg().get('groq_key', '') or load_cfg().get('api_key', '')
    if not k:
        return jsonify({'reply': '⚠ API Key não configurada. Vá em Configurações e adicione sua chave Groq.', 'needs_key': True})

    try:
        client = OpenAI(api_key=k, base_url="https://api.groq.com/openai/v1")
        msgs   = [{"role": "system", "content": JARVIS_SYSTEM}]
        msgs  += history[-10:]
        msgs.append({"role": "user", "content": q})
        r   = client.chat.completions.create(model=GROQ_MODEL, messages=msgs, max_tokens=400, temperature=0.8)
        ans = r.choices[0].message.content.strip()
        history.append({"role": "user",      "content": q})
        history.append({"role": "assistant",  "content": ans})
        return jsonify({'reply': ans})
    except Exception as e:
        return jsonify({'reply': f'Erro: {e}'})

# ── CONFIG ────────────────────────────────────────────────────────────────────
@app.route('/config', methods=['GET', 'POST'])
def config():
    cfg = load_cfg()
    if request.method == 'POST':
        data = request.json or {}
        cfg.update(data)
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
        return jsonify({'ok': True})
    return jsonify({k: v for k, v in cfg.items() if 'secret' not in k.lower() and k != 'token'})

# ── SYSTEM ────────────────────────────────────────────────────────────────────
def detect_game():
    for p in psutil.process_iter(["name"]):
        try:
            n = p.info["name"].lower()
            if n in GAMES: return GAMES[n]
        except: pass
    return None

def fmt_uptime(secs):
    h, r = divmod(int(secs), 3600)
    m, s = divmod(r, 60)
    return f"{h}h {m}m {s}s"

@app.route('/system')
def system_stats():
    cpu  = psutil.cpu_percent(interval=0.1)
    ram  = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    net  = psutil.net_io_counters()
    boot = psutil.boot_time()

    temp = None
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            for name, entries in temps.items():
                if entries: temp = round(entries[0].current, 1); break
    except: pass

    # CPU por core
    cores = psutil.cpu_percent(interval=0, percpu=True)

    return jsonify({
        'cpu':        round(cpu),
        'cpu_cores':  cores,
        'ram':        round(ram.percent),
        'ram_used':   round(ram.used / 1024**3, 1),
        'ram_total':  round(ram.total / 1024**3, 1),
        'disk':       round(disk.percent),
        'disk_used':  round(disk.used / 1024**3, 1),
        'disk_total': round(disk.total / 1024**3, 1),
        'temp':       temp,
        'game':       detect_game(),
        'uptime':     fmt_uptime(time.time() - boot),
        'net_sent':   round(net.bytes_sent / 1024**2, 1),
        'net_recv':   round(net.bytes_recv / 1024**2, 1),
        'processes':  len(psutil.pids()),
        'platform':   platform.system(),
    })

# ── PROCESSOS ─────────────────────────────────────────────────────────────────
@app.route('/processes')
def processes():
    procs = []
    for p in psutil.process_iter(['pid','name','cpu_percent','memory_percent','status']):
        try:
            info = p.info
            if info['cpu_percent'] is not None:
                procs.append(info)
        except: pass
    procs.sort(key=lambda x: x.get('cpu_percent',0) or 0, reverse=True)
    return jsonify(procs[:20])

@app.route('/process/kill', methods=['POST'])
def kill_process():
    pid = request.json.get('pid')
    try:
        psutil.Process(pid).kill()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ── COMANDOS DO PC ────────────────────────────────────────────────────────────
def _open_app(app_name):
    """Abre um aplicativo de forma cross-platform."""
    if PLT == 'Windows':
        apps = {
            'calculadora':  'calc.exe',
            'bloco de notas': 'notepad.exe',
            'explorador':   'explorer.exe',
            'configurações':'ms-settings:',
            'task manager': 'taskmgr.exe',
            'cmd':          'cmd.exe',
            'terminal':     'cmd.exe',
        }
        exe = apps.get(app_name, app_name)
        if exe.startswith('ms-'):
            os.startfile(exe)
        else:
            subprocess.Popen(exe)

    elif PLT == 'Darwin':
        apps = {
            'calculadora':  'Calculator',
            'bloco de notas': 'TextEdit',
            'explorador':   'Finder',
            'configurações':'System Preferences',
            'task manager': 'Activity Monitor',
            'terminal':     'Terminal',
        }
        app_mac = apps.get(app_name, app_name)
        subprocess.Popen(['open', '-a', app_mac])

    else:  # Linux
        apps = {
            'calculadora':  ['gnome-calculator','kcalc','galculator'],
            'bloco de notas': ['gedit','kate','mousepad','nano'],
            'explorador':   ['nautilus','dolphin','thunar','nemo'],
            'configurações':['gnome-control-center','systemsettings5'],
            'task manager': ['gnome-system-monitor','htop','ksysguard'],
            'terminal':     ['gnome-terminal','konsole','xterm'],
        }
        candidates = apps.get(app_name, [app_name])
        if isinstance(candidates, str):
            candidates = [candidates]
        for c in candidates:
            try:
                subprocess.Popen([c]); return
            except FileNotFoundError:
                continue

def _set_volume_mute(mute: bool):
    """Muta/desmuta volume de forma cross-platform."""
    if PLT == 'Windows':
        from ctypes import cast, POINTER
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
        devices = AudioUtilities.GetSpeakers()
        interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        volume = cast(interface, POINTER(IAudioEndpointVolume))
        volume.SetMute(1 if mute else 0, None)

    elif PLT == 'Darwin':
        val = '100' if not mute else '0'
        subprocess.Popen(['osascript', '-e', f'set volume output volume {val}'])

    else:  # Linux (pactl / amixer)
        try:
            action = 'mute' if mute else 'unmute'
            subprocess.Popen(['pactl', 'set-sink-mute', '@DEFAULT_SINK@', '1' if mute else '0'])
        except FileNotFoundError:
            subprocess.Popen(['amixer', '-D', 'pulse', 'sset', 'Master', 'mute' if mute else 'unmute'])

@app.route('/command', methods=['POST'])
def pc_command():
    cmd = (request.json or {}).get('command','').lower().strip()

    app_map = {
        'calculadora': 'calculadora', 'calculator': 'calculadora',
        'bloco de notas': 'bloco de notas', 'notepad': 'bloco de notas', 'textedit': 'bloco de notas',
        'explorador': 'explorador', 'explorer': 'explorador', 'finder': 'explorador', 'files': 'explorador',
        'configurações': 'configurações', 'settings': 'configurações', 'preferences': 'configurações',
        'task manager': 'task manager', 'gerenciador': 'task manager', 'activity monitor': 'task manager',
        'cmd': 'terminal', 'terminal': 'terminal',
    }

    for trigger, app_key in app_map.items():
        if trigger in cmd:
            try:
                _open_app(app_key)
                return jsonify({'ok': True, 'action': f'Abrindo {app_key}'})
            except Exception as e:
                return jsonify({'error': str(e)})

    if 'volume' in cmd:
        try:
            mute = 'mudo' in cmd or 'mute' in cmd
            if 'desmudo' in cmd or 'unmute' in cmd:
                mute = False
            _set_volume_mute(mute)
            return jsonify({'ok': True, 'action': 'Volume mutado' if mute else 'Volume desmutado'})
        except Exception as e:
            return jsonify({'ok': False, 'action': f'Erro no volume: {e}'})

    return jsonify({'ok': False, 'action': 'Comando não reconhecido'})

# ── WEATHER ──────────────────────────────────────────────────────────────────
@app.route('/weather')
def weather():
    import requests as req
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    try:
        if lat and lon:
            lat, lon = float(lat), float(lon)
        else:
            geo = req.get('https://ipapi.co/json/', timeout=5).json()
            lat = geo.get('latitude',  -23.5505)
            lon = geo.get('longitude', -46.6333)

        url  = (f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={lat}&longitude={lon}"
                f"&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"
                f"&wind_speed_unit=kmh")
        data = req.get(url, timeout=8).json()
        cur  = data.get('current', {})

        city = '--'
        try:
            geo2 = req.get(f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json",
                           headers={"User-Agent":"LuminaBrowser"}, timeout=5).json()
            addr = geo2.get('address', {})
            city = addr.get('city') or addr.get('town') or addr.get('village') or '--'
        except: pass

        return jsonify({
            'temp':       cur.get('temperature_2m'),
            'feels_like': cur.get('apparent_temperature'),
            'humidity':   cur.get('relative_humidity_2m'),
            'wind_speed': cur.get('wind_speed_10m'),
            'description':_wmo(cur.get('weather_code',0)),
            'city': city, 'lat': lat, 'lon': lon,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _wmo(c):
    if c==0:  return 'Clear sky'
    if c<=3:  return 'Partly cloudy'
    if c<=48: return 'Foggy'
    if c<=55: return 'Drizzle'
    if c<=67: return 'Rain'
    if c<=77: return 'Snow'
    if c<=82: return 'Rain showers'
    if c<=99: return 'Thunderstorm'
    return 'Unknown'

# ── SPOTIFY ──────────────────────────────────────────────────────────────────
@app.route('/spotify/status')
def spotify_status():
    cfg = load_cfg()
    return jsonify({'configured': bool(cfg.get('sp_client_id') and cfg.get('sp_client_secret'))})

@app.route('/spotify/config', methods=['POST'])
def spotify_config():
    data = request.json or {}
    cfg  = load_cfg()
    cfg['sp_client_id']     = data.get('client_id','')
    cfg['sp_client_secret'] = data.get('client_secret','')
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    return jsonify({'ok': True})

@app.route('/spotify/current')
def spotify_current():
    return jsonify({'track':'Configure OAuth para ver música','artist':'Spotify','art':'','playing':False,'progress':0,'duration':0})

@app.route('/spotify/toggle', methods=['POST'])
def spotify_toggle(): return jsonify({'ok': True})
@app.route('/spotify/next',   methods=['POST'])
def spotify_next():   return jsonify({'ok': True})
@app.route('/spotify/prev',   methods=['POST'])
def spotify_prev():   return jsonify({'ok': True})
@app.route('/spotify/volume', methods=['POST'])
def spotify_volume(): return jsonify({'ok': True})

# ── HEALTH ────────────────────────────────────────────────────────────────────
@app.route('/')
def index(): return jsonify({'service':'LUMINA Local Backend','status':'online'})

# ── LIVE CAPTIONS (WebSocket) ────────────────────────────────────────────────
@sock.route('/ws/captions')
def captions_ws(ws):
    t = get_transcriber()
    if t:
        t.add_client(ws)
    try:
        while True:
            msg = ws.receive()
            if msg is None: break
    except:
        pass
    finally:
        if t: t.remove_client(ws)

@app.route('/captions/start', methods=['POST'])
def captions_start():
    # Tenta importar dependências — mostra erro específico se faltar
    missing = []
    try: import pyaudiowpatch
    except ImportError:
        try: import sounddevice
        except ImportError: missing.append('pyaudiowpatch')

    try: import whisper
    except ImportError: missing.append('openai-whisper')

    try: import numpy
    except ImportError: missing.append('numpy')

    if missing:
        return jsonify({'ok': False, 'error': f'Faltam: pip install {" ".join(missing)}'})

    t = get_transcriber()
    if not t:
        # Tenta reimportar
        global _transcriber
        _transcriber = None
        t = get_transcriber()
    if not t:
        return jsonify({'ok': False, 'error': 'Erro ao carregar módulo de legendas. Reinicie o LUMINA.'})

    data      = request.json or {}
    groq_key  = request.headers.get('X-Groq-Key','') or load_cfg().get('groq_key','')
    device_id = data.get('device_id', None)
    result    = t.start(groq_key=groq_key, device_id=device_id)
    return jsonify(result)

@app.route('/captions/stop', methods=['POST'])
def captions_stop():
    t = get_transcriber()
    if t: return jsonify(t.stop())
    return jsonify({'ok': True})

@app.route('/captions/devices')
def captions_devices():
    t = get_transcriber()
    if not t: return jsonify([])
    return jsonify(t.get_devices())

@app.route('/captions/debug')
def captions_debug():
    import sys
    result = {
        'python': sys.executable,
        'version': sys.version,
        'modules': {}
    }
    for mod in ['pyaudiowpatch','whisper','numpy','sounddevice']:
        try:
            __import__(mod)
            result['modules'][mod] = 'OK'
        except ImportError as e:
            result['modules'][mod] = f'MISSING: {e}'
    return jsonify(result)

if __name__ == '__main__':
    print('[LUMINA BACKEND] Starting on port 5678...')
    app.run(port=5678, debug=False)
