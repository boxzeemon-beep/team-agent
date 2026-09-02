# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/coordinator/package.json apps/coordinator/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/coordinator apps/coordinator
COPY packages/shared packages/shared
RUN pnpm --filter @team-agent/coordinator build

FROM node:22-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/boxzeemon-beep/team-agent"
LABEL org.opencontainers.image.description="Team Agent coordinator"
LABEL org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
ENV TEAM_AGENT_HOST=0.0.0.0
ENV TEAM_AGENT_PORT=4310
ENV TEAM_AGENT_DATA_DIR=/data
ENV TEAM_AGENT_PUBLIC_URL=http://localhost:4310

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/coordinator/node_modules ./apps/coordinator/node_modules
COPY --from=build /app/apps/coordinator/dist ./apps/coordinator/dist

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 4310
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4310/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/coordinator/dist/server/index.js"]
