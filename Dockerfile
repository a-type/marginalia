FROM node:24-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json
COPY indexer/package.json ./indexer/package.json
COPY packages/atproto/package.json ./packages/atproto/package.json
COPY packages/bible/package.json ./packages/bible/package.json
RUN HUSKY=0 pnpm install --frozen-lockfile

COPY . .

ARG VITE_HAPPYVIEW_CLIENT_KEY
ENV VITE_HAPPYVIEW_CLIENT_KEY=${VITE_HAPPYVIEW_CLIENT_KEY}
ARG APP_URL=https://marginsbible.com
ENV APP_URL=${APP_URL}

RUN pnpm --filter @marginsbible/app... --recursive build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "--filter", "@marginsbible/app", "start"]
