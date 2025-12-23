FROM node:18-alpine

WORKDIR /app

# 1. Install dependencies
# We copy package.json first to leverage Docker layer caching.
# If package.json hasn't changed, Docker won't re-run npm install.
COPY package*.json ./
RUN npm install

# 2. Copy source code
COPY . .

# 3. Expose the port (matches docker-compose)
EXPOSE 3000

# 4. Start command
# --host is CRITICAL: By default Vite listens on localhost (127.0.0.1) inside
# the container, which is invisible to your browser. --host 0.0.0.0 fixes this.
CMD ["npm", "run", "dev", "--", "--host"]
