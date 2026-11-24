FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl bzip2 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "sherpa-onnx==2.0.3" numpy piper-tts fastapi "uvicorn[standard]" python-multipart "av<14"
RUN mkdir -p /models/piper && cd /models/piper && \
    curl -fsSL -o en_US-lessac-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx && \
    curl -fsSL -o en_US-lessac-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
RUN mkdir -p /models && cd /models && \
    curl -fsSL https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2 | tar xj && \
    mv sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8 parakeet && rm -rf parakeet/test_wavs
COPY hotwords.txt /config/hotwords.txt
WORKDIR /app
COPY app.py .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
