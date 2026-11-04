# Lista de aceptación · versión candidata 1.0.0-rc.1

Para la **validación final del responsable** (pendiente). Cada punto dice cómo comprobarlo a mano y qué prueba automática lo cubre ya, ejecutada en local el 28/10/2026 (detalle en `docs/revision/resultados-pruebas.md`). Marque `[x]` lo conforme y anote las diferencias con los pasos para reproducirlas.

**Entornos de prueba** (datos ficticios; se arrancan y detienen como indica `docs/revision/README-revision.md`):
- **Revisión funcional:** http://localhost:4200, con la base `bd_papeleta_test` (PA-0001…PA-0003, CERCA y sus datos).
- **Instalación Docker:** http://localhost:8080. Escenario A, con la base del contenedor cargada con los datos de demostración.

Credenciales de demostración, **solo en entornos de prueba**: `admin_prueba` / `Admin.Prueba1` y `usuario_prueba` / `Usuario.Prueba1`.

> Las referencias a `docs/revision/` remiten a la documentación interna de la revisión, que se conserva fuera del repositorio público.

> Todo lo automático se probó contra el **esquema reconstruido**. Nada de esta lista valida la base real de EsSalud (punto G2).

## Revisión manual del responsable (comunicada el 01/11/2026). VALIDACIÓN PARCIAL
Solo lo que el responsable confirmó. Se marca `[x]` un punto únicamente si su revisión lo cubre entero; si lo cubre en parte, se anota junto al punto.

| Confirmado por el responsable | Punto |
|---|---|
| Acceso con las dos cuentas, con el indicador de usuario y rol | H1 (en parte: no indicó el móvil) |
| Equipos, Lugares y los demás módulos recorridos cargan con normalidad | I1 (en parte) |
| Tras unos ocho minutos sin actividad, Equipos vuelve a cargar sin el 503 | I1 (en parte: rol no indicado). VM1 sigue **mitigada**, sin causa confirmada |
| PA-0002 aparece guardada; su número y su fecha coinciden con el PDF | C (observación; no equivale a C1) |
| El PDF se abre completo; Dependencia y Ambiente bien ubicados | **C2 [x]** |
| La fecha editada de PA-0001 se ve en el listado como 29/10/2026 | C5 (en parte: no indicó el PDF) |
| Alta del centro HUANTA y cambio de nombre a HOSPITAL DE PRUEBA NORTECITO; rechazo de nombres duplicados | D1 (en parte: no indicó el nombre vacío ni el cambio de mayúsculas) |
| Alta del lugar DAS y edición de OFICINA 101 | D (observación) |
| Alta y edición de equipos y de trabajadores | B5 (en parte) |
| Alta de `revision_manual` y acceso con esa cuenta | H3 (en parte: no indicó los rechazos) |
| Desactivación de `revision_manual`: su inicio de sesión se rechaza con el aviso | H5 (en parte: no indicó la reactivación ni el historial) |
| Cambio de rol | H4 (en parte) |
| Lugares en modo consulta para el usuario normal, sin acciones de administración | **B3 [x]** |
| El usuario normal no puede entrar en Centros: vuelve al Dashboard | B4 (en parte: el menú de una pestaña antigua seguía mostrando «Centros»; es la incidencia corregida en J) |

**Incidencia comunicada:** con dos pestañas del mismo perfil, tras cerrar sesión en una y entrar como `usuario_prueba`, la otra seguía con el menú de administrador hasta recargar (sin acceso real: la API negaba Centros). Corregida el 01-02/11/2026; ver J.

**Ajuste de datos (Claude, 01/11/2026):** `usuario_prueba` había quedado como Administrador en `:8080` por la prueba de cambio de rol; se devolvió a Usuario por la API. `admin_prueba` sigue como Administrador. Los demás datos de la revisión (PA-0002, HUANTA, DAS, nombres editados, el trabajador creado y `revision_manual` desactivada) se conservan.

