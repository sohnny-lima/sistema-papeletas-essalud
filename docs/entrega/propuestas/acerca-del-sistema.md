# Propuesta · Pantalla «Acerca del sistema» y créditos

> **Implementado (03/11/2026)** en `/menu-principal/acerca`, con enlace en el pie: nombre, descripción, versión, tecnologías, desarrollador y año. Siguen como propuesta los datos de la instalación (institución, responsable técnico y soporte) y el endpoint de versión.

> Pendiente de aprobación del responsable y de la verificación de autoría y derechos. Ningún texto de este borrador afirma la titularidad patrimonial.

## 1. Dónde
- **Pie de página** del menú principal, en lugar del texto actual «© SliSoft | 2025 — Todos los Derechos Reservados.», que se retira hasta verificar a quién corresponden los derechos: «Sistema de Papeletas · v`<versión>` · Acerca del sistema».
- **«Acerca del sistema»:** ventana de diálogo accesible desde el pie y desde el menú de usuario. La ven **los dos roles**. Solo lectura.

## 2. Contenido
| Campo | Ejemplo | Origen |
|---|---|---|
| Nombre | Sistema de Papeletas de Movimiento de Bienes Patrimoniales (Formato Único Patrimonial) | Fijo |
| Institución usuaria | EsSalud · `<órgano o red asistencial>` | Configuración de la instalación (pendiente) |
| Versión | `1.0.0` | `APP_VERSION`, la misma que la etiqueta de las imágenes |
| Fecha de la versión | `AAAA-MM-DD` | Fecha de construcción |
| Revisión | `<commit corto>` | `VCS_REF` de la construcción |
| Desarrollado por | Sohnny Walter Lima Infanzón | Fijo, **tras verificar la autoría** |
| Responsable técnico de la instalación | `<nombre y área de EsSalud>` | Configuración de la instalación |
| Soporte | `<correo o canal institucional>` | Configuración de la instalación |
| Aviso | «Uso exclusivo de EsSalud según el acta de entrega y sus condiciones de uso.» | Fijo |

## 3. Cómo se implementaría (cuando se apruebe)
- **Backend:** `GET /api/salud/version` público, que devuelve solo `{ version, fecha, revision }`, sin datos internos ni de la base. Las variables `APP_VERSION`, `APP_BUILD_DATE` y `VCS_REF` se graban en la imagen al construirla.
- **Configuración de la instalación** (institución, responsable técnico y soporte): variables opcionales del `.env` (`APP_INSTITUCION`, `APP_RESPONSABLE`, `APP_SOPORTE`) que expone el mismo endpoint, en texto sin formato.
- **Frontend:** un componente pequeño con el patrón `es-*` y su prueba unitaria. Sin dependencias nuevas.
- **Documentación:** la misma tabla en `LEEME.txt`, `VERSION` y en la portada de la guía de instalación.
