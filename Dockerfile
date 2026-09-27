FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN useradd --system --uid 1001 reemhub
COPY --from=builder --chown=reemhub:reemhub /app/.next/standalone ./
COPY --from=builder --chown=reemhub:reemhub /app/.next/static ./.next/static
COPY --from=builder --chown=reemhub:reemhub /app/public ./public
USER reemhub
EXPOSE 3000
CMD ["node", "server.js"]
