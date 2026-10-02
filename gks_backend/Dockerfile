FROM node:24-bookworm-slim
WORKDIR /app/gks_backend
COPY gks_backend/package*.json ./
RUN npm ci --omit=dev --no-fund && mkdir logs && chown node:node logs
COPY gks_backend/ ./
COPY database/migrations/ /app/database/migrations/
ENV NODE_ENV=production HOST=0.0.0.0
USER node
EXPOSE 3000
CMD ["npm", "start"]