## A. Acceso y sesión
- [ ] A1. Una clave incorrecta muestra «Usuario o contraseña incorrectos.» (el mismo mensaje si el usuario no existe). *Automático:* API (`entrega.test.js`, `seguridad.test.js`) y E2E `flujos-entrega`.
- [ ] A2. Con el servidor detenido, el login dice que no se pudo conectar, no «credenciales incorrectas». *Automático:* `entrega-login.spec.ts` y E2E.
- [ ] A3. Varios intentos **fallidos** seguidos acaban en «Demasiados intentos. Espere unos minutos.»; los accesos correctos no cuentan. *Automático:* `seguridad.test.js`.
- [ ] A4. Con la sesión caducada, vuelve al login con «Su sesión ha caducado…» y sin ventanas de error superpuestas. (El cierre de sesión en otra pestaña tiene ahora su propio aviso: J1.) *Automático:* `sesion-caducada.spec.ts` (incluye el 401 sin token) y E2E.
- [ ] A5. Tras entrar, llega al dashboard una sola vez, sin parpadeo ni doble redirección. *Automático:* E2E.

## B. Permisos visibles (usuario normal)
- [ ] B1. Equipos y Trabajadores: puede agregar y editar; **no** ve Eliminar. *Automático:* `a8-entrega.spec.ts`, E2E y API (403).
- [ ] B2. Papeletas: puede crear, editar y descargar el PDF; **no** ve Eliminar. *Automático:* ídem.
- [x] B3. **Conforme (responsable, 01/11/2026).** Lugares: solo consulta, con el aviso «Modo consulta»; no hay «Nuevo lugar», Editar ni Eliminar. *Automático:* `a8-permisos-lugares.spec.ts`, E2E `flujos-centros`.
- [ ] B4. El menú no muestra «Centros asistenciales»; si se escribe la dirección, vuelve al dashboard. *Automático:* `admin.guard.spec.ts`, E2E.
- [ ] B5. El administrador sí ve y puede usar todas esas acciones. *Automático:* E2E con los dos roles.

## C. Papeletas y PDF
- [ ] C1. Al crear una papeleta, el aviso muestra el número definitivo `PA-NNNN`. *Automático:* E2E `flujos-ui`.
- [x] C2. **Conforme (responsable, 01/11/2026).** El PDF muestra **Dependencia** y **Ambiente** correctos en origen y destino (compárelos con la pantalla de Lugares). *Automático:* `papeleta-pdf.spec.ts`; PDF de PA-0001 revisado por Claude.
- [ ] C3. La tabla de bienes del PDF tiene sus seis columnas alineadas y los recuadros de firma.
- [ ] C4. A 1280-1440 px, la tabla de Papeletas muestra el número y las acciones sin desplazamiento horizontal. *Automático:* capturas `pruebas/capturas-entrega/c003-*`.
- [ ] C5. Editar la fecha de una papeleta la cambia en la tabla y en el PDF. *Automático:* API y E2E.
- [ ] C6. Movimientos: cada registro muestra la fecha correcta y el número de papeleta. *Automático:* API (`entrega.test.js`).

## D. Centros asistenciales y lugares (administrador)
- [ ] D1. Crear y renombrar centros. Se rechazan el nombre vacío y los duplicados, aunque cambien mayúsculas o espacios. *Automático:* `centros.test.js` y E2E `flujos-centros`.
- [ ] D2. En «Nuevo lugar», «Nuevo centro» crea el centro y lo deja elegido sin perder ambiente ni dependencia. *Automático:* E2E.
- [ ] D3. Un centro o lugar en uso no se puede eliminar y el sistema lo explica. *Automático:* API y E2E.

