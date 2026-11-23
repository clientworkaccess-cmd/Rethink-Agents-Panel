"""Panel voice service: speech-to-text (faster-whisper) and text-to-speech (Piper). Bound to 127.0.0.1 only."""
import io, os, tempfile, time, wave
from fastapi import FastAPI, File, HTTPException, UploadFile, Body
from fastapi.responses import Response
from faster_whisper import WhisperModel
from piper import PiperVoice

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small.en")
THREADS = int(os.getenv("THREADS", "2"))
VOCAB = os.getenv("VOCAB", "Rethink Self Storage, Gamma Income, Mount Holly, Catawba, Hamshire, CRO, move-ins, occupancy, Paperclip.")
stt = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8", cpu_threads=THREADS, download_root="/models/whisper")
voice = PiperVoice.load(os.getenv("PIPER_VOICE", "/models/piper/en_US-lessac-medium.onnx"))
app = FastAPI()

@app.get("/health")
def health():
    return {"ok": True, "whisper": WHISPER_MODEL}

@app.post("/stt")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty audio")
    if len(data) > 25_000_000:
        raise HTTPException(413, "audio too large")
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    t0 = time.time()
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(data); f.flush()
        segments, info = stt.transcribe(f.name, language="en", vad_filter=True, beam_size=1, initial_prompt=VOCAB)
        text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "audioSeconds": round(info.duration, 2), "seconds": round(time.time() - t0, 2)}

@app.post("/tts")
def tts(payload: dict = Body(...)):
    text = str(payload.get("text") or "").strip()[:6000]
    if not text:
        raise HTTPException(400, "empty text")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, w)
        else:
            voice.synthesize(text, w)
    return Response(buf.getvalue(), media_type="audio/wav")
