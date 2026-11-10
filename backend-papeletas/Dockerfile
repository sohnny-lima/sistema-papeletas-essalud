FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS base
ARG APP_VERSION=1.0.0-rc.2
ARG VCS_REF=sin-revision
ARG SOURCE_URL=entrega-essalud
LABEL org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.source=$SOURCE_URL
ENV NODE_ENV=production
# Parches de seguridad del sistema base al construir (Trivy, rc.2): la etiqueta y su digest ya son los últimos publicados.
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# npm, npx, corepack y yarn solo sirven para instalar: se retiran de la imagen (origen de las alertas de Trivy en Node.js).
RUN npm ci --omit=dev && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx \
       /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* /root/.npm
COPY --chown=node:node app.js index.js ./
COPY --chown=node:node config/ config/
COPY --chown=node:node controllers/ controllers/
COPY --chown=node:node middlewares/ middlewares/
COPY --chown=node:node routes/ routes/
COPY --chown=node:node utils/ utils/
# Esquema, migraciones y herramientas de operación. Los datos de demostración no se copian aquí:
# solo existen en la etapa «pruebas», para que no queden en ninguna capa de la imagen de producción.
COPY --chown=node:node db/esquema/ db/esquema/
COPY --chown=node:node db/migraciones/ db/migraciones/
COPY --chown=node:node scripts/migrar.js scripts/db-comun.js scripts/conceder-app.js scripts/crear-admin.js scripts/comparar-esquema.js scripts/
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/salud',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "index.js"]

# Solo para el humo y las E2E en entornos desechables: añade la carga explícita de demostración.
FROM base AS pruebas
COPY --chown=node:node db/demo/ db/demo/
COPY --chown=node:node scripts/cargar-demo.js scripts/

# Producción (etapa por defecto): sin datos ni usuarios de demostración.
FROM base AS produccion
