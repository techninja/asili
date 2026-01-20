FROM node:22-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/calc/package.json ./apps/calc/
COPY packages/core/package.json ./packages/core/

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core ./packages/core
COPY apps/calc ./apps/calc
COPY data ./data
COPY settings-generator.js ./

# Create directories
RUN mkdir -p /app/data_out/cache /app/server-data

# Generate settings
RUN node settings-generator.js generate

# Expose port
EXPOSE 5252

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5252/health || exit 1

# Start server
CMD ["npm", "run", "calc-server"]