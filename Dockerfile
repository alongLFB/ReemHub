FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
ARG DATABASE_URL=postgresql://uaehub:build-only-password@db:5432/uaehub?schema=public
ARG AUTH_SECRET=build-time-placeholder-secret-at-least-32-chars
ARG FIELD_ENCRYPTION_KEY=build-time-placeholder-key-at-least-32-char
ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_SECRET=$AUTH_SECRET
ENV FIELD_ENCRYPTION_KEY=$FIELD_ENCRYPTION_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate && npm run build

FROM builder AS worker
ENV NODE_ENV=production
CMD ["npm", "run", "worker"]

FROM base AS runner
ENV NODE_ENV=production
RUN useradd --system --uid 1001 uaehub
COPY --from=builder --chown=uaehub:uaehub /app/.next/standalone ./
COPY --from=builder --chown=uaehub:uaehub /app/.next/static ./.next/static
USER uaehub
EXPOSE 3000
CMD ["node", "server.js"]