## E. Instalación con Docker (entorno de prueba)
- [ ] E1. `docker compose ps`: todos los servicios aparecen como `healthy`. *Automático:* `humo.sh` (`up --wait`).
- [ ] E2. Recargar una página interna (por ejemplo, `/menu-principal/papeletas`) no da error 404. *Automático:* `humo.sh`.
- [ ] E3. La base y la API no son accesibles desde fuera: solo está publicado el puerto web. *Automático:* `humo.sh` (`docker inspect`).
- [ ] E4. Tras `docker compose restart`, o tras `down` y `up` sin `-v`, los datos siguen. *Automático:* `humo.sh` (persistencia) y c005.
- [ ] E5. Una copia de seguridad se restaura en una base temporal con los mismos recuentos; un volcado dañado no toca la base destino. *Automático:* c004b y c005b.
- [ ] E6. El primer administrador se crea con `crear-admin.js`, sin claves en la línea de órdenes. *Automático:* `humo.sh` y `seguridad.test.js`.
- [ ] E7. En producción no se cargan datos de demostración: solo existe la orden explícita `cargar-demo --confirmar-demo`, que exige la base vacía.
- [ ] E8. La API usa un rol de base de datos **sin** permisos de estructura (DDL); las migraciones usan el propietario. *Automático:* `humo.sh` (`roles-docker-g012.cjs`).
- [ ] E9. Cada cabecera de seguridad (CSP, `X-Frame-Options`, etc.) aparece una sola vez y no se carga nada de Internet. *Automático:* `humo.sh` y `flujos-docker`.

## H. Cuentas de usuario e indicador de sesión (bloque U, 28/10/2026)
- [ ] H1. Arriba a la derecha se ve siempre «admin_prueba · Administrador» o «usuario_prueba · Usuario», también en el móvil. *Automático:* `menu-principal.component.spec.ts` y E2E `flujos-usuarios` (a, d y e).
- [ ] H2. «Usuarios» solo aparece para el administrador; el usuario normal no lo ve, la dirección lo devuelve al dashboard y la API le responde 403. *Automático:* E2E `flujos-usuarios` (d) y `usuarios-bloque-u.test.js`.
- [ ] H3. Crear una cuenta: se rechazan el nombre repetido (aunque cambien las mayúsculas), el formato inválido y la contraseña débil o sin confirmar. *Automático:* specs F-05, E2E (a) y B-09.
- [ ] H4. Editar nombre, perfil y contraseña. Al cambiar el perfil o la contraseña de otra persona, su sesión abierta se cierra. *Automático:* B-05 y B-06.
- [ ] H5. Desactivar una cuenta: no puede entrar («La cuenta está desactivada…») y conserva su historial; al reactivarla vuelve a entrar. *Automático:* E2E (b), B-03 y B-13.
- [ ] H6. Su propia cuenta aparece como «Sesión actual»: no puede cambiar su perfil ni desactivarse; si cambia su contraseña, la sesión se cierra con el aviso informativo. *Automático:* E2E (c y f), F-06 y B-10.
- [ ] H7. No se puede dejar el sistema sin administradores activos, ni con dos peticiones a la vez. *Automático:* E2E (c), B-11 y B-12 (concurrencia).
- [ ] H8. Las cuentas no se pueden borrar (solo desactivar). *Automático:* B-13 y E2E (c).

## I. Estabilidad tras inactividad, fallos de conexión y registros (incidencia VM1, 29/10/2026)
VM1 sigue **mitigada**, no cerrada: su causa histórica es probable pero no está confirmada (`docs/revision/incidencia-vm1-503-equipos.md`).

