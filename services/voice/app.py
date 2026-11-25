"""Panel voice service: speech-to-text (NVIDIA Parakeet TDT 0.6B v2 via sherpa-onnx) and text-to-speech (Piper).
Bound to 127.0.0.1 only. The custom word list (HOTWORDS_FILE, one phrase per line, optional " :score") is
re-read whenever the file changes, so adding a word needs no restart."""
import io, os, threading, time, wave
import av, numpy as np, sherpa_onnx as so
from fastapi import FastAPI, File, HTTPException, UploadFile, Body
from fastapi.responses import Response
from piper import PiperVoice

MODEL_DIR = os.getenv("STT_MODEL_DIR", "/models/parakeet")
THREADS = int(os.getenv("THREADS", "2"))
HOTWORDS_FILE = os.getenv("HOTWORDS_FILE", "/config/hotwords.txt")
HOTWORDS_SCORE = float(os.getenv("HOTWORDS_SCORE", "2.5"))
BPE_VOCAB = "/tmp/bpe.vocab"

# sherpa-onnx needs a bpe.vocab to turn hotwords into tokens; derive it from tokens.txt (lower id = higher score).
with open(f"{MODEL_DIR}/tokens.txt") as src, open(BPE_VOCAB, "w") as dst:
    for line in src:
        tok, idx = line.rstrip("\n").rsplit(" ", 1)
        dst.write(f"{tok}\t{-int(idx)}\n")

def build():
    kw = dict(encoder=f"{MODEL_DIR}/encoder.int8.onnx", decoder=f"{MODEL_DIR}/decoder.int8.onnx", joiner=f"{MODEL_DIR}/joiner.int8.onnx",
              tokens=f"{MODEL_DIR}/tokens.txt", model_type="nemo_transducer", num_threads=THREADS)
    if os.path.isfile(HOTWORDS_FILE) and os.path.getsize(HOTWORDS_FILE) > 0:
        kw.update(decoding_method="modified_beam_search", max_active_paths=4, hotwords_file=HOTWORDS_FILE,
                  hotwords_score=HOTWORDS_SCORE, modeling_unit="bpe", bpe_vocab=BPE_VOCAB)
    return so.OfflineRecognizer.from_transducer(**kw)

def hw_mtime():
    try: return os.path.getmtime(HOTWORDS_FILE)
    except OSError: return 0

lock = threading.Lock()
stt, stt_mtime = build(), hw_mtime()
# Reply voices, both loaded at start (about 100 MB each). The panel sends "female" (default) or "male".
VOICES = {"female": os.getenv("PIPER_VOICE_FEMALE", "/models/piper/en_US-hfc_female-medium.onnx"),
          "male": os.getenv("PIPER_VOICE_MALE", "/models/piper/en_US-ryan-high.onnx")}
voices = {k: PiperVoice.load(v) for k, v in VOICES.items()}
app = FastAPI()

def recognizer():
    global stt, stt_mtime
    m = hw_mtime()
    if m != stt_mtime:
        stt, stt_mtime = build(), m
    return stt

def decode_16k(data: bytes) -> np.ndarray:
    out = []
    with av.open(io.BytesIO(data)) as c:
        rs = av.AudioResampler(format="flt", layout="mono", rate=16000)
        for frame in c.decode(audio=0):
            for f in rs.resample(frame): out.append(f.to_ndarray().reshape(-1))
        for f in rs.resample(None): out.append(f.to_ndarray().reshape(-1))
    return np.concatenate(out).astype(np.float32) if out else np.zeros(0, np.float32)

@app.get("/health")
def health():
    words = [l.split(" :")[0].strip() for l in open(HOTWORDS_FILE)] if os.path.isfile(HOTWORDS_FILE) else []
    return {"ok": True, "stt": "parakeet-tdt-0.6b-v2-int8", "voices": {k: os.path.basename(v) for k, v in VOICES.items()}, "hotwords": [w for w in words if w]}

@app.post("/stt")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty audio")
    if len(data) > 25_000_000:
        raise HTTPException(413, "audio too large")
    t0 = time.time()
    try:
        audio = decode_16k(data)
    except Exception:
        raise HTTPException(400, "could not decode audio")
    if audio.size < 1600:
        return {"text": "", "audioSeconds": round(audio.size / 16000, 2), "seconds": round(time.time() - t0, 2)}
    with lock:
        r = recognizer(); s = r.create_stream(); s.accept_waveform(16000, audio); r.decode_stream(s)
    return {"text": s.result.text.strip(), "audioSeconds": round(audio.size / 16000, 2), "seconds": round(time.time() - t0, 2)}

@app.post("/tts")
def tts(payload: dict = Body(...)):
    text = str(payload.get("text") or "").strip()[:6000]
    if not text:
        raise HTTPException(400, "empty text")
    voice = voices.get(str(payload.get("voice") or "female"), voices["female"])
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, w)
        else:
            voice.synthesize(text, w)
    return Response(buf.getvalue(), media_type="audio/wav")
