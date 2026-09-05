# Multi-stage Dockerfile for Velocity Frontend (React + Vite)

# Stage 1: Build static assets
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies required for build)
RUN npm ci

# Copy application source code
COPY . .

# Build arguments for client-side environment configuration (empty string defaults to same-origin /api proxy)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Build production bundle
RUN npm run build

# Stage 2: Serve static bundle with Nginx
FROM nginx:1.27-alpine AS runner

# Remove default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy built static artifacts from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose frontend application port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
