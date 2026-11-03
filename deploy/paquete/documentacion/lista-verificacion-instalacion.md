# Lista de verificación de la instalación

Esta lista de verificación constituye el documento de control técnico para el personal responsable del despliegue del **Sistema de Papeletas de Movimiento de Bienes Patrimoniales (Formato Único Patrimonial)** en los servidores de EsSalud. 

Debe completarse, verificarse casilla por casilla y adjuntarse al **Acta de Entrega y Recepción** de la instalación.

---

## Ficha técnica del despliegue

| Campo | Valor registrado |
|---|---|
| **Nombre del servidor (Hostname):** | `<A DEFINIR por EsSalud>` |
| **Dirección IP del servidor:** | `<IP interna de este servidor A DEFINIR>` |
| **Versión del paquete instalada:** | `<versión de VERSION, ej. 1.0.0>` |
| **Identificador de compilación (Commit / VCS_REF):** | `<commit de VERSION>` |
| **Escenario de base de datos:** | ☐ Escenario A (Contenedor local) &nbsp;&nbsp;&nbsp; ☐ Escenario B (PostgreSQL corporativo) |
| **Modalidad HTTPS / TLS:** | ☐ TLS institucional (Proxy corporativo) &nbsp;&nbsp;&nbsp; ☐ TLS propio (Certificado local) |
| **Nombre de dominio / URL de acceso:** | `<dominio A DEFINIR por EsSalud>` |
| **Responsable técnico de la instalación:** | `<Nombre y apellidos / Área>` |
| **Responsable que recibe la instalación:** | `<Nombre y apellidos / Cargo>` |
| **Fecha y hora de instalación:** | `<AAAA-MM-DD HH:MM>` |

---

## 1. Integridad del paquete y entorno de ejecución

- [ ] **1.1 Suma de control del archivo comprimido:** Se comprobó la integridad del archivo `papeletas-essalud-<VERSION>.tar.gz` mediante `sha256sum -c papeletas-essalud-<VERSION>.tar.gz.sha256` antes de desempaquetar.
- [ ] **1.2 Integridad de archivos internos del paquete:** Se ejecutó `sudo bash scripts/verificar-paquete.sh` obteniendo conformidad en todos los archivos frente a `SHA256SUMS`.
- [ ] **1.3 Versiones de Docker:** Se confirmó que el servidor cuenta con Docker Engine versión ≥ 24.0 y Docker Compose complemento v2 versión ≥ 2.20 (`docker version` y `docker compose version`).
- [ ] **1.4 Capacidad de almacenamiento:** Se verificó que el servidor dispone de al menos 10 GB libres en la partición donde operará Docker (`df -h`).
- [ ] **1.5 Configuración de entorno (`compose/.env`):** Se generó el archivo a partir de `compose/env.example`, se asignaron permisos estrictos `chmod 600 compose/.env` y se verificó que **no contiene contraseñas ni claves secretas**.
- [ ] **1.6 Permisos de la carpeta de secretos:** La carpeta `secretos/` tiene permisos `0700` y sus archivos internos permisos `0600`, con propietario UID 1000 para claves de base de datos/JWT y UID 101 para certificados TLS.

---

## 2. Servicios, salud de contenedores y persistencia (Sección E)

- [ ] **2.1 Servicios en estado saludable (E1):** La ejecución de `sudo bash scripts/comprobar.sh` y `sudo bash scripts/compose.sh ps` certifica que todos los contenedores (`frontend`, `backend` y `db` en escenario A) se encuentran en estado `healthy`.
- [ ] **2.2 Recarga directa de rutas internas SPA (E2):** Al navegar e interactuar en el sistema y recargar una ruta interna en el navegador (por ejemplo `/menu-principal/papeletas`), Nginx sirve la aplicación Angular correctamente sin arrojar error HTTP 404.
- [ ] **2.3 Aislamiento de red y puertos cerrados (E3):** Se verificó mediante `comprobar.sh` e inspección de puertos que la API Express (puerto 3000) y PostgreSQL (puerto 5432) **no tienen ningún puerto publicado hacia el exterior**. Solo el puerto web aprobado (8080 en frontend o 443 en proxy) es alcanzable.
- [ ] **2.4 Persistencia de datos ante reinicios (E4):** Se verificó que tras reiniciar los servicios (`sudo bash scripts/compose.sh restart`) o tras detenerlos y volver a levantarlos con el envoltorio (`sudo bash scripts/compose.sh down` seguido de `up -d`), la base de datos conserva íntegros sus registros y configuración.
- [ ] **2.5 Copia y verificación de respaldo (E5):** Se generó una copia con `scripts/copia.sh` y se validó satisfactoriamente su restauración de prueba en una base temporal mediante `sudo bash scripts/verificar-copia.sh <archivo.dump>`, confirmando la coincidencia exacta de recuentos de filas frente a `.counts`.
- [ ] **2.6 Ausencia de datos de demostración (E7):** Se certificó que la imagen de producción no contiene datos ficticios de demostración (`db/demo/` ausente) y que la base de datos únicamente cuenta con las tablas del esquema y los catálogos del sistema cargados por `migrar.js --catalogos-iniciales`.
- [ ] **2.7 Mínimos privilegios del rol de la API (E8):** Se comprobó que la API Express se conecta a PostgreSQL mediante el rol limitado `DB_USER` (`papeletas_app`), el cual carece de permisos DDL (no puede alterar tablas, borrar esquemas ni crear objetos) y no posee privilegios administrativos.
- [ ] **2.8 Cabeceras de seguridad HTTP (E9):** Se verificó mediante las herramientas de desarrollo del navegador o mediante `curl -I` que las cabeceras `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: same-origin` se emiten una sola vez y que la aplicación no carga recursos de servidores externos de Internet.

