FROM node:22-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy source
COPY . .

# Install with pnpm
RUN pnpm install --no-frozen-lockfile

# Bundle with verbose output
RUN echo "Starting bundle..." && cd apps/web && pnpm run bundle && echo "Bundle complete"

EXPOSE 8080
CMD ["sh", "-c", "cd apps/web && pnpm run dev"]
