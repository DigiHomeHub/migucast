FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN pnpm build

FROM node:22-alpine

WORKDIR /migu
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata \
  && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
  && echo $TZ > /etc/timezone

CMD ["node", "dist/app.js"]
