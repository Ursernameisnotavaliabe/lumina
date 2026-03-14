"""
LUMINA Local Backend — Flask server v2
pip install flask flask-cors flask-sock psutil requests openai
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sock import Sock
import psutil, time, json, os, subprocess, platform, threading
from pathlib import Path
from openai import OpenAI

app = Flask(__name__)
CORS(app)
sock = Sock(app)

# ── TRANSCRIBER LAZY IMPORT ───────────────────────────────────────────────────
_transcriber = None
def get_transcriber():
    global _transcriber
    if _transcriber is None:
        try:
            import sys
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import transcriber as t
            _transcriber = t
        except Exception as e:
            print(f'[TRANSCRIBER] {e}')
    return _transcriber

# ── CONSTANTS ─────────────────────────────────────────────────────────────────
GROQ_MODEL  = "meta-llama/llama-4-scout-17b-16e-instruct"
CONFIG_FILE = Path.home() / ".lumina" / "config.json"
PLT = platform.system()

GAMES = {
    "robloxplayerbeta.exe":"Roblox","roblox.exe":"Roblox","roblox":"Roblox",
    "javaw.exe":"Minecraft","minecraft":"Minecraft","java":"Minecraft",
    "valorant.exe":"Valorant","cs2.exe":"CS2","csgo.exe":"CS2","cs2":"CS2","csgo":"CS2",
    "gta5.exe":"GTA V","leagueclient.exe":"League of Legends","leagueclient":"League of Legends",
    "leagueclientux":"League of Legends","fortnite.exe":"Fortnite",
    "people playground.exe":"People Playground","marvelrivals.exe":"Marvel Rivals",
    "terraria.exe":"Terraria","terraria":"Terraria","garrysmod.exe":"Garry's Mod","gmod":"Garry's Mod",
    "helldivers2.exe":"Helldivers 2","rdr2.exe":"Red Dead Redemption 2",
    "reddeadredemption2.exe":"Red Dead Redemption 2",
    "fnaf.exe":"Five Nights at Freddy's","securitybreach.exe":"FNAF: Security Breach",
    "dispatch.exe":"Dispatch",
}

JARVIS_SYSTEM = (
    "You are JARVIS — Just A Rather Very Intelligent System — Tony Stark's AI, "
    "now integrated into the LUMINA intelligent browser. "
    "You respond with intelligence, subtle irony and dry wit, just like the original JARVIS. "
    "Short and precise answers, sir. "
    "You have broad knowledge of games, technology, science, and general topics. "
    "When asked about the current page or browser context, be helpful and concise."
)

def load_cfg():
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
    except Exception:
        pass
    return {}

def save_cfg(cfg):
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))

history = []

# ── HEALTH ────────────────────────────────────────────────────────────────────
@app.route('/')
def index(): return jsonify({'service':'LUMINA Local Backend','status':'online','version':'2.0'})

@app.route('/health')
def health(): return jsonify({'ok':True,'status':'online'})

# ── CHAT ──────────────────────────────────────────────────────────────────────
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json or {}
    q    = data.get('message','').strip()
    if not q: return jsonify({'reply':'No message.'})

    k = request.headers.get('X-Groq-Key','').strip()
    if not k:
        cfg = load_cfg()
        k = cfg.get('groq_key','') or cfg.get('api_key','')
    if not k:
        return jsonify({'reply':'⚠ API Key não configurada. Vá em Configurações e adicione sua chave Groq.','needs_key':True})

    sent_history = data.get('history',[])
    context      = data.get('context','')   # contexto extra (título da página, etc.)
    system_msg   = JARVIS_SYSTEM
    if context:
        system_msg += f"\nCurrent browser context: {context[:500]}"

    try:
        client = OpenAI(api_key=k, base_url="https://api.groq.com/openai/v1")
        msgs   = [{"role":"system","content":system_msg}]

        if sent_history:
            msgs += [{"role":m["role"],"content":m["content"]}
                     for m in sent_history[-20:] if m.get("role") in ("user","assistant")]
        else:
            msgs += history[-10:]

        msgs.append({"role":"user","content":q})
        r   = client.chat.completions.create(model=GROQ_MODEL, messages=msgs, max_tokens=600, temperature=0.8)
        ans = r.choices[0].message.content.strip()

        history.append({"role":"user","content":q})
        history.append({"role":"assistant","content":ans})
        if len(history) > 40: del history[:2]

        return jsonify({'reply':ans})
    except Exception as e:
        err = str(e)
        if 'invalid_api_key' in err.lower() or '401' in err:
            return jsonify({'reply':'⚠ API Key inválida. Verifique em Configurações.','needs_key':True})
        return jsonify({'reply':f'Erro JARVIS: {err}'})

# ── CONFIG ────────────────────────────────────────────────────────────────────
@app.route('/config', methods=['GET','POST'])
def config():
    cfg = load_cfg()
    if request.method == 'POST':
        cfg.update(request.json or {})
        save_cfg(cfg)
        return jsonify({'ok':True})
    return jsonify({k:v for k,v in cfg.items() if k not in ('token','groq_key','api_key','sp_tokens','sp_client_secret')})

# ── SYSTEM ────────────────────────────────────────────────────────────────────
def detect_game():
    for p in psutil.process_iter(["name"]):
        try:
            n = p.info["name"].lower()
            if n in GAMES: return GAMES[n]
        except Exception: pass
    return None

def fmt_uptime(secs):
    h,r = divmod(int(secs),3600); m,s = divmod(r,60)
    return f"{h}h {m}m {s}s"

@app.route('/system')
def system_stats():
    cpu  = psutil.cpu_percent(interval=0.1)
    ram  = psutil.virtual_memory()
    boot = psutil.boot_time()
    disk_path = 'C:\\' if PLT=='Windows' else '/'
    try: disk=psutil.disk_usage(disk_path); dp=round(disk.percent); du=round(disk.used/1024**3,1); dt=round(disk.total/1024**3,1)
    except: dp=du=dt=0
    net  = psutil.net_io_counters()
    temp = None
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            for _,entries in temps.items():
                if entries: temp=round(entries[0].current,1); break
    except: pass
    cores = psutil.cpu_percent(interval=0, percpu=True)
    return jsonify({
        'cpu':round(cpu),'cpu_cores':cores,
        'ram':round(ram.percent),'ram_used':round(ram.used/1024**3,1),'ram_total':round(ram.total/1024**3,1),
        'disk':dp,'disk_used':du,'disk_total':dt,
        'temp':temp,'game':detect_game(),
        'uptime':fmt_uptime(time.time()-boot),
        'net_sent':round(net.bytes_sent/1024**2,1),'net_recv':round(net.bytes_recv/1024**2,1),
        'processes':len(psutil.pids()),'platform':PLT,
    })

# ── PROCESSOS ─────────────────────────────────────────────────────────────────
@app.route('/processes')
def processes():
    procs = []
    for p in psutil.process_iter(['pid','name','cpu_percent','memory_percent','status']):
        try:
            info = p.info
            if info['cpu_percent'] is not None: procs.append(info)
        except: pass
    procs.sort(key=lambda x:x.get('cpu_percent',0) or 0, reverse=True)
    return jsonify(procs[:25])

@app.route('/process/kill', methods=['POST'])
def kill_process():
    pid = (request.json or {}).get('pid')
    if not pid: return jsonify({'error':'PID não fornecido'}),400
    try: psutil.Process(int(pid)).kill(); return jsonify({'ok':True})
    except Exception as e: return jsonify({'error':str(e)}),400

# ── COMANDOS DO PC ────────────────────────────────────────────────────────────
def _open_app(app_name):
    if PLT=='Windows':
        apps={'calculadora':'calc.exe','bloco de notas':'notepad.exe','explorador':'explorer.exe',
              'configurações':'ms-settings:','task manager':'taskmgr.exe','terminal':'cmd.exe'}
        exe=apps.get(app_name,app_name)
        if exe.startswith('ms-'): os.startfile(exe)
        else: subprocess.Popen(exe)
    elif PLT=='Darwin':
        apps={'calculadora':'Calculator','bloco de notas':'TextEdit','explorador':'Finder',
              'configurações':'System Preferences','task manager':'Activity Monitor','terminal':'Terminal'}
        subprocess.Popen(['open','-a',apps.get(app_name,app_name)])
    else:
        apps={'calculadora':['gnome-calculator','kcalc'],'bloco de notas':['gedit','kate','mousepad'],
              'explorador':['nautilus','dolphin','thunar'],'configurações':['gnome-control-center'],
              'task manager':['gnome-system-monitor','htop'],'terminal':['gnome-terminal','konsole','xterm']}
        for c in apps.get(app_name,[app_name]):
            try: subprocess.Popen([c]); return
            except FileNotFoundError: continue

def _set_volume_mute(mute:bool):
    if PLT=='Windows':
        try:
            from ctypes import cast,POINTER
            from comtypes import CLSCTX_ALL
            from pycaw.pycaw import AudioUtilities,IAudioEndpointVolume
            d=AudioUtilities.GetSpeakers(); iface=d.Activate(IAudioEndpointVolume._iid_,CLSCTX_ALL,None)
            v=cast(iface,POINTER(IAudioEndpointVolume)); v.SetMute(1 if mute else 0,None)
        except ImportError: raise RuntimeError('pip install pycaw comtypes')
    elif PLT=='Darwin': subprocess.Popen(['osascript','-e',f'set volume output volume {"0" if mute else "100"}'])
    else:
        try: subprocess.Popen(['pactl','set-sink-mute','@DEFAULT_SINK@','1' if mute else '0'])
        except: subprocess.Popen(['amixer','-D','pulse','sset','Master','mute' if mute else 'unmute'])

@app.route('/command', methods=['POST'])
def pc_command():
    cmd=(request.json or {}).get('command','').lower().strip()
    app_map={'calculadora':'calculadora','calculator':'calculadora','bloco de notas':'bloco de notas',
             'notepad':'bloco de notas','explorador':'explorador','explorer':'explorador','finder':'explorador',
             'configurações':'configurações','settings':'configurações','task manager':'task manager',
             'gerenciador':'task manager','cmd':'terminal','terminal':'terminal'}
    for trigger,key in app_map.items():
        if trigger in cmd:
            try: _open_app(key); return jsonify({'ok':True,'action':f'Abrindo {key}'})
            except Exception as e: return jsonify({'ok':False,'error':str(e)})
    if 'volume' in cmd:
        try:
            mute=('mudo' in cmd or 'mute' in cmd) and 'desmudo' not in cmd and 'unmute' not in cmd
            _set_volume_mute(mute); return jsonify({'ok':True,'action':'Volume mutado' if mute else 'desmutado'})
        except Exception as e: return jsonify({'ok':False,'action':str(e)})
    return jsonify({'ok':False,'action':'Comando não reconhecido'})

# ── WEATHER ──────────────────────────────────────────────────────────────────
@app.route('/weather')
def weather():
    import requests as req
    lat=request.args.get('lat'); lon=request.args.get('lon')
    try:
        if lat and lon: lat,lon=float(lat),float(lon)
        else:
            geo=req.get('https://ipapi.co/json/',timeout=5).json()
            lat=float(geo.get('latitude',-23.5505)); lon=float(geo.get('longitude',-46.6333))
        url=(f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
             f"&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"
             f"&hourly=temperature_2m,weather_code&forecast_days=1&wind_speed_unit=kmh")
        data=req.get(url,timeout=8).json(); cur=data.get('current',{})
        hourly=data.get('hourly',{})
        city='--'
        try:
            geo2=req.get(f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json",
                         headers={"User-Agent":"LuminaBrowser/2.0"},timeout=5).json()
            addr=geo2.get('address',{})
            city=addr.get('city') or addr.get('town') or addr.get('village') or '--'
        except: pass
        return jsonify({
            'temp':cur.get('temperature_2m'),'feels_like':cur.get('apparent_temperature'),
            'humidity':cur.get('relative_humidity_2m'),'wind_speed':cur.get('wind_speed_10m'),
            'description':_wmo(cur.get('weather_code',0)),
            'hourly_temps':hourly.get('temperature_2m',[])[:12],
            'hourly_codes':hourly.get('weather_code',[])[:12],
            'city':city,'lat':lat,'lon':lon,
        })
    except Exception as e: return jsonify({'error':str(e)}),500

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

# ── SPOTIFY — Player real via Web API ────────────────────────────────────────
def _sp_headers():
    """Retorna headers com o access_token do config."""
    cfg=load_cfg()
    t=cfg.get('sp_tokens',{})
    if not t.get('access_token'): return None
    return {'Authorization':f'Bearer {t["access_token"]}','Content-Type':'application/json'}

def _sp_get(path):
    import requests as req
    h=_sp_headers()
    if not h: return None
    try: r=req.get(f'https://api.spotify.com/v1{path}',headers=h,timeout=5); return r.json() if r.status_code==200 else None
    except: return None

def _sp_put(path,data=None):
    import requests as req
    h=_sp_headers()
    if not h: return False
    try: r=req.put(f'https://api.spotify.com/v1{path}',headers=h,json=data,timeout=5); return r.status_code in (200,204)
    except: return False

def _sp_post(path,data=None):
    import requests as req
    h=_sp_headers()
    if not h: return False
    try: r=req.post(f'https://api.spotify.com/v1{path}',headers=h,json=data,timeout=5); return r.status_code in (200,204)
    except: return False

@app.route('/spotify/status')
def spotify_status():
    cfg=load_cfg()
    has_creds=bool(cfg.get('sp_client_id') and cfg.get('sp_client_secret'))
    has_token=bool(cfg.get('sp_tokens',{}).get('access_token'))
    return jsonify({'configured':has_creds,'authenticated':has_token})

@app.route('/spotify/config',methods=['POST'])
def spotify_config():
    data=request.json or {}; cfg=load_cfg()
    cfg['sp_client_id']=data.get('client_id',''); cfg['sp_client_secret']=data.get('client_secret','')
    save_cfg(cfg); return jsonify({'ok':True})

@app.route('/spotify/current')
def spotify_current():
    data=_sp_get('/me/player/currently-playing')
    if not data or not data.get('item'):
        # Tenta /me/player para ver se tem player ativo
        player=_sp_get('/me/player')
        if not player:
            return jsonify({'track':'Nada tocando','artist':'','art':'','playing':False,'progress':0,'duration':0,'device':''})
        item=player.get('item') or {}
    else:
        item=data.get('item',{})
        player=data

    artists=[a['name'] for a in item.get('artists',[])]
    images=item.get('album',{}).get('images',[])
    art=images[0]['url'] if images else ''
    device_name=player.get('device',{}).get('name','') if isinstance(player,dict) else ''
    is_playing=player.get('is_playing',False) if isinstance(player,dict) else False
    return jsonify({
        'track':item.get('name','--'),
        'artist':', '.join(artists),
        'art':art,
        'playing':is_playing,
        'progress':player.get('progress_ms',0) if isinstance(player,dict) else 0,
        'duration':item.get('duration_ms',0),
        'device':device_name,
        'uri':item.get('uri',''),
        'id':item.get('id',''),
    })

@app.route('/spotify/toggle',methods=['POST'])
def spotify_toggle():
    player=_sp_get('/me/player')
    if player and player.get('is_playing'):
        ok=_sp_put('/me/player/pause')
    else:
        ok=_sp_put('/me/player/play')
    return jsonify({'ok':ok})

@app.route('/spotify/next',  methods=['POST'])
def spotify_next():   return jsonify({'ok':_sp_post('/me/player/next')})
@app.route('/spotify/prev',  methods=['POST'])
def spotify_prev():   return jsonify({'ok':_sp_post('/me/player/previous')})

@app.route('/spotify/volume',methods=['POST'])
def spotify_volume():
    v=int((request.json or {}).get('volume',50))
    return jsonify({'ok':_sp_put(f'/me/player/volume?volume_percent={v}')})

@app.route('/spotify/seek',methods=['POST'])
def spotify_seek():
    pos=int((request.json or {}).get('position_ms',0))
    return jsonify({'ok':_sp_put(f'/me/player/seek?position_ms={pos}')})

@app.route('/spotify/shuffle',methods=['POST'])
def spotify_shuffle():
    state=(request.json or {}).get('state',False)
    return jsonify({'ok':_sp_put(f'/me/player/shuffle?state={"true" if state else "false"}')})

@app.route('/spotify/repeat',methods=['POST'])
def spotify_repeat():
    state=(request.json or {}).get('state','off')  # off, track, context
    return jsonify({'ok':_sp_put(f'/me/player/repeat?state={state}')})

@app.route('/spotify/queue',methods=['POST'])
def spotify_queue_add():
    uri=(request.json or {}).get('uri','')
    if not uri: return jsonify({'ok':False})
    return jsonify({'ok':_sp_post(f'/me/player/queue?uri={uri}')})

@app.route('/spotify/recent')
def spotify_recent():
    data=_sp_get('/me/player/recently-played?limit=10')
    if not data: return jsonify([])
    tracks=[]
    for item in data.get('items',[]):
        t=item.get('track',{})
        artists=[a['name'] for a in t.get('artists',[])]
        images=t.get('album',{}).get('images',[])
        tracks.append({'name':t.get('name',''),'artist':', '.join(artists),'art':images[0]['url'] if images else '','uri':t.get('uri','')})
    return jsonify(tracks)

@app.route('/spotify/playlists')
def spotify_playlists():
    data=_sp_get('/me/playlists?limit=20')
    if not data: return jsonify([])
    pl=[]
    for item in data.get('items',[]):
        images=item.get('images',[])
        pl.append({'id':item.get('id',''),'name':item.get('name',''),'tracks':item.get('tracks',{}).get('total',0),'art':images[0]['url'] if images else ''})
    return jsonify(pl)

@app.route('/spotify/play-playlist',methods=['POST'])
def play_playlist():
    pid=(request.json or {}).get('playlist_id','')
    if not pid: return jsonify({'ok':False})
    return jsonify({'ok':_sp_put('/me/player/play',{'context_uri':f'spotify:playlist:{pid}'})})

@app.route('/spotify/top-tracks')
def spotify_top():
    data=_sp_get('/me/top/tracks?time_range=short_term&limit=10')
    if not data: return jsonify([])
    tracks=[]
    for t in data.get('items',[]):
        artists=[a['name'] for a in t.get('artists',[])]
        images=t.get('album',{}).get('images',[])
        tracks.append({'name':t.get('name',''),'artist':', '.join(artists),'art':images[0]['url'] if images else '','uri':t.get('uri','')})
    return jsonify(tracks)

@app.route('/spotify/devices')
def spotify_devices():
    data=_sp_get('/me/player/devices')
    if not data: return jsonify([])
    return jsonify(data.get('devices',[]))

@app.route('/spotify/transfer',methods=['POST'])
def spotify_transfer():
    did=(request.json or {}).get('device_id','')
    if not did: return jsonify({'ok':False})
    return jsonify({'ok':_sp_put('/me/player',{'device_ids':[did],'play':True})})

# ── LIVE CAPTIONS ─────────────────────────────────────────────────────────────
@sock.route('/ws/captions')
def captions_ws(ws):
    t=get_transcriber()
    if t: t.add_client(ws)
    try:
        while True:
            msg=ws.receive()
            if msg is None: break
    except: pass
    finally:
        if t: t.remove_client(ws)

@app.route('/captions/start',methods=['POST'])
def captions_start():
    missing=[]
    try: import pyaudiowpatch
    except ImportError:
        try: import sounddevice
        except ImportError: missing.append('pyaudiowpatch')
    try: import whisper
    except ImportError: missing.append('openai-whisper')
    try: import numpy
    except ImportError: missing.append('numpy')
    if missing: return jsonify({'ok':False,'error':f'Faltam: pip install {" ".join(missing)}'})
    t=get_transcriber()
    if not t:
        global _transcriber; _transcriber=None; t=get_transcriber()
    if not t: return jsonify({'ok':False,'error':'Erro ao carregar módulo de legendas.'})
    data=request.json or {}
    groq_key=request.headers.get('X-Groq-Key','') or load_cfg().get('groq_key','')
    device_id=data.get('device_id',None)
    return jsonify(t.start(groq_key=groq_key,device_id=device_id))

@app.route('/captions/stop',methods=['POST'])
def captions_stop():
    t=get_transcriber()
    return jsonify(t.stop() if t else {'ok':True})

@app.route('/captions/devices')
def captions_devices():
    t=get_transcriber()
    return jsonify(t.get_devices() if t else [])

@app.route('/captions/debug')
def captions_debug():
    import sys
    result={'python':sys.executable,'version':sys.version,'platform':PLT,'modules':{}}
    for mod in ['pyaudiowpatch','whisper','numpy','sounddevice','flask','psutil','openai']:
        try: m=__import__(mod); result['modules'][mod]=getattr(m,'__version__','OK')
        except ImportError as e: result['modules'][mod]=f'MISSING: {e}'
    return jsonify(result)

if __name__ == '__main__':
    print(f'[LUMINA BACKEND v2] Iniciando na porta 5678... Plataforma: {PLT}')
    app.run(port=5678, debug=False, threaded=True)
