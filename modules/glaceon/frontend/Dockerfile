# Build context is the repository root, build with:
#   docker build -f modules/glaceon/frontend/Dockerfile -t <img> .

FROM node:22-alpine AS builder

WORKDIR /usr/app

ENV NEXT_TELEMETRY_DISABLED=1

COPY modules/glaceon/frontend/package*.json ./
RUN npm ci

COPY modules/glaceon/frontend/ ./
RUN npm run build

FROM node:22-alpine

WORKDIR /usr/app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S glaceon -G nodejs

COPY modules/glaceon/frontend/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=glaceon:nodejs /usr/app/.next ./.next
COPY --from=builder --chown=glaceon:nodejs /usr/app/next.config.mjs ./next.config.mjs

USER glaceon

EXPOSE 3021

CMD ["npm", "run", "start"]