---

## 3. Seguridad web, HTTPS y cortafuegos

- [ ] **3.1 Tráfico web cifrado:** El acceso de los usuarios finales al sistema se realiza estrictamente a través de protocolo HTTPS en el puerto 443, con certificado institucional emitido para el dominio asignado.
- [ ] **3.2 Reenvío correcto de cabeceras:** En caso de utilizar proxy institucional corporativo (`TLS=institucional`), se verificó que el proxy reenvía `Host`, `X-Forwarded-For` con la IP real del usuario y `X-Forwarded-Proto: https`.
- [ ] **3.3 Saltos o direcciones de proxy confiables (`TRUST_PROXY`):** Se ajustó el valor de `TRUST_PROXY` en `compose/.env` a `false`, al número exacto de saltos o a las IPs/subredes del proxy institucional, asegurando el funcionamiento correcto del limitador de intentos de acceso.
- [ ] **3.4 Configuración del cortafuegos del servidor:** En el cortafuegos del servidor anfitrión solo se encuentra publicado hacia la red de usuarios el puerto 443 (y puerto 80 únicamente para redirección si aplica), encontrándose el puerto SSH restringido a la red de gestión autorizada de EsSalud.

---

## 4. Cuenta de administración y custodia de credenciales

- [ ] **4.1 Creación segura del primer administrador (E6):** El primer usuario administrador fue dado de alta durante el paso 8 de `instalar.sh` mediante `crear-admin.js`, introduciendo la contraseña en el terminal sin eco en pantalla, sin exponerla en argumentos de procesos ni en el historial de comandos.
- [ ] **4.2 Entrega formal de la contraseña temporal:** La contraseña asignada fue catalogada como **temporal** y entregada formalmente al responsable del área usuaria por un canal separado, directo y confidencial (sobre sellado o comunicación directa; nunca por correo electrónico ordinario ni tickets de soporte).
- [ ] **4.3 Cambio obligatorio en el primer acceso:** El responsable del área usuaria ingresó al sistema con la credencial temporal, accedió al módulo «Usuarios», procedió al cambio inmediato de su contraseña por una clave personal definitiva y verificó el correcto inicio de sesión con su nueva clave.

---

## 5. Copias de seguridad programadas y contingencia

- [ ] **5.1 Tarea programada en systemd:** Se crearon y activaron las unidades de servicio `papeletas-copia.service` (invocando `scripts/copia.sh --pausar`) y temporizador `papeletas-copia.timer` en `/etc/systemd/system/`, verificando que el temporizador está activo con `systemctl is-active papeletas-copia.timer`.
- [ ] **5.2 Generación del trío de archivos de respaldo:** Se comprobó que el script `scripts/copia.sh` genera en la carpeta local de copias el volcado `.dump`, el archivo de recuentos `.counts` y la firma de control `.sha256`.
- [ ] **5.3 Procedimiento de transferencia externa:** Se estableció y probó el mecanismo periódico (script, rsync o montaje institucional) para transferir los tres archivos de cada copia hacia el almacenamiento externo fuera del servidor (`<destino externo A DEFINIR por EsSalud>`).

---

## 6. Conformidad técnica

Los firmantes certifican que las verificaciones precedentes fueron ejecutadas con resultado conforme y que el sistema se encuentra debidamente instalado y operativo bajo los estándares técnicos y de seguridad requeridos.

| Por el equipo técnico de instalación | Por el responsable que recibe la instalación |
|---|---|
| **Firma:** __________________________________ | **Firma:** __________________________________ |
| **Nombre:** | **Nombre:** |
| **DNI / Documento:** | **DNI / Documento:** |
| **Área / Cargo:** | **Área / Cargo:** |
| **Fecha:** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/ 2026 | **Fecha:** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/ 2026 |

**Observaciones técnicas adicionales:**
____________________________________________________________________________________________________
____________________________________________________________________________________________________
