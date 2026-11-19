FROM node:24-alpine AS builder

WORKDIR /usr/app

COPY modules/glaceon/backend ./modules/glaceon/backend

WORKDIR /usr/app/modules/glaceon/backend

RUN npm ci
RUN npm run build

FROM node:24-alpine

WORKDIR /usr/app

RUN addgroup -S nodejs && adduser -S glaceon -G nodejs

COPY modules/glaceon/backend/package*.json ./modules/glaceon/backend/

WORKDIR /usr/app/modules/glaceon/backend

RUN npm ci --omit=dev

COPY --from=builder --chown=glaceon:nodejs /usr/app/modules/glaceon/backend/dist ./dist

USER glaceon

CMD ["node", "dist/main"]
