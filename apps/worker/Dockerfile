FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY apps/worker ./apps/worker
COPY apps/web/prisma ./apps/web/prisma
COPY apps/web/prisma.config.ts ./apps/web/
COPY apps/web/src/lib/llm.ts ./apps/web/src/lib/
COPY apps/web/src/lib/search.ts ./apps/web/src/lib/
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/worker
RUN pnpm prisma generate

CMD ["pnpm", "start"]
