-- =====================================================================
-- ESQUEMA RECONSTRUIDO: solo para instalaciones nuevas. No valida la base real.
-- ---------------------------------------------------------------------
-- El repositorio no incluye el esquema real de bd_papeleta. Este archivo
-- se reconstruyó leyendo las consultas SQL de backend-papeletas/controllers.
-- Tipos, longitudes, UNIQUE y reglas ON DELETE son suposiciones: hay que
-- contrastarlo con la base real (pg_dump --schema-only) antes de usarlo
-- como referencia definitiva.
-- =====================================================================

CREATE TABLE roles (
    id_rol      SERIAL PRIMARY KEY,
    nombre_rol  VARCHAR(50) NOT NULL
);

CREATE TABLE usuarios (
    id_usuario      SERIAL PRIMARY KEY,
    nombre_usuario  VARCHAR(100) NOT NULL UNIQUE,
    contrasena      VARCHAR(255) NOT NULL,          -- hash bcrypt
    id_rol          INTEGER NOT NULL REFERENCES roles(id_rol)
);

CREATE TABLE centros_asistenciales (
    id_centro      SERIAL PRIMARY KEY,
    nombre_centro  VARCHAR(200) NOT NULL
);

CREATE TABLE lugares (
    id_lugar         SERIAL PRIMARY KEY,
    nombre_ambiente  VARCHAR(200) NOT NULL,
    dependencia      VARCHAR(200) NOT NULL,
    id_centro        INTEGER NOT NULL REFERENCES centros_asistenciales(id_centro)
);

CREATE TABLE trabajadores (
    id_trabajador          SERIAL PRIMARY KEY,
    nombres                VARCHAR(150) NOT NULL,
    apellido_paterno       VARCHAR(100) NOT NULL,
    apellido_materno       VARCHAR(100) NOT NULL,
    numero_identificacion  VARCHAR(20)  NOT NULL      -- el backend valida 8-12 dígitos
);

CREATE TABLE equipos (
    id_equipo        SERIAL PRIMARY KEY,
    cod_patrimonial  VARCHAR(20)  NOT NULL,           -- el backend valida 4-20 dígitos
    descripcion      VARCHAR(255) NOT NULL,
    marca            VARCHAR(100) NOT NULL,
    serie            VARCHAR(100) NOT NULL,
    modelo           VARCHAR(100) NOT NULL
);

CREATE TABLE tipo_formulario (
    id_tipo_formulario  SERIAL PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL
);

CREATE TABLE estados_papeletas (
    id_estado      SERIAL PRIMARY KEY,
    nombre_estado  VARCHAR(100) NOT NULL
);

CREATE TABLE papeletas (
    id_papeleta            SERIAL PRIMARY KEY,
    numero_papeleta        VARCHAR(30) NOT NULL,
    fecha                  DATE NOT NULL,
    id_tipo_formulario     INTEGER REFERENCES tipo_formulario(id_tipo_formulario),
    id_trabajador_origen   INTEGER REFERENCES trabajadores(id_trabajador),
    id_trabajador_destino  INTEGER REFERENCES trabajadores(id_trabajador),
    id_lugar_origen        INTEGER REFERENCES lugares(id_lugar),
    id_lugar_destino       INTEGER REFERENCES lugares(id_lugar),
    -- Solo las usa registroMovController; ningún INSERT/UPDATE las rellena.
    -- Se crean aquí para que ese endpoint pueda ejecutarse. Confirmar si
    -- existen en la base real.
    motivo                 TEXT,
    observaciones          TEXT
);

CREATE TABLE papeleta_equipos (
    id           SERIAL PRIMARY KEY,
    id_papeleta  INTEGER NOT NULL REFERENCES papeletas(id_papeleta),
    id_equipo    INTEGER NOT NULL REFERENCES equipos(id_equipo)
);