- [ ] I1. En http://localhost:8080, con cada rol: entrar, abrir Equipos, recorrer los módulos, dejar la aplicación más de 10 s sin uso (mejor varios minutos) y volver a Equipos. Carga sin error. *Automático:* `flujos-vm1-docker.mjs` `FASE=normal` (ambos roles; 60 s, y 450 s con `usuario_prueba`), `incidencia-vm1.test.js`.
- [ ] I2. **Base caída.** Con `wsl -d Ubuntu -- docker stop essalud-revision-db-1`, Equipos muestra «Error de conexión con el servidor» en menos de 15 s; el aviso se cierra y el menú responde. Con `docker start essalud-revision-db-1`, a los ~15 s todo vuelve **sin iniciar sesión otra vez**. *Automático:* `flujos-vm1-docker.mjs` `FASE=sesion`, `caida` y `recuperacion`, y `cierre-vm1.test.js`.
- [ ] I3. **Registros.** En `wsl -d Ubuntu -- docker logs --since 5m essalud-revision-frontend-1` y `… essalud-revision-backend-1`, cada petición tiene el mismo `idPeticion` en Nginx y en el backend, con su duración. No aparecen query strings, contraseñas ni tokens: probar una búsqueda en Trabajadores. *Automático:* `cierre-vm1.test.js` y la comprobación por `curl` del 29/10.
- [ ] I4. **Límites.** Los valores de `DB_*_TIMEOUT_MS` y `ACCESS_LOG_ENABLED` están documentados en `configuracion.md`. Una consulta que supera el límite responde 503 «tardó demasiado» y la siguiente funciona; una transacción cortada no deja datos a medias. *Automático:* `cierre-vm1.test.js`.
- [ ] I5. Si vuelve a aparecer un 503, anote la hora y busque su `idPeticion` en los dos registros. La etiqueta indica la causa (`configuracion.md`, «Registros»): así se confirmaría o descartaría la causa de VM1.

## J. Sesión entre pestañas y listados unificados (01-02/11/2026). PENDIENTE de la revisión del responsable
Pruebe con **dos pestañas del mismo perfil** de Chrome (no una ventana privada ni otro perfil: esos tienen su propia sesión, independiente).
- [ ] J1. Con las dos pestañas dentro, cierre sesión en una: la otra pasa sola al login con «La sesión se cerró en otra pestaña.» y sin diálogos abiertos. *Automático:* `sesion-pestanas.spec.ts` (SP-1, SP-13, SP-15) y E2E `flujos-pestanas` (b).
- [ ] J2. Entre en una con la otra cuenta: la otra se recarga sola y muestra el nuevo nombre, rol, menú y contenido; si estaba en Centros o Usuarios con `usuario_prueba`, vuelve al Dashboard. *Automático:* SP-2 y `flujos-pestanas` (a).
- [ ] J3. Con una pestaña en el login, entre en la otra: la primera pasa sola al menú. *Automático:* SP-3 y `flujos-pestanas` (c).
- [ ] J4. Una ventana privada u otro perfil con su propia sesión no cambia. *Automático:* `flujos-pestanas` (d).
- [ ] J5. Un formulario o una confirmación abiertos con la cuenta anterior no se pueden enviar con la nueva, y las respuestas pendientes no muestran datos antiguos. *Automático:* SP-8, SP-10 a SP-12 y `flujos-pestanas` (e).
- [ ] J6. Equipos, Lugares, Centros, Papeletas, Trabajadores y Usuarios tienen el mismo encabezado, buscador (filtro a la izquierda, campo y botón alineados), tabla de encabezado azul claro, contador y paginación. *Automático:* capturas de `docs/revision/pruebas/capturas-sesion-listados/`.
- [ ] J7. En el móvil, cada registro es una ficha con todos sus datos y acciones, sin desplazamiento horizontal, también en Equipos; los diálogos caben en la pantalla y su botón de guardar se alcanza. *Automático:* E2E `flujos-responsive` (360, 768 y 1280 px, los dos roles).
- [ ] J8. Los filtros y permisos de cada módulo siguen como antes (B1-B5). *Automático:* `a8-entrega.spec.ts` y specs `LV …` de cada módulo.

