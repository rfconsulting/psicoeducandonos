# Guía técnica de despliegue en Hostinger

Esta guía describe el procedimiento utilizado para desplegar Psicoeducándonos como aplicación Express en Hostinger y aplicar sus migraciones sin reemplazar la base de datos existente.

## 1. Configuración productiva

- Dominio: `https://psicoeducandonos.org`
- Plataforma: aplicación Node.js administrada por hPanel
- Preajuste: Express
- Node.js: 20.x
- Directorio raíz: `./`
- Archivo de entrada: `src/server.js`
- Gestor de paquetes: npm
- Directorio por SSH: `~/domains/psicoeducandonos.org/nodejs`
- Node disponible por SSH: `/opt/alt/alt-nodejs20/root/usr/bin/node`

Hostinger ejecuta directamente el archivo de entrada. No se debe asumir que ejecutará `npm start` o el hook `prestart`; por eso las migraciones se aplican explícitamente por SSH.

## 2. Controles locales previos

Desde PowerShell, en la raíz del repositorio:

```powershell
npm ci
npm test
npm run lint
npm audit --omit=dev
npm run check:secrets
npm run build:hostinger
```

No continúes si fallan las pruebas, la validación o el escaneo de secretos. El artefacto creado en `artifacts/` excluye `.env`, Git, pruebas, logs y `node_modules`.

## 3. Crear un ZIP compatible con Linux

Comprime **el contenido** del directorio generado, no su carpeta contenedora. En Windows usa `tar.exe` para conservar `/` en las rutas:

```powershell
$artifact = Get-ChildItem .\artifacts -Directory |
  Where-Object Name -Like 'hostinger-*' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$zip = "$($artifact.FullName)-linux.zip"
tar.exe -a -c -f $zip -C $artifact.FullName .
tar.exe -tf $zip | Select-Object -First 30
```

Las entradas deben verse como `src/server.js`, nunca como un único archivo llamado `src\server.js`. Si hPanel muestra barras invertidas, no despliegues ese ZIP.

## 4. Respaldo obligatorio

Antes de actualizar:

1. Exporta la base MySQL desde hPanel/phpMyAdmin en formato SQL.
2. Conserva el ZIP productivo anterior.
3. Registra la fecha, artefacto y migraciones pendientes.
4. Comprueba que el respaldo pueda descargarse y no esté vacío.

No publiques el respaldo ni `.env`, ni los incorpores a Git.

## 5. Carga y configuración en hPanel

1. Sube el archivo terminado en `-linux.zip`.
2. Selecciona Express y Node.js 20.x.
3. Usa `./` como directorio raíz.
4. Usa `src/server.js` como archivo de entrada.
5. Selecciona npm como gestor de paquetes.
6. Configura las variables de entorno y redistribuye.

Variables mínimas que deben revisarse sin imprimir sus valores:

```text
NODE_ENV=production
TRUST_PROXY=1
APP_PUBLIC_URL=https://psicoeducandonos.org
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
SESSION_SECRET
MFA_ENCRYPTION_KEY
RESEND_API_KEY
```

Conserva también las variables del proveedor de pagos y del remitente de correo. Los nombres de base y usuario de Hostinger suelen llevar el prefijo de la cuenta y deben copiarse exactamente.

Ver `server_started` y respuestas HTTP 200 prueba que Node inició, pero no demuestra que el esquema esté actualizado.

## 6. Aplicar migraciones por SSH

Desde PowerShell:

```powershell
ssh USUARIO_SSH@HOST_SSH
```

Dentro de Hostinger:

```bash
cd ~/domains/psicoeducandonos.org/nodejs
pwd
ls
```

Antes de continuar deben existir `package.json`, `scripts/`, `src/` y `.env`. Si `npm` responde `command not found`, ejecuta cada migración con la ruta absoluta de Node.

Para la actualización que incorpora P18–P25:

```bash
for n in 18 19 20 21 22 23 24 25; do
  echo "=== Ejecutando P${n} ==="
  /opt/alt/alt-nodejs20/root/usr/bin/node "scripts/migrate-p${n}.js" || break
done
```

En una actualización futura, sustituye el rango por las migraciones nuevas y respeta el orden ascendente. `|| break` evita ejecutar las posteriores si alguna falla.

La salida esperada termina con:

```text
Migración P25 aplicada correctamente.
```

Las migraciones son aditivas y reejecutables; no están diseñadas para borrar registros. Aun así, el respaldo es obligatorio. En una base productiva existente no hace falta ejecutar `db:init`; se reserva para aprovisionamiento o verificación controlada.

## 7. Verificación posterior

Comprueba la salud pública:

```powershell
curl.exe -i https://psicoeducandonos.org/api/health
```

Debe responder HTTP 200:

```json
{"status":"ok"}
```

Luego verifica:

1. Portada, CSS, imágenes e inicio de sesión.
2. Cuenta de estudiante: perfil, cursos, consultas, pagos y notificaciones.
3. `/api/operations/service-types` con sesión válida.
4. `/api/module-certification/my` con sesión válida.
5. Cuenta profesional: consultas pendientes.
6. Creación y cancelación de una orden de prueba no pagada.
7. Descarga de comprobantes conservando su extensión.

Usa `Ctrl + F5` o renueva la sesión para descartar caché. Un endpoint protegido debe devolver 401 sin sesión; un 500 requiere revisar el registro.

## 8. Diagnóstico rápido

### `/api/health` devuelve `ER_ACCESS_DENIED_ERROR`

Revisa las cinco variables `DB_*`, confirma que el usuario esté asignado a la base, guarda los cambios y reinicia o redistribuye.

### La interfaz carga, pero una API devuelve 500

Busca el primer error SQL. Si falta una tabla, identifica la migración que la crea y ejecuta esa migración y las posteriores. Las certificaciones dependen de P18 y el catálogo de servicios de P25.

### SSH indica `npm: command not found`

Usa el Node de Hostinger directamente:

```bash
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/migrate-p25.js
```

### Los archivos aparecen como `src\routes\...`

El ZIP tiene separadores de Windows. Vuelve a generarlo con `tar.exe -a` y verifica sus entradas antes de subirlo.

### Una migración falla

No ejecutes las posteriores. Guarda el error completo y no actives código que dependa del esquema incompleto. No elimines tablas ni importes `database/schema.sql` sobre producción como reparación.

## 9. Reversión

1. Conserva los registros del despliegue y de la migración fallida.
2. Redistribuye el último ZIP funcional.
3. No reviertas columnas o tablas sin un procedimiento específico.
4. Restaura MySQL solo ante corrupción o modificación destructiva confirmada; una migración aditiva normalmente no lo requiere.
5. Repite `/api/health` y las pruebas esenciales.

## 10. Evidencia operativa

Conserva el nombre del ZIP, resultados locales, ubicación segura del respaldo, salida de cada migración, estado final de `/api/health` y pruebas funcionales de estudiante y profesional.
