# ── Build stage ──────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

# Install deps only (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Production stage ─────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 taskflow && adduser -u 1001 -G taskflow -s /bin/sh -D taskflow

COPY --from=base /app/node_modules ./node_modules
COPY . .

RUN mkdir -p data && chown -R taskflow:taskflow /app

USER taskflow

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "src/server.js"]
