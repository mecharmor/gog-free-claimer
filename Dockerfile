# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine

LABEL org.opencontainers.image.title="gog-free-games-claimer"
LABEL org.opencontainers.image.description="Automatically claims free GOG giveaway games via the GOG API"
LABEL org.opencontainers.image.source="https://github.com/mecharmor/gog-free-claimer"

WORKDIR /app

# Copy deps from builder and source files
COPY --from=builder /app/node_modules ./node_modules
COPY claimer.js     ./
COPY package.json   ./

# Create the data directory (claim history lives here)
# Mount a volume at /app/data to persist claim history across container restarts
RUN mkdir -p /app/data

# Run as non-root for security
RUN addgroup -S claimer && adduser -S claimer -G claimer
RUN chown -R claimer:claimer /app
USER claimer

# Default: run on a schedule indefinitely
# Override CMD to run once: docker run ... node claimer.js
CMD ["node", "claimer.js"]
