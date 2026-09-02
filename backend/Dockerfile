# syntax=docker/dockerfile:1

# ============================================================================
# Junk Tracker — production image (API + pre-built React UI, single process)
# Build from the repo root so both backend/ and frontend/ are in context:
#   docker compose --profile production up -d --build
# or directly:
#   docker build -f backend/Dockerfile -t junk-tracker .
# ============================================================================

# ---- Stage 1: build the React frontend -------------------------------------
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .
RUN npm run build

# ---- Stage 2: production runtime --------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production
# Layout mirrors the release package (/app/backend + /app/frontend/dist), so
# server.js's default JUNK_TRACKER_ROOT (one level above backend/) works as-is.
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ .
# Pre-built frontend — served by the Express app in production mode.
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist
EXPOSE 5000
CMD ["node", "server.js"]
