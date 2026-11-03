# ACTA DE ENTREGA Y RECEPCIÓN DEL SISTEMA (BORRADOR)

> Plantilla para revisar con el área legal y el área usuaria de EsSalud. Completar los campos `<…>`. No firmar hasta verificar la autoría, los derechos y la autorización institucional del despliegue.

**Sistema:** Sistema de Papeletas de Movimiento de Bienes Patrimoniales (Formato Único Patrimonial)
**Versión entregada:** `<1.0.0>` · **Revisión:** `<commit>` · **Fecha de la versión:** `<AAAA-MM-DD>`
**Lugar y fecha del acta:** `<ciudad>`, `<AAAA-MM-DD>`

## 1. Partes
| Rol | Nombre | Cargo / área | Documento |
|---|---|---|---|
| Entrega (desarrollador) | Sohnny Walter Lima Infanzón | `<…>` | `<DNI>` |
| Recibe (área usuaria) | `<…>` | `<…>` | `<…>` |
| Responsable técnico de la instalación | `<…>` | `<…>` | `<…>` |
| Encargado del despliegue | `<…>` | `<…>` | `<…>` |

**Relación por la que se desarrolló el sistema:** `<contrato / orden de servicio / encargo / iniciativa propia>` N.º `<…>`. *A verificar por el área legal; de ella depende la titularidad de los derechos (punto 5).*

## 2. Objeto
Se entrega el paquete de instalación indicado, para desplegarlo en el servidor `<identificación>` autorizado por `<área>`, según su documentación.

## 3. Materiales entregados
| Material | Archivo | SHA-256 |
|---|---|---|
| Paquete de instalación | `papeletas-essalud-<VERSION>.tar.gz` | `<suma>` |
| Imágenes Docker (dentro del paquete) | `imagenes/papeletas-essalud-<VERSION>-imagenes.tar.gz` | `<suma>` |
| Documentación (dentro del paquete) | `documentacion/` | En `SHA256SUMS` |

**No se entregan:** el código fuente ni su historial, los repositorios, las credenciales de desarrollo ni datos reales. Las imágenes contienen el código ejecutable necesario para el funcionamiento. El JavaScript del navegador y del servidor puede inspeccionarse técnicamente; su uso queda sujeto a las condiciones del punto 5.

## 4. Verificaciones realizadas en la instalación
| Comprobación | Resultado | Responsable |
|---|---|---|
| Sumas SHA-256 del paquete (`verificar-paquete.sh`) | ☐ Conforme | `<…>` |
| Servicios `healthy` y salud de la API y de la base | ☐ Conforme | `<…>` |
| Acceso por HTTPS; API y base sin puertos publicados | ☐ Conforme | `<…>` |
| Primer administrador creado; contraseña temporal entregada por un canal separado y **cambiada por el responsable** | ☐ Conforme | `<…>` |
| Copia de seguridad programada, con destino externo, y restauración de prueba | ☐ Conforme | `<…>` |
| Lista de verificación de la instalación (sección E) | ☐ Conforme | `<…>` |
| Aceptación funcional del área usuaria (lista de aceptación) | ☐ Conforme ☐ Con observaciones | `<…>` |

**Observaciones:** `<…>`

## 5. Condiciones
Se rigen por el documento «Condiciones de uso, modificación, distribución, soporte y mantenimiento» (anexo), en la versión acordada por las partes.

## 6. Custodia y accesos
- El encargado del despliegue recibe solo el paquete y los permisos del servidor necesarios para instalar.
- Al terminar, devuelve o elimina las copias del paquete que no queden en el servidor y entrega la contraseña temporal del administrador.
- Las credenciales de la base y los secretos quedan bajo custodia de `<área>`.

## 7. Firmas
| Entrega | Recibe | Responsable técnico |
|---|---|---|
| | | |
| Sohnny Walter Lima Infanzón | `<…>` | `<…>` |
