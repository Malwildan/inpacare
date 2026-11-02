FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --no-audit --no-fund --workspace apps/api --include-workspace-root=false
COPY apps/api/ ./apps/api/
RUN npm run build:api

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production API_BIND=0.0.0.0:8080
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev --no-audit --no-fund --workspace apps/api --include-workspace-root=false \
    && chown -R node:node /app
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "apps/api/dist/main.js"]
