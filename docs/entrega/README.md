# Entrega del sistema de papeletas EsSalud

Versión candidata: pendiente de validación del responsable y de los datos del
servidor. Las pruebas usan un **esquema reconstruido y datos ficticios**. No se ha
desplegado en la institución ni validado su base real.

Leer en este orden:

1. [Datos del servidor](datos-servidor.md): completar plataforma, red, TLS, base y responsables.
2. [Lista de aceptación](lista-aceptacion.md) y [manual de uso](manual-uso.md).
3. [Configuración](configuracion.md): variables, secretos y valores por defecto.
4. [Instalación](guia-instalacion.md): escenario A o B, primer administrador y comprobación.
5. [Copias y restauración](copias-y-restauracion.md): programar y ensayar antes de habilitar usuarios.
6. [Actualización y reversión](actualizacion-y-reversion.md): conservar imágenes y copia anterior.

Referencias operativas: [Docker](docker.md), [base de datos](base-de-datos.md),
[trazabilidad y numeración](../revision/trazabilidad-y-numeracion.md).

La CI está preparada para backend, frontend, auditorías npm y Docker con humo,
persistencia y E2E. **Pendiente de ejecutar en GitHub**, porque no se ha autorizado
push. Evidencia local: [resultados de las pruebas](../revision/resultados-pruebas.md) (c006 lo terminó Claude, porque Codex se quedó sin cuota).
El ensayo desechable se reproduce desde la raíz, en Linux/WSL con Docker,
Compose v2, Buildx, Bash y Python 3:

```bash
bash deploy/scripts/humo.sh
# Con Node de .node-version, npm ci en docs/revision/pruebas/e2e y Chrome instalado:
bash deploy/scripts/humo.sh --e2e
```

El guion genera secretos privados en /tmp, no lee deploy/.env, construye sin
publicar, usa un puerto web aleatorio en localhost y elimina su proyecto con
down -v incluso ante fallo. Compara docker volume ls antes/después. Conserva las
imágenes construidas y no elimina recursos de otros proyectos. No ejecutarlo en
un motor con otras operaciones simultáneas que creen o borren volúmenes: la
comparación global detectaría ese cambio. Necesita uid 1000 o sudo para asignar los
secretos que lee Node; nunca hacerlos legibles para todos. En Windows, ejecutar
el guion en WSL; --ejecutor-e2e permite un ejecutor externo con Chrome Windows,
recibiendo cada nombre de flujo como último argumento y UI_URL/API_URL por entorno.
