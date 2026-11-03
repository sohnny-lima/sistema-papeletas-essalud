FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS compilacion
WORKDIR /app
ENV NG_CLI_ANALYTICS=false NG_DISABLE_VERSION_CHECK=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
ARG APP_VERSION=1.0.0-rc.2
ARG VCS_REF=sin-revision
ARG SOURCE_URL=entrega-essalud
LABEL org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.source=$SOURCE_URL
ENV BACKEND_URL=http://backend:3000 NGINX_ENVSUBST_OUTPUT_DIR=/tmp NGINX_ENVSUBST_FILTER=BACKEND_URL
# Parches de seguridad de Alpine al construir (Trivy, rc.2): la etiqueta y su digest ya son los últimos publicados.
USER root
RUN apk upgrade --no-cache
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=compilacion /app/dist/frontend-papeletas/browser /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/salud || exit 1
CMD ["nginx", "-g", "daemon off;"]
