FROM node:22-slim

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code (node_modules excluded by .dockerignore)
COPY . .

# Expose port
EXPOSE 8080

# Start server
CMD ["npm", "run", "dev"]
