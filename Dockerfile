
# syntax=docker/dockerfile:1

# ==========================================
# 1. Dependencies
# ==========================================
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund


# ==========================================
# 2. Build
# ==========================================
FROM node:24-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# ==========================================
# 3. Production runtime
# ==========================================
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Run as non-root
USER node

# Copy only the files required at runtime
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/messages ./messages
COPY --from=builder --chown=node:node /app/dataset_crawler-google-places.json ./dataset_crawler-google-places.json

EXPOSE 3000

CMD ["node", "server.js"]
