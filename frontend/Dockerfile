# Frontend Dockerfile – built for the dev container
# Uses Node 20 (same version as the devcontainer feature)

FROM node:20-alpine AS base
WORKDIR /app

# Install production dependencies (dev dependencies are installed in devcontainer via pnpm)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose Next.js dev server port
EXPOSE 3000

# Default command – same as in the README
CMD ["npm", "run", "dev"]