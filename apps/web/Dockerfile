FROM node:22-slim

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/

# Install all dependencies via workspace
RUN pnpm install --frozen-lockfile

# Copy application files
COPY apps/web/ ./apps/web/
COPY packages/core/src ./packages/core/src
COPY packages/core/package.json ./packages/core/
COPY settings-generator.js ./

# Build dependencies during Docker build (run from web app directory)
RUN cd apps/web && pnpm run build

# Create required directories
RUN mkdir -p /app/data_out \
    && mkdir -p /app/server-data

# Set working directory to web app
WORKDIR /app/apps/web

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose port
EXPOSE 80

# Start unified server
CMD ["sh", "entrypoint.sh"]