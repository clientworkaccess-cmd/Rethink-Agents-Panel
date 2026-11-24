# Panel voice service (deployed 24 Nov 2026, speech-to-text switched to Parakeet the same day)

On the VPS at /opt/panel-voice. Reachable only from the VPS itself: 127.0.0.1:8090.

    docker build -t panel-voice:parakeet /opt/panel-voice
    mkdir -p /opt/panel-voice/config && cp /opt/panel-voice/hotwords.txt /opt/panel-voice/config/
    docker run -d --name panel-voice --restart unless-stopped -p 127.0.0.1:8090:8000 \
      --cpus 1.5 --memory 2500m -e THREADS=2 -v /opt/panel-voice/config:/config panel-voice:parakeet

- GET /health (lists the custom words); POST /stt (multipart field `file`, webm/ogg/wav) -> {text, audioSeconds, seconds}; POST /tts {text, voice: "female"|"male"} -> audio/wav
- Models: NVIDIA Parakeet TDT 0.6B v2 int8 through sherpa-onnx (CPU), Piper with two reply voices: female = en_US-hfc_female-medium (default), male = en_US-ryan-high (Saim's picks, 24 Nov; Kokoro was more natural but took 111 s to make 72 s of speech on 2 vCPU).
- **Custom words:** `/opt/panel-voice/config/hotwords.txt`, one word or phrase per line, written with the capitals
  you want back, optional ` :score` (default 2.5). The service re-reads the file on the next request after it
  changes; no restart. Keep scores modest: `Claude :3.5` turned "call sources" into "Claude sources" and put
  stray "Claude"s on a silent start; 1.5 fixed the word with neither side effect. Test any new word on a clip
  that contains it and one that doesn't.
- Measured on 2 vCPU: 19 s of speech transcribed in about 4.3 s, 49 s in about 10 s; Piper makes 13 s of speech in
  about 1.2 s; about 1 GB RAM with both voices loaded.
- Why Parakeet: same accuracy as Whisper small.en at roughly twice the speed, and the word list fixes its misses
  (Claude, Hamshire, CRO, Hussain) where Whisper's prompt hint did not fix Hamshire.
- Rollback: the old Whisper container is kept stopped as `panel-voice-whisper`:
  `docker stop panel-voice && docker rename panel-voice panel-voice-parakeet && docker rename panel-voice-whisper panel-voice && docker start panel-voice`
- PyAV is pinned below 14 (it decodes the browser's webm).
