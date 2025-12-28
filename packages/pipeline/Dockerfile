FROM node:22-slim

FROM node:22-slim

# Install DuckDB CLI and golang-migrate for efficient data operations
RUN apt-get update && apt-get install -y wget unzip \
    && ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then DUCKDB_ARCH="linux-amd64"; MIGRATE_ARCH="linux-amd64"; \
       elif [ "$ARCH" = "arm64" ]; then DUCKDB_ARCH="linux-aarch64"; MIGRATE_ARCH="linux-arm64"; \
       else DUCKDB_ARCH="linux-amd64"; MIGRATE_ARCH="linux-amd64"; fi \
    && wget https://github.com/duckdb/duckdb/releases/download/v0.9.2/duckdb_cli-${DUCKDB_ARCH}.zip \
    && unzip duckdb_cli-${DUCKDB_ARCH}.zip \
    && mv duckdb /usr/local/bin/ \
    && chmod +x /usr/local/bin/duckdb \
    && rm duckdb_cli-${DUCKDB_ARCH}.zip \
    && wget https://github.com/golang-migrate/migrate/releases/download/v4.16.2/migrate.${MIGRATE_ARCH}.tar.gz \
    && tar -xzf migrate.${MIGRATE_ARCH}.tar.gz \
    && mv migrate /usr/local/bin/ \
    && chmod +x /usr/local/bin/migrate \
    && rm migrate.${MIGRATE_ARCH}.tar.gz \
    && apt-get remove -y wget unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN pnpm install --prod

# Copy pipeline scripts (excluding node_modules via .dockerignore)
COPY . .

# Create output directory
RUN mkdir -p /output

CMD ["node", "--max-old-space-size=8192", "etl_orchestrator.js"]
