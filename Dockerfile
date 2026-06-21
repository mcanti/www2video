FROM node:22-alpine AS builder
WORKDIR /app
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

FROM node:22-alpine
RUN apk add --no-cache ffmpeg python3 make g++ chromium gcompat font-noto-emoji
RUN npm install -g @puppeteer/browsers && \
  npx @puppeteer/browsers install chrome-headless-shell@latest && \
  CHS_BIN=$(find /chrome-headless-shell -name chrome-headless-shell -type f) && \
  ln -sf "$CHS_BIN" /usr/local/bin/chrome-headless-shell
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV CHROME_HEADLESS_SHELL_PATH=/usr/local/bin/chrome-headless-shell
ENV HYPERFRAMES_BROWSER_PATH=/usr/local/bin/chrome-headless-shell
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist
RUN mkdir -p /app/server/data /app/server/renders
EXPOSE 3007
CMD ["node", "server/src/index.js"]
