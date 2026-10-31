FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json
COPY indexer/package.json ./indexer/package.json
COPY packages/atproto/package.json ./packages/atproto/package.json
COPY packages/bible/package.json ./packages/bible/package.json
RUN HUSKY=0 pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @marginsbible/indexer... --recursive build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/indexer/dist-indexer ./dist-indexer
COPY indexer/package.json ./package.json
ENV NODE_ENV=production
ENV HOST=::
ENV PORT=3000
ENV INDEXER_DATABASE_PATH=/data/annotations.sqlite
EXPOSE 3000
CMD ["node", "dist-indexer/server.js"]
