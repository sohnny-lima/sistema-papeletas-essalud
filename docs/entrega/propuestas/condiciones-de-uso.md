# Condiciones de uso, modificación, distribución, soporte y mantenimiento (BORRADOR)

> **Borrador técnico, no es un documento legal.**
> - Antes de usarlo, el área legal de EsSalud y el desarrollador deben verificar la autoría, la relación por la que se desarrolló el sistema, a quién corresponden los derechos patrimoniales según el contrato y la normativa peruana de derecho de autor, y las autorizaciones institucionales.
> - Las cláusulas entre corchetes son **alternativas** que se eligen según ese resultado.
> - No se presupone la titularidad exclusiva de nadie.

## 1. Identificación
- **Sistema:** Sistema de Papeletas de Movimiento de Bienes Patrimoniales, versión `<…>`.
- **Desarrollado por:** Sohnny Walter Lima Infanzón (autoría sujeta a verificación).
- **Institución usuaria:** EsSalud, `<órgano>`.

## 2. Titularidad (elegir tras la verificación legal)
- [A] Los derechos patrimoniales corresponden a EsSalud en virtud de `<contrato / vínculo>`. El desarrollador conserva el reconocimiento de su autoría (créditos en el sistema y en la documentación).
- [B] Los derechos patrimoniales corresponden al desarrollador, que concede a EsSalud una licencia de uso `<no exclusiva / exclusiva>`, `<indefinida / por N años>`, `<gratuita / onerosa>`, para los fines del punto 3.
- [C] Otra fórmula acordada por las partes: `<…>`.

## 3. Uso permitido
- Uso interno de EsSalud para registrar las papeletas de movimiento de bienes patrimoniales, en los servidores y por los usuarios que autorice `<área>`.
- Instalación, copia de seguridad y restauración en la infraestructura de EsSalud, según la documentación entregada.

## 4. Modificación
- [Según la titularidad] Las modificaciones del código o de las imágenes requieren `<la autorización de … / se permiten a EsSalud>`, y se documentan con versión y responsable.
- Cambiar la configuración prevista en la documentación (variables, puertos, HTTPS y copias) no se considera una modificación.
- Las modificaciones de terceros no autorizadas excluyen el soporte del punto 6 sobre lo modificado.

## 5. Distribución
- El paquete y las imágenes son para uso de EsSalud. No se publican en registros públicos ni se entregan a terceros ajenos a la instalación y el mantenimiento autorizados, salvo acuerdo escrito.
- El encargado del despliegue recibe solo lo necesario para instalar (acta, punto 6).

## 6. Soporte y mantenimiento
- **Alcance:** `<corrección de defectos / consultas / actualizaciones de seguridad>`, durante `<plazo>`, por `<canal>`, con tiempos de respuesta `<…>`.
- **Fuera del alcance:** cambios funcionales nuevos, infraestructura de EsSalud (servidor, red, proxy, copias externas) y datos introducidos por los usuarios.
- **Actualizaciones:** se entregan como paquete nuevo, con sus sumas SHA-256, y se instalan con el procedimiento de actualización y reversión.
- **Dependencias de terceros:** Angular, Express, PostgreSQL, Nginx y sus licencias, que se incluyen en el paquete. Su actualización por seguridad forma parte del mantenimiento `<sí / no>`.

## 7. Responsabilidades de operación (EsSalud)
- Custodiar los secretos, las credenciales y las copias de seguridad.
- Mantener HTTPS, el cortafuegos y el acceso al grupo `docker` restringido.
- Programar y verificar las copias en un destino externo.
- Gestionar las cuentas de usuario y sus roles.

## 8. Garantía y limitación
`<A redactar por el área legal.>` El sistema se entrega probado según los resultados documentados en `<lista de aceptación y resultados de pruebas>`, contra un esquema de base de datos reconstruido. `<Validación con el esquema real: pendiente o realizada.>`

## 9. Vigencia y firma
`<…>`
