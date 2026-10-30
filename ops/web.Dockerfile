FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --no-audit --no-fund --workspace apps/web --include-workspace-root=false
COPY apps/web/ ./apps/web/
RUN npm run build --workspace apps/web

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    API_ORIGIN=http://api:8080 \
    HOST_HEADER=x-forwarded-host \
    PROTOCOL_HEADER=x-forwarded-proto
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts --workspace apps/web --include-workspace-root=false
COPY --from=build --chown=node:node /app/apps/web/build ./build
COPY --from=build --chown=node:node /app/apps/web/static ./static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
