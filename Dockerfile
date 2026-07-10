FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS runtime
COPY tsconfig.json ./
COPY src ./src
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/radar.sqlite
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["pnpm", "start"]
