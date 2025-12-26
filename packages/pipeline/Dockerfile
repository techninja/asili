FROM node:22-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN pnpm install --prod

# Copy pipeline scripts
COPY . .

# Create output directory
RUN mkdir -p /output

CMD ["pnpm", "run", "etl"]
