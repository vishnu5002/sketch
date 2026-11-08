# sketchboard + videogen: the whiteboard app and the topic-to-video pipeline in one image.
# The LLM runs in a separate Ollama container (see docker-compose.yml).
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg espeak-ng curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Node 22 (sketchboard needs >= 22.5 for node:sqlite)
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Voice: Kokoro on CPU (82M params runs faster than real time; CPU torch saves ~6 GB of CUDA libraries)
RUN pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install kokoro==0.9.4 misaki==0.9.4 soundfile numpy==1.26.4 spacy==3.7.5 \
 # spaCy's English model, from Hugging Face (its GitHub release download is flaky)
 && curl -fsSL -o /tmp/en_core_web_sm-3.7.1-py3-none-any.whl \
      https://huggingface.co/spacy/en_core_web_sm/resolve/main/en_core_web_sm-any-py3-none-any.whl \
 && pip install /tmp/en_core_web_sm-3.7.1-py3-none-any.whl && rm /tmp/*.whl
# Run as a normal user (uid 1000) so videos written to the host's videogen/out aren't owned by root.
# Model caches live in /opt, readable by everyone.
RUN useradd -m -u 1000 app && mkdir -p /app /data && chown app:app /app /data
ENV HF_HOME=/opt/hf PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
# Bake the voice weights in, so the first video doesn't download anything
RUN python -c "from kokoro import KPipeline; p = KPipeline(lang_code='b', repo_id='hexgrad/Kokoro-82M'); [p.load_voice(v) for v in ('bm_george', 'am_michael')]" \
 && chmod -R a+rX /opt/hf

WORKDIR /app
# Chromium's system libraries need root; the browser itself goes to /opt for every user
COPY videogen/package.json videogen/package-lock.json videogen/
RUN cd videogen && npm ci && npx playwright-core install --with-deps chromium-headless-shell \
 && chmod -R a+rX /opt/ms-playwright && rm -rf node_modules && chown -R app:app /app/videogen

USER app
# Dependencies first so code edits don't reinstall them
COPY --chown=app:app sketchboard/package.json sketchboard/package-lock.json sketchboard/
RUN cd sketchboard && npm ci
COPY --chown=app:app videogen/package.json videogen/package-lock.json videogen/
RUN cd videogen && npm ci

COPY --chown=app:app . .
RUN mkdir -p videogen/out && cd sketchboard && npm run build

ENV HF_HUB_OFFLINE=1 VIDEOGEN_PY=python VOICE_GPU="" OLLAMA_URL=http://ollama:11434 \
    HOST=0.0.0.0 PORT=5183 SKETCHBOARD_DATA=/data
EXPOSE 5183
VOLUME /data
CMD ["node", "sketchboard/deploy/serve.mjs"]
