# Multi-stage Dockerfile for Velocity Backend Service

# Stage 1: Build & Dependencies
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install build dependencies for native modules (e.g. bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild bcrypt --build-from-source

# Stage 2: Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source files (scoped by .dockerignore)
COPY . .

# Set file ownership to non-root user 'node'
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose backend service port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "index.js"]
