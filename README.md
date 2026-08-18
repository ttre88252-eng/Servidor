# Servidor de archivos — Termux

Servidor local real (Node.js + Express) para guardar y organizar **cualquier
tipo de archivo** (fotos, videos, PDFs, documentos, lo que sea), con la misma
estética de consola, sesión por usuario y aislamiento total entre cuentas.

## 1. Instalar lo necesario en Termux

```bash
pkg update && pkg upgrade -y
pkg install nodejs -y
```

## 2. Copiar el proyecto a tu teléfono

Copia toda la carpeta `servidor-archivos` a tu Termux, por ejemplo dentro de
`~/servidor-archivos` (puedes transferirla por USB, por un zip, por Termux
compartiendo archivos, etc). Debe quedar así:

```
servidor-archivos/
  server.js
  package.json
  public/
    index.html
```

## 3. Instalar dependencias

```bash
cd ~/servidor-archivos
npm install
```

## 4. Dar acceso al almacenamiento del teléfono (opcional pero recomendado)

Si quieres que Termux pueda acceder a tu carpeta de Fotos/Downloads del
celular (no solo guardar dentro de su propia carpeta):

```bash
termux-setup-storage
```

(Esto no es obligatorio: el servidor guarda los archivos en su propia
carpeta `storage/` dentro del proyecto, que igual vive en tu teléfono.)

## 5. Arrancar el servidor

```bash
npm start
```

Verás algo como:

```
✔ Servidor de archivos corriendo
→ En este mismo dispositivo: http://localhost:8080
→ Desde otro dispositivo en tu Wi-Fi: http://TU_IP_LOCAL:8080
```

Abre esa dirección en el navegador de tu celular (Chrome, Firefox, etc).

## 6. Acceder desde otros dispositivos (opcional)

Como es un servidor real, cualquier otro dispositivo conectado a **la misma
red Wi-Fi** puede entrar escribiendo `http://TU_IP_LOCAL:8080` en su
navegador. Para saber tu IP local:

```bash
ifconfig    # o: ip addr
```

Busca algo como `192.168.1.XX`.

## 7. Mantenerlo corriendo en segundo plano

Para que no se cierre si bloqueas el teléfono o cambias de app:

```bash
termux-wake-lock
npm start
```

Para dejarlo corriendo aunque cierres Termux, puedes usar `tmux`:

```bash
pkg install tmux -y
tmux new -s archivos
npm start
# Ctrl+B, luego D para salir sin cerrar el proceso
# tmux attach -t archivos   -> para volver a entrar
```

## Reproducción de media y descarga

- **Fotos**: se ven directo (jpg, png, gif, webp, svg…).
- **Videos**: se reproducen con controles nativos del navegador. Funciona bien
  con mp4, webm, mov (según el códec) — formatos raros como `.avi` o `.mkv`
  con códecs viejos puede que el navegador no los reproduzca directamente,
  pero siempre puedes descargarlos y abrirlos con otra app.
- **Audio**: igual, se reproduce con controles (mp3, wav, ogg, m4a…).
- **PDF**: se previsualiza directo dentro de la app, con botón para abrirlo
  en una pestaña nueva por si el visor incrustado da problemas.
- **Cualquier otro archivo** (Word, Excel, zip, rar, etc.): se ofrece
  directamente el botón de descarga — se pueden subir sin problema, solo
  que no tienen vista previa dentro de la app (se abren con otra app del
  celular después de descargarlos).
- En la vista previa de cualquier archivo hay un ícono de descarga (flecha
  hacia abajo) para bajarlo a tu dispositivo sin importar el tipo.

## Buscador mezclado (archivos + web)

La misma barra de búsqueda de arriba hace las dos cosas:

1. Mientras escribes, filtra tus archivos en tiempo real (como siempre).
2. Si después de medio segundo no hay ningún archivo que coincida, aparecen
   automáticamente **resultados web reales de Google** debajo, sin salir de
   la app ni abrir pestañas nuevas.

**Configuración (una sola vez, para todo el servidor):**

1. Ve a [programmablesearchengine.google.com](https://programmablesearchengine.google.com/controlpanel/create)
2. Actívalo con "Buscar en toda la web"
3. Créalo y copia el "ID del motor de búsqueda" (cx)
4. La primera vez que el buscador web se active en la app, te pedirá pegar
   ese ID — se guarda una sola vez y ya queda funcionando para todos los
   usuarios del servidor.

Es gratis. Los resultados los trae el propio navegador del dispositivo
directamente desde Google (tu servidor en Termux no necesita internet para
esto, solo el navegador que estás usando para entrar a la app).

## Editar tu perfil

Toca tu foto de perfil (el círculo junto a tu nombre, arriba a la izquierda)
para abrir el editor de ajustes:

- Cambiar nombre
- Cambiar foto de perfil (se ajusta automáticamente de tamaño)
- Cambiar el fondo (varios colores)
- Cambiar el color de acento (botones, resaltados)
- Cambiar el tipo de letra
- Cambiar tu **PIN personal** (el de 4 cifras que protege tu perfil al
  elegirlo en la pantalla de inicio)
- Borrar tu cuenta y todos tus archivos

## Seguridad: PIN por usuario

No hay una contraseña general del servidor. La protección es **por
usuario**: cada perfil se crea con un **PIN obligatorio de 4 cifras**, que
se pide cada vez que alguien elige ese perfil en la pantalla de inicio.

- El PIN se guarda con hash (nunca en texto plano) en `data/db.json`.
- Si un usuario olvida su PIN, puedes borrar su entrada en
  `data/db.json` (o simplemente borrar esa cuenta desde la app si tienes
  acceso a otro perfil) y crearla de nuevo.

## Cómo funciona el aislamiento por usuario

- Cada usuario que creas queda guardado en `data/db.json`, con su PIN
  de 4 cifras (guardado con hash, nunca en texto plano).
- Cada usuario tiene su propia carpeta física dentro de `storage/<id>/`.
- La sesión se maneja con cookies del lado del servidor: mientras no cierres
  sesión ("Cambiar de usuario"), sigues logueado. Si cambias de perfil, el
  servidor solo te devuelve los archivos de ese usuario — nunca los de otro.
- Todo vive en tu teléfono. Nada se sube a internet ni a servidores externos.

## Notas

- Puedes subir archivos de cualquier tipo y tamaño (hasta 5 GB por archivo,
  configurable en `server.js`, variable `limits.fileSize`).
- El puerto por defecto es 8080. Para cambiarlo: `PORT=3000 npm start`.
