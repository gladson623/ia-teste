"""Serviço local de voz do Mordomo: Kokoro-82M (Apache-2.0) em português do Brasil.

POST /tts {"text": "...", "voice": "pf_dora,af_bella", "speed": 1.0} -> audio/wav (24 kHz, mono)
     "voice" pode ser uma voz ou uma mistura de vozes separadas por vírgula.
GET  /health -> {"ok": true, "voices": [...]}

Roda só na máquina local; quem fala com ele é o servidor Node (KOKORO_BASE_URL).
"""

import io
import json
import os
import threading
import time
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

warnings.filterwarnings("ignore")

import numpy as np
import soundfile as sf
from kokoro import KPipeline

HOST = os.environ.get("KOKORO_HOST", "127.0.0.1")
PORT = int(os.environ.get("KOKORO_PORT", "8880"))
# As três primeiras são nativas do Brasil; af_bella (inglês) só é usada em mistura, para mudar o timbre.
VOICES = ["pm_alex", "pf_dora", "pm_santa", "af_bella"]
DEFAULT_VOICE = os.environ.get("KOKORO_VOICE", "pf_dora,af_bella")
SAMPLE_RATE = 24000
MAX_CHARS = 2000
# Quando iniciado pelo servidor Node: encerra após esse tempo sem nenhuma requisição (0 = nunca).
IDLE_EXIT_S = float(os.environ.get("KOKORO_IDLE_EXIT_S", "0"))
last_request = time.monotonic()

# lang_code "p" = português do Brasil; o modelo é baixado do Hugging Face na primeira execução.
pipeline = KPipeline(lang_code="p", repo_id="hexgrad/Kokoro-82M")
lock = threading.Lock()


def synthesize(text: str, voice: str, speed: float) -> bytes:
    # O pipeline não é seguro para chamadas simultâneas; uma fala por vez.
    with lock:
        chunks = [result.audio.numpy() for result in pipeline(text, voice=voice, speed=speed)]

    buffer = io.BytesIO()
    sf.write(buffer, np.concatenate(chunks), SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def exit_when_idle() -> None:
    while True:
        time.sleep(5)
        if time.monotonic() - last_request > IDLE_EXIT_S:
            os._exit(0)


class Handler(BaseHTTPRequestHandler):
    def parse_request(self) -> bool:
        global last_request
        last_request = time.monotonic()
        return super().parse_request()

    def send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "voices": VOICES})
        else:
            self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/tts":
            self.send_json(404, {"ok": False, "error": "not_found"})
            return

        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            text = str(body.get("text", "")).strip()
            voice = str(body.get("voice") or DEFAULT_VOICE)
            speed = float(body.get("speed") or 1.0)
        except (ValueError, AttributeError):
            self.send_json(400, {"ok": False, "error": "JSON inválido"})
            return

        if not text or len(text) > MAX_CHARS:
            self.send_json(400, {"ok": False, "error": f"text deve ter de 1 a {MAX_CHARS} caracteres"})
            return
        if not all(part in VOICES for part in voice.split(",")):
            self.send_json(400, {"ok": False, "error": f"voz desconhecida; use uma de {VOICES}"})
            return
        if not 0.5 <= speed <= 2.0:
            self.send_json(400, {"ok": False, "error": "speed deve estar entre 0.5 e 2.0"})
            return

        try:
            audio = synthesize(text, voice, speed)
        except Exception as error:  # falha do modelo vira erro HTTP, sem derrubar o serviço
            self.send_json(500, {"ok": False, "error": str(error)})
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

    def log_message(self, format: str, *args) -> None:
        pass


if __name__ == "__main__":
    # Primeira síntese carrega os pesos da voz padrão; feita aqui para a primeira fala real não demorar.
    synthesize("Pronto.", DEFAULT_VOICE, 1.0)
    last_request = time.monotonic()
    if IDLE_EXIT_S > 0:
        threading.Thread(target=exit_when_idle, daemon=True).start()
    print(f"Kokoro TTS rodando em http://{HOST}:{PORT} (vozes: {', '.join(VOICES)})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
