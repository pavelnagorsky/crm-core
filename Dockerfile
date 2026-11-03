# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY src/database ./src/database
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

# Prisma CLI is deliberately kept in a separate, one-shot migration image.
FROM dependencies AS migrate
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "db:deploy"]

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node --input-type=module -e "try { const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', { signal: AbortSignal.timeout(4000) }); process.exit(r.ok ? 0 : 1); } catch { process.exit(1); }"
CMD ["node", "dist/main.js"]
