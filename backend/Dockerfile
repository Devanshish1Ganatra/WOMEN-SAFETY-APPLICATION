# Use official Node LTS image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install app dependencies (only production)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose the API port (default 5001)
EXPOSE 5001

# Define environment variables (optional)
ENV NODE_ENV=production

# Start the server
CMD ["node", "src/server.js"]
