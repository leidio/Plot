FROM node:22-alpine

WORKDIR /app

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
