# Build context: repository root. This image contains the API only.
FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.33.0
COPY . .
RUN pnpm install --frozen-lockfile --filter @catalog/api...
RUN pnpm --filter @catalog/contracts build && pnpm --filter @catalog/api build
RUN pnpm --filter @catalog/api deploy --legacy --prod /deploy/api

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /deploy/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