## K. Versión candidata 1.0.0-rc.2 y paquete de instalación (03/11/2026). PENDIENTE de la revisión del responsable
Instale usted el paquete publicado en el Release de GitHub, en WSL y en un entorno aparte, sin clonar el repositorio. **No toca `:8080` ni `:4200`.** Los pasos (PowerShell, una vez):
1. `wsl -d Ubuntu -u root`, y dentro:
   ```bash
   mkdir -p /root/aceptacion-rc2 && cd /root/aceptacion-rc2
   u=https://github.com/sohnny-lima/sistema-papeletas-essalud/releases/download/v1.0.0-rc.2
   curl -fLO $u/papeletas-essalud-1.0.0-rc.2.tar.gz -fLO $u/papeletas-essalud-1.0.0-rc.2.tar.gz.sha256
   sha256sum -c papeletas-essalud-1.0.0-rc.2.tar.gz.sha256 && tar -xzf papeletas-essalud-1.0.0-rc.2.tar.gz
   cd papeletas-essalud-1.0.0-rc.2 && cp compose/env.example compose/.env
   sed -i 's/^PROYECTO=.*/PROYECTO=papeletas-aceptacion/; s/^HTTP_PORT=.*/HTTP_PORT=18190/' compose/.env
   bash scripts/instalar.sh
   ```
   El instalador pide el nombre y la contraseña del primer administrador (sin eco).
2. Abra http://localhost:18190 en Chrome. Por defecto, `TLS=institucional`: en local no hay proxy HTTPS, y para probar HTTPS propio hace falta un certificado.
3. Al terminar: `bash scripts/compose.sh down` (conserva el volumen). Para borrarlo todo: `docker compose -p papeletas-aceptacion down -v` (solo ese proyecto).

- [ ] K1. `verificar-paquete.sh` e `instalar.sh` terminan con «RESULTADO: todo correcto» sin conexión a GitHub ni compilación. *Automático:* instalación en limpio (`docs/revision/rc2/informe.md` §6).
- [ ] K2. El pie de página muestra «versión 1.0.0-rc.2» y ninguna declaración de titularidad. *Automático:* spec `RC2 pie neutral`.
- [ ] K3. La instalación nueva no trae datos de demostración: solo su administrador; roles, tipos de formulario y estados sí. *Automático:* instalación en limpio.
- [ ] K4. Cree un usuario normal y compruebe los permisos (B1-B5) y la sesión entre pestañas (J1-J5) sobre esta instalación.
- [ ] K5. `bash scripts/copia.sh --pausar` y `bash scripts/verificar-copia.sh copias/<archivo>.dump` terminan bien. *Automático:* instalación en limpio.
- [ ] K6. Revise `documentacion/guia-instalacion.md` y `LEEME.txt` del paquete: ¿le resultan claros para quien instale?
- [ ] K7. Revise los borradores `documentacion/acerca-del-sistema.md`, `acta-entrega-recepcion.md` y `condiciones-de-uso.md` (pendientes de validación institucional y legal).
- [ ] K8. Decida sobre la revocación por sesión (`docs/revision/rc2/propuesta-revocacion-sesion.md`).

## F. Pendiente de decisión (no bloquea la aceptación técnica)
- [ ] F1. Numeración: ¿se acepta que borrar la última papeleta permita reutilizar su número? Opciones en `docs/revision/trazabilidad-y-numeracion.md`.
- [ ] F2. Auditoría persistente (tabla o sistema de registros) frente al registro actual en la salida de los contenedores.
- [ ] F3. Política de contraseñas por defecto: 10 caracteres, letras y números (`PASSWORD_MIN_LENGTH`).
- [ ] F4. Límite de intentos de login (10 fallos por IP en 15 min) si muchos usuarios comparten IP.
- [ ] F5. Resto de decisiones de `docs/revision/pendientes.md`.

## G. Antes de instalar en el servidor real
- [ ] G1. Datos del servidor completados (`datos-servidor.md`).
- [ ] G2. Esquema real obtenido (`obtener-esquema.sh`) y comparado (`comparar-esquema.js`); migraciones probadas en una **copia** de la base real.
- [ ] G3. HTTPS resuelto (proxy institucional o certificado) y `TRUST_PROXY` ajustado.
- [ ] G4. CI ejecutada en verde en GitHub tras autorizar el push. Está preparada y validada con `actionlint`, pero no se ha ejecutado.
- [ ] G5. Copia diaria programada, con destino externo y una restauración de prueba (`copias-y-restauracion.md`).
- [ ] G6. Revisión manual del bloque 1 y de las ampliaciones (pendiente desde el 27/10/2026).
