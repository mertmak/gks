FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund
COPY . .
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL
ARG VITE_ENABLE_SETUP=false
ARG VITE_ENABLE_SIMULATION=false
ENV VITE_API_URL=$VITE_API_URL VITE_SOCKET_URL=$VITE_SOCKET_URL VITE_ENABLE_SETUP=$VITE_ENABLE_SETUP VITE_ENABLE_SIMULATION=$VITE_ENABLE_SIMULATION
RUN npm run build
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
