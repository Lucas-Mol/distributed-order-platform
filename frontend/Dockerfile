FROM node:22-alpine AS base
WORKDIR /app

# Development image
FROM base AS dev
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
RUN mkdir .next
COPY --chown=node:node . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
