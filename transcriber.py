"""
LUMINA Live Transcriber — Whisper + Groq em tempo real
Usa WASAPI Loopback nativo do Windows — sem VB-Cable necessário!

pip install pyaudiowpatch openai-whisper numpy flask-sock
"""

import threading, time, queue, numpy as np

_whisper_model = None
_model_lock    = threading.Lock()

def get_whisper(size='base'):
    global _whisper_model
    with _model_lock:
        if _whisper_model is None:
            import whisper
            print(f'[TRANSCRIBER] Carregando Whisper {size}...')
            _whisper_model = whisper.load_model(size)
            print('[TRANSCRIBER] Whisper pronto!')
    return _whisper_model

_active      = False
_clients     = []
_audio_queue = queue.Queue()
_stream      = None
_pyaudio     = None

SAMPLE_RATE = 16000
CHUNK_SECS  = 4
CHUNK_SIZE  = SAMPLE_RATE * CHUNK_SECS

def add_client(ws):    _clients.append(ws)
def remove_client(ws):
    if ws in _clients: _clients.remove(ws)

def broadcast(data: dict):
    import json
    dead = []
    for ws in _clients:
        try: ws.send(json.dumps(data))
        except: dead.append(ws)
    for ws in dead: remove_client(ws)

def get_loopback_device_wasapi():
    """
    Usa pyaudiowpatch para encontrar o dispositivo WASAPI Loopback nativo.
    Detecta tanto pela flag isLoopbackDevice quanto pelo sufixo [Loopback] no nome.
    """
    try:
        import pyaudiowpatch as pyaudio
        pa = pyaudio.PyAudio()

        loopbacks = []
        for i in range(pa.get_device_count()):
            d = pa.get_device_info_by_index(i)
            is_loop = (
                d.get('isLoopbackDevice', False) or
                '[loopback]' in d['name'].lower() or
                d['name'].lower().endswith('loopback')
            )
            if is_loop and d['maxInputChannels'] > 0:
                loopbacks.append((i, d['name'], d['defaultSampleRate']))

        pa.terminate()

        if not loopbacks:
            return None, None, None

        # Prefere Headphones ou alto-falantes reais (evita Steam/Virtual)
        preferred_keywords = ['headphone', 'alto-falante', 'speaker', 'amd', 'realtek', 'high definition']
        skip_keywords      = ['steam', 'virtual', 'cable', 'mapper', 'mapeador', 's/pdif', 'digital']

        for idx, name, rate in loopbacks:
            nl = name.lower()
            if any(k in nl for k in skip_keywords):
                continue
            if any(k in nl for k in preferred_keywords):
                print(f'[WASAPI] Loopback preferido: [{idx}] {name}')
                return idx, 'wasapi', name

        # Fallback: primeiro loopback disponível não-steam
        for idx, name, rate in loopbacks:
            if 'steam' not in name.lower():
                print(f'[WASAPI] Loopback fallback: [{idx}] {name}')
                return idx, 'wasapi', name

        # Último recurso: qualquer loopback
        idx, name, rate = loopbacks[0]
        return idx, 'wasapi', name

    except ImportError:
        pass
    except Exception as e:
        print(f'[WASAPI] {e}')

    return None, None, None

def get_loopback_device_sounddevice():
    """Fallback: tenta VB-Cable ou qualquer loopback via sounddevice."""
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        # Procura VB-Cable
        for i, d in enumerate(devices):
            if 'cable' in d['name'].lower() and d['max_input_channels'] > 0:
                return i, 'sounddevice', d['name']
        # Procura loopback genérico
        for i, d in enumerate(devices):
            if 'loopback' in d['name'].lower() and d['max_input_channels'] > 0:
                return i, 'sounddevice', d['name']
        # Fallback: microfone padrão
        return sd.default.device[0], 'sounddevice', 'Microfone padrão (fallback)'
    except:
        return None, None, None

def audio_callback_sd(indata, frames, time_info, status):
    if _active:
        _audio_queue.put(indata.copy())

def start_wasapi_stream(device_idx):
    """Inicia stream usando pyaudiowpatch (WASAPI Loopback nativo)."""
    global _stream, _pyaudio
    import pyaudiowpatch as pyaudio

    _pyaudio = pyaudio.PyAudio()
    device   = _pyaudio.get_device_info_by_index(device_idx)
    channels = int(device['maxInputChannels']) or 2
    rate     = int(device['defaultSampleRate'])

    def callback(in_data, frame_count, time_info, status):
        if _active:
            audio = np.frombuffer(in_data, dtype=np.float32)
            # Converte para mono se necessário
            if channels > 1:
                audio = audio.reshape(-1, channels).mean(axis=1)
            # Resample para 16000 se necessário
            if rate != SAMPLE_RATE:
                import scipy.signal as sig
                audio = sig.resample(audio, int(len(audio) * SAMPLE_RATE / rate))
            _audio_queue.put(audio.copy())
        return (None, pyaudio.paContinue)

    _stream = _pyaudio.open(
        format=pyaudio.paFloat32,
        channels=channels,
        rate=rate,
        input=True,
        input_device_index=device_idx,
        frames_per_buffer=int(rate * 0.25),
        stream_callback=callback
    )
    _stream.start_stream()

