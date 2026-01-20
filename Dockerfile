# Dockerfile for Fly.io deployment
FROM node:20-alpine

# Install git (required for isomorphic-git)
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy server files
COPY server/ ./server/

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the server
CMD ["node", "server/ingestion-server.mjs"]
