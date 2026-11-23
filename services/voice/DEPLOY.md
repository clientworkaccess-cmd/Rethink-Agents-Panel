# Panel voice service (deployed 24 Nov 2026)

On the VPS at /opt/panel-voice. Reachable only from the VPS itself: 127.0.0.1:8090.

    docker build -t panel-voice /opt/panel-voice
    docker volume create panel-voice-models
    docker run -d --name panel-voice --restart unless-stopped -p 127.0.0.1:8090:8000 \
      --cpus 1.5 --memory 2g -e THREADS=2 -v panel-voice-models:/models/whisper panel-voice

- GET /health; POST /stt (multipart field `file`, webm/ogg/wav) -> {text, audioSeconds, seconds}; POST /tts {text} -> audio/wav
- Models: faster-whisper small.en int8 (CPU), Piper en_US-lessac-medium. Site names are hinted through VOCAB.
- Measured on 2 vCPU: 19 s of speech transcribed in about 5 s; 13 s of speech synthesized in about 1.2 s; about 0.7 GB RAM.
- PyAV is pinned below 14 (faster-whisper passes metadata_errors, which av 14+ removed).
