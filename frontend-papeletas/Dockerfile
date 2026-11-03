FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS compilacion
WORKDIR /app
ENV NG_CLI_ANALYTICS=false NG_DISABLE_VERSION_CHECK=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
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
