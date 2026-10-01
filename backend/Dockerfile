FROM node:22-alpine AS base
WORKDIR /app

# Development image
FROM base AS dev
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
RUN npm ci
COPY --chown=node:node . .
EXPOSE 3333
CMD ["sh", "-c", "npx prisma generate && npm run db:deploy && npm run start:dev"]
