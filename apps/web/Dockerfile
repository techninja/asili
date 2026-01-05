# Build stage
FROM node:22-slim as builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy source
COPY . .

# Install and build
RUN pnpm install --no-frozen-lockfile
RUN cd apps/web && pnpm run bundle
RUN cd apps/web && pnpm run build

# Production stage
FROM nginx:alpine

# Copy built webapp with all files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html/app
COPY --from=builder /app/packages /usr/share/nginx/html/packages

# Copy nginx config
COPY cdn/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
