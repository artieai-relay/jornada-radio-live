FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip python3-venv git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# yt-dlp + the bgutil PO-token provider plugin (self-hosted YouTube audio
# resolution — public Invidious/Piped resolvers are all bot-walled now).
RUN python3 -m venv /opt/ytdlp-venv \
  && /opt/ytdlp-venv/bin/pip install --no-cache-dir yt-dlp bgutil-ytdlp-pot-provider \
  && ln -s /opt/ytdlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp
WORKDIR /app
# bgutil PO-token server (node sidecar, spawned by server.js on :4416).
RUN git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /app/bgutil \
  && cd /app/bgutil/server && npm ci && npx tsc
COPY server.js ./
EXPOSE 7860
CMD ["node", "server.js"]
