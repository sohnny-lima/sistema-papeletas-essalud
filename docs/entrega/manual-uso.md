# Manual breve de uso · Sistema de Papeletas (Formato Único Patrimonial)

Para el personal de EsSalud que registra movimientos de bienes patrimoniales. La dirección del sistema la indica el área de informática (por ejemplo, `http://servidor-papeletas/`).

## 1. Entrar y salir
1. Abra la dirección del sistema y escriba su **usuario** y **contraseña**. Pulse **Ingresar**.
2. Si aparece un aviso, siga lo que dice:

| Aviso | Qué significa | Qué hacer |
|---|---|---|
| «Usuario o contraseña incorrectos.» | Algún dato está mal escrito | Revise mayúsculas y el teclado; si persiste, pida al administrador que restablezca su clave |
| «Demasiados intentos…» | Se superó el límite de intentos | Espere unos minutos antes de volver a intentarlo |
| «No se pudo conectar con el servidor…» | El sistema no está disponible o no hay red | Compruebe la red; si sigue, avise a informática |
| «Su sesión ha caducado. Vuelva a iniciar sesión.» | Pasó el tiempo máximo de la sesión, o un administrador cambió su rol o su contraseña | Vuelva a entrar; lo que no se guardó se pierde |
| «La cuenta está desactivada. Contacte con un administrador.» | Un administrador desactivó su cuenta | Pida al administrador que la reactive |
| «Contraseña actualizada. Inicie sesión con la nueva.» | Cambió su propia contraseña | Entre con la contraseña nueva |

3. **Con qué cuenta está trabajando:** arriba a la derecha se ve siempre su usuario y su perfil, por ejemplo «admin_prueba · Administrador». En el móvil aparece en lugar del título.
4. Para salir, pulse **Cerrar Sesión** en el menú lateral. En equipos compartidos, cierre siempre la sesión.

## 2. Qué puede hacer cada perfil
| Pantalla | Usuario | Administrador |
|---|---|---|
| Dashboard (resumen) | Ver | Ver |
| Equipos | Ver, buscar, **agregar y editar** | Además, **eliminar** |
| Trabajadores | Ver, buscar, **agregar y editar** | Además, **eliminar** |
| Papeletas | Ver, buscar, **crear, editar e imprimir el PDF** | Además, **eliminar** |
| Lugares | **Solo consulta** (lo indica la propia pantalla) | Crear, editar y eliminar; crear centros desde el formulario |
| Centros asistenciales | No aparece en el menú | Listar, buscar, crear y renombrar |
| Usuarios (cuentas de acceso) | No aparece en el menú | Listar, buscar, crear, editar, desactivar y reactivar |

Lo que su perfil no permite no se muestra. Si alguna vez aparece «No tiene permisos…», su perfil no permite esa acción: consulte con el administrador.

## 3. Registrar una papeleta
1. **Papeletas** → **Nueva Papeleta**.
2. El **N° de papeleta** se muestra solo como referencia. El número definitivo lo asigna el sistema al guardar y aparece en el aviso de confirmación; puede diferir si otra persona guardó antes.
3. Complete:
   - **Fecha**;
   - **Tipo de formulario** (por ejemplo, desplazamiento, mantenimiento o devolución);
   - **Trabajador origen** y **trabajador destino** (escriba parte del nombre, apellido o DNI y elija de la lista);
   - **Lugar origen** y **lugar destino**;
   - **Equipos asociados** (busque por código patrimonial o descripción y añádalos).
4. Pulse **Guardar**. Los campos obligatorios que falten se indican en el formulario. El origen y el destino no pueden ser iguales, y un mismo equipo no puede repetirse.
5. Para corregir una papeleta, pulse el **lápiz** de su fila.

## 4. Imprimir el Formato Único Patrimonial (PDF)
En la fila de la papeleta, pulse el botón de **PDF**. Se descarga `Papeleta_PA-NNNN.pdf` con:
- origen y destino (trabajador, código, dependencia, ambiente y centro);
- la tabla de bienes;
- los recuadros de firma.

Imprímalo y recoja las firmas.

## 5. Equipos, trabajadores, lugares y centros
- **Buscar:** elija el campo (o «Todo»), escriba y pulse Enter o la lupa. La **X** limpia la búsqueda.
- **Equipos:** el código patrimonial tiene entre 4 y 20 dígitos y no puede repetirse.
- **Trabajadores:** el DNI o número de identificación tiene entre 8 y 12 dígitos y no puede repetirse.
- **Lugares** (administrador):
  - un lugar es un **ambiente** dentro de una **dependencia** de un **centro asistencial**;
  - si el centro no existe, pulse **Nuevo centro** junto al selector: se crea y queda elegido sin perder lo ya escrito.
- **Centros asistenciales** (administrador):
  - no se admiten nombres vacíos ni repetidos; no se distinguen mayúsculas ni espacios de más;
  - el sistema guarda el nombre en mayúsculas.
- **Eliminar** (administrador): se pide confirmación. Si el registro se usa en papeletas o lugares, el sistema no lo borra y lo explica.

## 6. Usuarios: cuentas de acceso (administrador)
- **Usuarios no es lo mismo que Trabajadores:** Trabajadores registra al personal que entrega o recibe bienes; Usuarios, a quienes **entran** al sistema. Registrar a un trabajador no le crea una cuenta.
- **Nueva cuenta:**
  - el nombre de usuario lleva entre 3 y 50 caracteres: letras sin tildes, números, punto, guion o guion bajo, sin espacios;
  - no puede repetirse, aunque cambien las mayúsculas;
  - la contraseña tiene al menos 10 caracteres, con letras y números, y debe ser distinta del usuario. Escríbala dos veces;
  - elija el perfil: **Administrador** o **Usuario**.
- **Editar:** puede cambiar el nombre y el perfil, y poner una contraseña nueva (si deja la contraseña en blanco, no cambia). Al cambiar el perfil o la contraseña de una persona, su sesión abierta se cierra y debe volver a entrar.
- **Desactivar:** la cuenta deja de poder entrar al momento, y se conserva su historial. Las cuentas **no se borran**. Para devolverle el acceso, use **Reactivar**.
- **Su propia cuenta** aparece marcada como «Sesión actual»:
  - no puede cambiar su propio perfil ni desactivarse;
  - si cambia su propia contraseña, el sistema cierra su sesión para que entre con la nueva.
- El sistema impide quedarse **sin ningún administrador activo**: no deja desactivar ni quitar el perfil al último.
- **Primer administrador** de una instalación nueva: lo crea informática con el procedimiento de la guía de instalación, no desde esta pantalla.

## 7. Consejos
- Use el sistema en un navegador actualizado (Chrome, Edge o Firefox). En el móvil, las tablas se muestran como fichas.
- No comparta su contraseña. Para altas de usuarios o cambios de clave, acuda al administrador del sistema.
- Ante un error que no se explique en este manual, anote la hora, la pantalla y el mensaje, y avise a informática.
