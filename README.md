# botstickers con sonido

Bot de WhatsApp para hacer stickers. Funciona en Termux y en Windows.

<details>
<summary><b>¿Es seguro este bot? (toca para ver)</b></summary>

Sí, no es un virus. Todo lo que trae son archivos de texto con código,
así que puedes abrirlos y leer lo que hacen.

#### Qué hace

- Se conecta a tu WhatsApp como dispositivo vinculado, igual que
  WhatsApp Web.
- Responde solo cuando alguien manda un comando (#s, #s+a, #toimg,
  #tomp4, #recortar, #s-name y los del dueño). Nunca manda mensajes por
  su cuenta ni publica estados.
- Los comandos del dueño (#grupos, #privado, #listagrupos, #permitir y
  #quitar) solo funcionan con tu número personal. Si otra persona los
  manda, el bot no le contesta.
- Convierte en stickers las fotos y videos que le mandan, y borra solo
  los archivos temporales.

#### Qué no hace

- No manda tus datos, fotos ni mensajes a otros servidores.
- No lee tus contactos ni los archivos del teléfono.
- No pide contraseñas ni datos de pago.

#### A qué se conecta

- Al instalarse, descarga lo que necesita de Termux (pkg) y de npm, que
  son los sitios oficiales.
- Cuando arranca, consulta en GitHub cuál es la versión actual de
  WhatsApp Web. Después solo habla con WhatsApp.
- Al iniciarlo, revisa en GitHub si hay una versión nueva del bot. Solo
  la descarga si tú aceptas.
- Si alguien usa `#s <link>`, el bot baja ese video del sitio del link
  (TikTok, Facebook o X) con yt-dlp.

#### Dónde quedan tus datos

Tu sesión de WhatsApp se guarda en la carpeta `baileys_auth_info`, dentro
de la carpeta del bot, y no se sube a ningún lado.

Para borrarla en Android, detén el bot y escribe esto en Termux:

```bash
rm -rf ~/botstickers/baileys_auth_info
```

La carpeta está dentro del almacenamiento privado de Termux, así que no
aparece en el administrador de archivos y no se puede borrar desde ahí.
Si desinstalas Termux, también se borra.

En Windows, cierra el bot y borra la carpeta `baileys_auth_info` que está
dentro de la carpeta del bot.

También puedes cerrar la sesión desde WhatsApp, en Dispositivos
vinculados.

Tu número de dueño se guarda en `config/owners.json`, y lo que eliges con
#grupos, #privado y #permitir se guarda en `config/settings.json`. Los
dos archivos se quedan en tu teléfono o en tu PC.

#### Cosas a tener en cuenta

- WhatsApp no permite oficialmente bots en cuentas normales, así que
  hay un riesgo pequeño de que bloqueen el número. Si te preocupa, usa
  un número que no sea el principal.
- Lo mejor es que el bot lo uses solo tú o un grupo pequeño. Mientras
  menos gente mande comandos, menos riesgo hay. Con `#privado off` el
  bot deja de responder en chats privados, y con `#permitir` puedes
  dejarlo solo en los grupos que elijas.
- Escribe bien tu número de dueño. La persona que tenga ese número
  puede usar el bot sin límites y manejar sus comandos.
- Publicar el número del bot es un riesgo. Si mucha gente le escribe,
  el bot manda muchos mensajes seguidos, y WhatsApp puede tomarlo como
  spam y bloquear el número. Si además algunas personas lo reportan,
  el bloqueo es más probable. Por eso, si lo vas a publicar, usa un
  número aparte que no te importe perder.
- Descarga el bot solo de quien lo creó. Si alguien te pasa una copia
  modificada, ya no se puede asegurar que sea igual.
- Nunca compartas la carpeta `baileys_auth_info`: con ella alguien podría
  entrar a tu WhatsApp.

</details>

## Video tutorial que TikTok eliminó

https://github.com/user-attachments/assets/dbd03b35-76f3-4806-a1fa-f1958b2dbc60

## Comandos

| Comando | Qué hace |
| --- | --- |
| `#s` | Convierte una foto o video en sticker |
| `#s "hola"` | Sticker con el texto "hola" abajo |
| `#s <link>` | Sticker desde un link (TikTok, Facebook o X), recortado cuadrado y centrado |
| `#s <link> completo` | Igual, pero con el video completo centrado (sin recortar) |
| `#s+a` | Sticker de video con sonido |
| `#s+a <link>` | Sticker con sonido desde un link |
| `#toimg` | Sticker a imagen |
| `#tomp4` | Sticker animado a video |
| `#recortar` | Recorta las dimensiones de un video a 1:1 |
| `#s-name "paquete" "autor"` | Cambia el nombre y el autor de un sticker |

Manda el comando junto con la foto o el video, o respondiendo a un mensaje.

### Comandos para el dueño

El dueño es tu número personal. El bot te lo pide la primera vez que lo
inicias, después de elegir cómo vincularlo, y lo guarda en
`config/owners.json`. Solo ese número puede usar estos comandos. Si otra
persona los manda, el bot no le contesta.

Al dueño el bot le funciona siempre, aunque esté apagado en grupos o en
chats privados.

| Comando | Qué hace |
| --- | --- |
| `#grupos on` / `#grupos off` | Deja que el bot funcione o no en grupos |
| `#privado on` / `#privado off` | Deja que el bot funcione o no en chats privados |
| `#listagrupos` | Muestra los grupos donde está el bot |
| `#permitir <número>` | Hace que el bot solo funcione en los grupos que permitas |
| `#quitar <número>` | Quita un grupo de los permitidos |

El número de `#permitir` y `#quitar` es el que aparece en `#listagrupos`.
También puedes mandar `#permitir` o `#quitar` dentro del grupo, sin número.
Si no hay grupos permitidos, el bot funciona en todos.

### Stickers desde links

Manda `#s` o `#s+a` seguido del link de un video, por ejemplo
`#s https://vm.tiktok.com/...`. El bot baja el video, le quita los bordes
negros y lo recorta en cuadrado. Si agregas `completo`, no lo recorta y el
video sale entero. Con `#s+a` el sticker lleva el sonido del video.

Solo acepta links de TikTok, Facebook y X (Twitter). Con
cualquier otro sitio responde que no está permitido.

El video puede pesar hasta 50MB y durar hasta 2 minutos. El sticker usa los
primeros 12 segundos.

**Links:** `#s <link>` necesita [yt-dlp](https://github.com/yt-dlp/yt-dlp). Es opcional:
sin él, todo lo demás funciona igual.

- Termux: `pkg install -y yt-dlp`
- Windows: `winget install yt-dlp.yt-dlp`
- Linux: instala el paquete `yt-dlp` o pon el ejecutable en `bin/yt-dlp`
  (también se puede indicar la ruta con la variable `YTDLP_PATH`).

## Rendimiento

<details>
<summary><b>Velocidad del bot (toca para ver)</b></summary>

El bot hace los stickers en el mismo teléfono o PC donde lo instalaste, así
que la velocidad depende de ese dispositivo. En un teléfono de gama baja los
stickers tardan más que en uno de gama alta o en una PC.

Las fotos salen rápido casi en cualquier dispositivo. Los videos tardan más,
porque el bot los convierte varias veces, bajando la calidad cada vez, hasta
que el sticker pesa lo que WhatsApp permite. `#s+a` tarda un poco más porque
también saca el audio. Con un link, primero tiene que bajar el video, así que
ahí también cuenta tu internet.

El bot convierte hasta 3 videos a la vez. Si llegan más, esperan su turno.
Si hay más de 30 esperando, reacciona con 🕐 y no hace ese sticker. Los
videos del dueño no hacen fila: pasan primero apenas se libera un espacio y
nunca reciben 🕐.

En Termux puedes cambiar cuántos convierte a la vez al iniciar el bot. En un
teléfono de gama alta puedes subirlo a 5:

```bash
cd ~/botstickers && FFMPEG_MAX_CONCURRENT=5 bash start.sh
```

Si tu teléfono es de gama baja y Termux se cierra solo mientras hace
stickers, bájalo a 1 con `FFMPEG_MAX_CONCURRENT=1`.

Para que vaya más rápido:

- Desactiva el ahorro de batería para Termux. Si está activado, Android
  puede frenar el bot o cerrarlo.

</details>

# EL NUMERO TIENE QUE ESTAR TODO JUNTO CON CODIGO DE AREA DE PAÍS Y SIN ESPACIOS POR EJEMPLO:
+502 1234 5678 : (Esto no debe tener espacios)
+50212345678 : (Así tiene que quedar)
## Termux

### Instalar

Instala Termux desde [F-Droid](https://f-droid.org/packages/com.termux/),
[GitHub](https://github.com/termux/termux-app/releases) o la
[Play Store](https://play.google.com/store/apps/details?id=com.termux)
y escribe:

```bash
pkg update -y && pkg install -y git && git clone https://github.com/opgbl/botstickers ~/botstickers && cd ~/botstickers && bash start.sh
```

La primera vez instala todo lo necesario y te pregunta cómo vincular el
bot: `1` con código o `2` con QR.

### Detener el bot

Presiona `CTRL` + `C` (la tecla `CTRL` está en la fila de teclas de
arriba del teclado). Si sale "Reiniciando en 5 s", presiona `CTRL` + `C`
otra vez antes de que vuelva a arrancar.

Para cerrar Termux por completo, escribe `exit` o toca "Exit" en la
notificación de Termux.

### Volver a iniciar el bot

```bash
cd ~/botstickers && bash start.sh
```

No hace falta vincularlo de nuevo: la sesión queda guardada en la carpeta
`baileys_auth_info`.

### Actualizar el bot

Cuando haya una versión nueva, detén el bot y escribe:

```bash
cd ~/botstickers && git pull && npm install --omit=dev --no-audit --no-fund && bash start.sh
```

No pierdes la sesión ni tus ajustes: la carpeta `baileys_auth_info`,
`config/owners.json` y `config/settings.json` no se tocan al actualizar.

### Problemas de conexión o volver a vincular

Si el bot no conecta, se desconecta todo el tiempo o cerraste la sesión
en WhatsApp, borra la sesión y vuelve a vincularlo:

```bash
rm -rf ~/botstickers/baileys_auth_info && cd ~/botstickers && bash start.sh
```

### Eliminar el bot por completo

1. Detén el bot.
2. Cierra la sesión en WhatsApp (los pasos están más abajo, en
   "Cerrar la sesión del dispositivo vinculado").
3. Borra la carpeta del bot:

   ```bash
   rm -rf ~/botstickers
   ```

4. Opcional: si no usas Node.js ni ffmpeg para otra cosa, también puedes
   quitarlos:

   ```bash
   pkg uninstall -y nodejs-lts ffmpeg
   ```


## Windows

### Instalar

1. Instala [Node.js](https://nodejs.org) (versión 20 o más nueva).
2. Instala ffmpeg. En PowerShell o CMD:

   ```
   winget install Gyan.FFmpeg
   ```

3. Descarga el bot en Code > Download ZIP y descomprímelo.
4. Abre `iniciar.bat`. La primera vez instala las dependencias y te
   pregunta cómo vincular el bot, igual que en Termux.

### Detener el bot

Cierra la ventana de `iniciar.bat`. También puedes presionar `Ctrl` + `C`
y, cuando pregunte "¿Desea terminar el trabajo por lotes?", escribir `S`
y Enter.

### Volver a iniciar el bot

Abre `iniciar.bat` otra vez. No hace falta vincularlo de nuevo.

### Actualizar el bot

Detén el bot, descarga otra vez el ZIP y descomprímelo. Copia a la
carpeta nueva la carpeta `baileys_auth_info` y los archivos
`config/owners.json` y `config/settings.json` de la vieja, y abre
`iniciar.bat`. Si `config/settings.json` no existe, es porque nunca usaste
los comandos del dueño.

### Problemas de conexión o volver a vincular

Si el bot no conecta, se desconecta todo el tiempo o cerraste la sesión
en WhatsApp, detén el bot, borra la carpeta `baileys_auth_info` y abre
`iniciar.bat` otra vez.

### Eliminar el bot por completo

1. Detén el bot.
2. Cierra la sesión en WhatsApp (los pasos están abajo).
3. Borra la carpeta donde descomprimiste el bot.
4. Opcional: si no usas Node.js ni ffmpeg para otra cosa, desinstala
   Node.js desde Configuración > Aplicaciones, y ffmpeg con:

   ```
   winget uninstall Gyan.FFmpeg
   ```

## Cerrar la sesión del dispositivo vinculado

Esto desconecta el bot de tu WhatsApp. Sirve si ya no lo vas a usar, si
crees que alguien más tiene tu sesión o si quieres vincular otro número.

1. Abre WhatsApp en tu teléfono.
2. En Android toca los tres puntos (⋮) arriba a la derecha. En iPhone
   ve a Configuración.
3. Entra en Dispositivos vinculados.
4. Toca el dispositivo del bot y luego Cerrar sesión.

Después de esto el bot ya no puede entrar. Si lo inicias, mostrará
"Sesión cerrada por WhatsApp". Para volver a usarlo, sigue los pasos de
"Problemas de conexión o volver a vincular" de Termux o de Windows.

Si cambias de teléfono o vuelves a vincular el bot, quita también el
dispositivo viejo desde Dispositivos vinculados.