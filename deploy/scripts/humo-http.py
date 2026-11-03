"""c006: aserciones HTTP sin dependencias; claves y tokens solo en memoria."""
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

modo, base, archivo = sys.argv[1:]
cabeceras = {
    "Content-Security-Policy": "connect-src 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=()",
    "Cache-Control": "no-store",
}


def pedir(ruta, datos=None, token=None, metodo=None, esperado=200, comprobar=True):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(base + ruta, data=json.dumps(datos).encode() if datos else None,
                  headers=headers, method=metodo)
    try:
        res = urlopen(req, timeout=15)
    except HTTPError as error:
        res = error
    with res:
        assert res.status == esperado, f"{ruta}: HTTP {res.status}, esperado {esperado}"
        if comprobar:
            for nombre, valor in cabeceras.items():
                valores = res.headers.get_all(nombre, [])
                assert len(valores) == 1, f"{ruta}: {nombre} aparece {len(valores)} veces"
                assert valor in valores[0], f"{ruta}: valor incorrecto de {nombre}"
        cuerpo = res.read().decode()
        return json.loads(cuerpo) if "application/json" in res.headers.get("Content-Type", "") else cuerpo


def entrar(usuario, clave, rol):
    res = pedir("/api/auth/login", {"nombreUsuario": usuario, "contrasena": clave})
    assert res["success"] and res["user"]["rol"] == rol
    return res["token"]


pedir("/salud", comprobar=False)
pedir("/api/salud")
pedir("/api/salud/lista")
assert "<app-root>" in pedir("/menu-principal/papeletas", comprobar=False)
assert "<app-root>" in pedir("/index.html")
if modo == "admin":
    entrar("administrador_humo", Path(archivo).read_text().strip(), "admin")
    print("c006: primer administrador creado por archivo y login correcto.")
else:
    admin = entrar("admin_prueba", "Admin.Prueba1", "admin")
    usuario = entrar("usuario_prueba", "Usuario.Prueba1", "user")
    if modo == "crear":
        res = pedir("/api/papeletas", {
            "id_tipo_formulario": 3, "id_trabajador_origen": 1, "id_trabajador_destino": 2,
            "id_lugar_origen": 1, "id_lugar_destino": 2, "fecha": "2026-10-28", "equipmentIds": [1],
        }, admin)
        assert res["success"]
        Path(archivo).write_text(json.dumps(res["data"]))
    fila = json.loads(Path(archivo).read_text())
    ruta = "/api/papeletas/" + str(fila["id_papeleta"])
    res = pedir(ruta, token=usuario)
    assert res["data"]["numero_papeleta"] == fila["numero_papeleta"]
    pedir(ruta, token=usuario, metodo="DELETE", esperado=403)
    pedir("/api/papeletas", token=admin)
    print(f"c006: {modo}: dos roles, lectura, DELETE 403 y seis cabeceras únicas correctos.")