def start_sounddevice_stream(device_idx):
    """Inicia stream usando sounddevice."""
    global _stream
    import sounddevice as sd
    _stream = sd.InputStream(
        device=device_idx,
        channels=1,
        samplerate=SAMPLE_RATE,
        callback=audio_callback_sd,
        blocksize=SAMPLE_RATE // 4
    )
    _stream.start()

def transcribe_worker(translate_to_pt=True, groq_key=''):
    model  = get_whisper('base')
    buffer = np.array([], dtype=np.float32)

    while _active:
        try:
            chunk  = _audio_queue.get(timeout=1.0)
            audio  = chunk.flatten().astype(np.float32)
            buffer = np.concatenate([buffer, audio])

            if len(buffer) >= CHUNK_SIZE:
                segment = buffer[:CHUNK_SIZE]
                buffer  = buffer[CHUNK_SIZE:]

                result   = model.transcribe(segment, fp16=False, language=None, task='transcribe')
                original = result['text'].strip()
                detected = result.get('language', 'unknown')

                if not original or len(original) < 3:
                    continue

                translated = None
                if translate_to_pt and detected not in ('pt', 'portuguese') and groq_key:
                    try:
                        from openai import OpenAI
                        client = OpenAI(api_key=groq_key, base_url='https://api.groq.com/openai/v1')
                        r = client.chat.completions.create(
                            model='meta-llama/llama-4-scout-17b-16e-instruct',
                            messages=[
                                {'role':'system','content':'Translate to Brazilian Portuguese. Return ONLY the translation, nothing else. Keep proper nouns as is.'},
                                {'role':'user','content':original}
                            ],
                            max_tokens=200, temperature=0.2
                        )
                        translated = r.choices[0].message.content.strip()
                    except Exception as e:
                        print(f'[TRANSLATE] {e}')

                broadcast({
                    'type':       'caption',
                    'original':   original,
                    'translated': translated,
                    'lang':       detected,
                    'time':       time.time()
                })

        except queue.Empty:
            continue
        except Exception as e:
            print(f'[TRANSCRIBER ERROR] {e}')
            time.sleep(0.5)

def start(groq_key='', device_id=None):
    global _active, _stream

    if _active:
        return {'ok': False, 'error': 'Já está rodando'}

    # 1. Tenta WASAPI Loopback nativo (sem VB-Cable)
    device_idx, method, device_name = get_loopback_device_wasapi()

    # 2. Fallback para sounddevice/VB-Cable
    if device_idx is None:
        device_idx, method, device_name = get_loopback_device_sounddevice()

    # 3. Override manual se usuário escolheu
    if device_id is not None:
        device_idx = int(device_id)

    if device_idx is None:
        return {'ok': False, 'error': 'Nenhum dispositivo de áudio encontrado'}

    try:
        _active = True
        print(f'[TRANSCRIBER] Usando: {device_name} (método: {method})')

        if method == 'wasapi':
            start_wasapi_stream(device_idx)
        else:
            start_sounddevice_stream(device_idx)

        threading.Thread(
            target=transcribe_worker,
            args=(True, groq_key),
            daemon=True
        ).start()

        broadcast({'type': 'status', 'status': 'started', 'device': device_name, 'method': method})
        return {'ok': True, 'device': device_name, 'method': method}

    except Exception as e:
        _active = False
        return {'ok': False, 'error': str(e)}

def stop():
    global _active, _stream, _pyaudio
    _active = False

    if _stream:
        try:
            if hasattr(_stream, 'stop_stream'):  # pyaudio
                _stream.stop_stream()
                _stream.close()
            else:  # sounddevice
                _stream.stop()
                _stream.close()
        except: pass
        _stream = None

    if _pyaudio:
        try: _pyaudio.terminate()
        except: pass
        _pyaudio = None

    while not _audio_queue.empty():
        try: _audio_queue.get_nowait()
        except: break

    broadcast({'type': 'status', 'status': 'stopped'})
    return {'ok': True}

def get_devices():
    """Lista todos os dispositivos disponíveis incluindo loopbacks."""
    devices = []
    try:
        import pyaudiowpatch as pyaudio
        pa = pyaudio.PyAudio()
        for i in range(pa.get_device_count()):
            try:
                d = pa.get_device_info_by_index(i)
                ch = int(d.get('maxInputChannels', 0))
                if ch > 0:
                    is_loop = (
                        bool(d.get('isLoopbackDevice', False)) or
                        '[loopback]' in str(d.get('name','')).lower()
                    )
                    devices.append({
                        'id':       i,
                        'name':     str(d['name']) + (' 🔁' if is_loop else ''),
                        'loopback': is_loop,
                        'method':   'wasapi'
                    })
            except Exception:
                continue
        pa.terminate()
        if devices:
            return devices
    except ImportError:
        pass
    except Exception as e:
        print(f'[GET_DEVICES] {e}')

    # Fallback sounddevice
    try:
        import sounddevice as sd
        for i, d in enumerate(sd.query_devices()):
            if d['max_input_channels'] > 0:
                devices.append({'id': i, 'name': d['name'], 'loopback': False, 'method': 'sounddevice'})
    except: pass

    return devices
