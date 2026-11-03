-- =====================================================================
-- DATOS DE PRUEBA (ficticios) para una base de desarrollo desechable.
-- NO ejecutar contra la base real.
--
-- Credenciales ficticias: consultar únicamente la guía de pruebas.
-- =====================================================================

INSERT INTO roles (id_rol, nombre_rol) VALUES
  (1, 'ADMINISTRADOR'),
  (2, 'USUARIO');
SELECT setval('roles_id_rol_seq', 2);

INSERT INTO usuarios (nombre_usuario, contrasena, id_rol) VALUES
  ('admin_prueba',   '$2b$10$vB2PyfHxQaVimlR0VKUSHOBB0c6jfMvqylf5a/jdSPQNiFTWB3XEe', 1),
  ('usuario_prueba', '$2b$10$V5mcTSkKfWFILEuOh3ZI9eYONCndtWH7bHI7Zn16YugTUzn8J8O4G', 2);

INSERT INTO centros_asistenciales (nombre_centro) VALUES
  ('HOSPITAL DE PRUEBA NORTE'),
  ('POLICLINICO DE PRUEBA SUR');

INSERT INTO lugares (nombre_ambiente, dependencia, id_centro) VALUES
  ('OFICINA 101', 'ADMINISTRACION', 1),
  ('ALMACEN CENTRAL', 'LOGISTICA', 1),
  ('CONSULTORIO 3', 'MEDICINA GENERAL', 2);

INSERT INTO trabajadores (nombres, apellido_paterno, apellido_materno, numero_identificacion) VALUES
  ('ANA', 'PRUEBA', 'UNO', '10000001'),
  ('LUIS', 'PRUEBA', 'DOS', '10000002'),
  ('CARLA', 'PRUEBA', 'TRES', '10000003');

INSERT INTO equipos (cod_patrimonial, descripcion, marca, serie, modelo) VALUES
  ('74080001', 'CPU DE PRUEBA', 'MARCA A', 'SERIE-A1', 'MODELO-A'),
  ('74080002', 'MONITOR DE PRUEBA', 'MARCA B', 'SERIE-B1', 'MODELO-B'),
  ('74080003', 'IMPRESORA DE PRUEBA', 'MARCA C', 'SERIE-C1', 'MODELO-C');

INSERT INTO tipo_formulario (nombre) VALUES
  ('TOMA DE INVENTARIO'),
  ('CUADRO DE ASIGNACION'),
  ('DESPLAZAMIENTO'),
  ('MANTENIMIENTO'),
  ('DEVOLUCION');

INSERT INTO estados_papeletas (nombre_estado) VALUES
  ('REGISTRADA'),
  ('ANULADA');

-- Una papeleta existente con numeración secuencial PA-NNNN
INSERT INTO papeletas (numero_papeleta, fecha, id_tipo_formulario,
                       id_trabajador_origen, id_trabajador_destino,
                       id_lugar_origen, id_lugar_destino)
VALUES ('PA-0001', CURRENT_DATE, 3, 1, 2, 1, 2);

INSERT INTO papeleta_equipos (id_papeleta, id_equipo) VALUES (1, 1), (1, 2);
