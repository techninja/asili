FROM node:22-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml* ./

# Install with pnpm (much faster)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Bundle with verbose output
RUN echo "Starting bundle..." && pnpm run bundle && echo "Bundle complete"

EXPOSE 8080
CMD ["pnpm", "run", "dev"]
