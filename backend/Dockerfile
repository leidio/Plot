FROM node:22-bookworm-slim

WORKDIR /app

# Prisma engines need OpenSSL runtime libraries in container images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install backend dependencies only
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN npx prisma generate

# Copy backend source
COPY backend/src ./src

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/server.js"]
