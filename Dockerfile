# CocoaAir: the web app plus its signalling server, in one small image.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
COPY . .
RUN npx vite build && npx vite build --config vite.server.config.ts && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN useradd --create-home --uid 10001 cocoa
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/package.json ./
USER cocoa
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
