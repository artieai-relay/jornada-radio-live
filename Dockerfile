FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip python3-venv git ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*
# Deno: yt-dlp's YouTube challenge solver (EJS) needs a JS runtime, or
# signature/n-challenge solving fails and every format disappears
# ("Requested format is not available").
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y --no-modify-path \
  && deno --version
# yt-dlp + the bgutil PO-token provider plugin (self-hosted YouTube audio
# resolution — public Invidious/Piped resolvers are all bot-walled now).
# yt-dlp-ejs ships the challenge solver scripts the runtime executes.
RUN python3 -m venv /opt/ytdlp-venv \
  && /opt/ytdlp-venv/bin/pip install --no-cache-dir yt-dlp yt-dlp-ejs bgutil-ytdlp-pot-provider \
  && ln -s /opt/ytdlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp
WORKDIR /app
# bgutil PO-token server (node sidecar, spawned by server.js on :4416).
RUN git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /app/bgutil \
  && cd /app/bgutil/server && npm ci && npx tsc
COPY server.js ./
EXPOSE 7860
CMD ["node", "server.js"]
