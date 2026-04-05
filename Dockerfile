FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy dependency manifests
COPY package.json pnpm-lock.yaml* ./
COPY patches ./patches

# Install ALL dependencies (including dev - needed for build)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY . .

# Build frontend + backend
RUN pnpm run build

ENV NODE_ENV=production

EXPOSE 3000

# Run server (migrations run via Pre-deploy command)
CMD ["node", "dist/index.js"]
