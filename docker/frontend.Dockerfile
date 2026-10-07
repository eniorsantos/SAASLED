# Painel (Vite build → Nginx). VITE_API_URL vazio: o Nginx proxya /api p/ a API.
# context: raiz do repo
FROM node:22-bookworm AS build
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
