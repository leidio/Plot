FROM node:22-alpine

WORKDIR /app

# Install backend dependencies only
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copy backend source and prisma schema
COPY backend/src ./src
COPY backend/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/server.js"]
