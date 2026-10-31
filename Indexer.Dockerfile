FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json
COPY indexer/package.json ./indexer/package.json
COPY packages/atproto/package.json ./packages/atproto/package.json
COPY packages/bible/package.json ./packages/bible/package.json
RUN HUSKY=0 pnpm --filter @marginsbible/indexer... install --frozen-lockfile
COPY . .
RUN pnpm --filter @marginsbible/indexer... --recursive build
RUN pnpm --filter @marginsbible/indexer deploy --prod --legacy /out/indexer

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /out/indexer ./
ENV NODE_ENV=production
ENV HOST=::
ENV PORT=3000
ENV INDEXER_DATABASE_PATH=/data/annotations.sqlite
EXPOSE 3000
CMD ["node", "src/main.ts"]
