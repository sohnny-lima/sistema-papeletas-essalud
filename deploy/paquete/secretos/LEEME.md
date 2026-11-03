# secretos/

Carpeta privada (0700) con un archivo por secreto (0600). **El paquete se entrega con esta carpeta vacía.** Nunca copie estos archivos a correos, tickets ni repositorios.

| Archivo | Qué es | Quién lo crea |
|---|---|---|
| `jwt_secret` | Clave de firma de las sesiones (64 caracteres hexadecimales) | `instalar.sh`, si falta |
| `db_password` | Contraseña del usuario de la API (`DB_USER`, sin permisos de estructura) | Escenario A: `instalar.sh`. Escenario B: **el DBA de EsSalud** |
| `db_owner_password` | Contraseña del propietario (`DB_OWNER_USER`), para migraciones y copias | Escenario A: `instalar.sh`. Escenario B: **el DBA de EsSalud** |
| `tls.crt`, `tls.key` | Certificado (con su cadena) y clave privada HTTPS | Solo con `TLS=propio`: **los entrega EsSalud** |

Para crearlos a mano (por ejemplo, en el escenario B con la contraseña del DBA), sin dejarlos en el historial del terminal:
```bash
umask 077
read -r -s -p 'Contraseña: ' clave && printf '%s' "$clave" > secretos/db_password && unset clave; echo
```
`instalar.sh` ajusta los propietarios y permisos: uid 1000 para los secretos de la API y de la base, y uid 101 para el certificado TLS.

Cambiar `jwt_secret` cierra todas las sesiones abiertas. Para cambiar las contraseñas de la base, siga `documentacion/guia-instalacion.md` («Cambiar secretos»).
