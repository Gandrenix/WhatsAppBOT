# Funciona en servidores ARM (Oracle Ampere A1) y x86.
# Se usa el Chromium del sistema porque Puppeteer no publica Chromium para Linux ARM64.
FROM node:22-bookworm-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATA_DIR=/app/data \
    TZ=America/Bogota \
    NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# /app/data guarda la sesión de WhatsApp y las citas (se monta como volumen)
RUN mkdir -p /app/data && chown -R node:node /app
USER node

CMD ["node", "bot.js"]
