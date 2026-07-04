# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Copy only what Next.js needs (explicit paths — avoids missing src/app in build)
COPY next.config.ts tsconfig.json postcss.config.mjs tailwind.config.js eslint.config.mjs ./
COPY public ./public
ARG GIT_SHA=unknown
RUN echo "Building app @ ${GIT_SHA}"
COPY src ./src

ENV API_INTERNAL_URL=http://go-api:8080
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
