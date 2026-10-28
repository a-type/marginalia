FROM node:24-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_HAPPYVIEW_CLIENT_KEY
ENV VITE_HAPPYVIEW_CLIENT_KEY=${VITE_HAPPYVIEW_CLIENT_KEY}
ARG APP_URL=https://marginsbible.com
ENV APP_URL=${APP_URL}

RUN pnpm build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "start"]
