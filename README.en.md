# botstickers with sound

[Español](README.md) | **English**

WhatsApp bot for making stickers. It runs on Termux and Windows.

The bot replies in Spanish, and the commands are the same in every language.

<details>
<summary><b>Is this bot safe? (tap to see)</b></summary>

Yes, it's not a virus. Everything it includes is plain text files with code,
so you can open them and read what they do.

#### What it does

- Connects to your WhatsApp as a linked device, just like WhatsApp Web.
- Only replies when someone sends a command (#s, #s+a, #toimg, #tomp4,
  #recortar, #s-name and the owner commands). It never sends messages on
  its own or posts statuses.
- The owner commands (#grupos, #privado, #limite, #listagrupos, #permitir
  and #quitar) only work from your personal number. If someone else sends
  them, the bot doesn't answer.
- Turns the photos and videos people send into stickers, and deletes the
  temporary files by itself.

#### What it doesn't do

- It doesn't send your data, photos or messages to other servers.
- It doesn't read your contacts or the files on your phone.
- It doesn't ask for passwords or payment details.

#### What it connects to

- During installation, it downloads what it needs from Termux (pkg) and
  npm, which are the official sources.
- When it starts, it checks GitHub for the current WhatsApp Web version.
  After that it only talks to WhatsApp.
- When you start it, it checks GitHub for a new version of the bot. It
  only downloads it if you accept.
- If someone uses `#s <link>`, the bot downloads that video from the
  link's site (TikTok, Facebook or X) with yt-dlp.

#### Where your data stays

Your WhatsApp session is saved in the `baileys_auth_info` folder, inside
the bot's folder, and it isn't uploaded anywhere.

To delete it on Android, stop the bot and type this in Termux:

```bash
rm -rf ~/botstickers/baileys_auth_info
```

The folder is inside Termux's private storage, so it doesn't show up in
the file manager and can't be deleted from there. If you uninstall
Termux, it's deleted too.

On Windows, close the bot and delete the `baileys_auth_info` folder inside
the bot's folder.

You can also log out the session from WhatsApp, in Linked devices.

Your owner number is saved in `config/owners.json`, and what you choose
with #grupos, #privado, #limite and #permitir is saved in
`config/settings.json`. Both files stay on your phone or PC.

#### Things to keep in mind

- WhatsApp doesn't officially allow bots on regular accounts, so there's a
  small risk the number gets banned. If that worries you, use a number
  that isn't your main one.
- It's best if only you or a small group use the bot. The fewer people
  send commands, the lower the risk. With `#privado off` the bot stops
  replying in private chats, and with `#permitir` you can keep it only in
  the groups you choose.
- Type your owner number correctly. Whoever has that number can use the
  bot without limits and control its commands.
- Making the bot's number public is risky. If many people message it, the
  bot sends lots of messages in a row, and WhatsApp may treat it as spam
  and ban the number. If some people also report it, a ban is more likely.
  So if you're going to share it, use a separate number you don't mind
  losing.
- Only download the bot from its creator. If someone gives you a modified
  copy, there's no way to be sure it's the same.
- Never share the `baileys_auth_info` folder: with it, someone could get
  into your WhatsApp.

</details>

## Video tutorial that TikTok removed

https://github.com/user-attachments/assets/dbd03b35-76f3-4806-a1fa-f1958b2dbc60

## Commands

| Command | What it does |
| --- | --- |
| `#s` | Turns a photo or video into a sticker |
| `#s "hola"` | Sticker with the text "hola" at the bottom |
| `#s <link>` | Sticker from a link (TikTok, Facebook or X), cropped square and centered |
| `#s <link> completo` | Same, but with the whole video centered (not cropped) |
| `#s+a` | Video sticker with sound |
| `#s+a <link>` | Sticker with sound from a link |
| `#toimg` | Sticker to image |
| `#tomp4` | Animated sticker to video |
| `#recortar` | Crops a video to 1:1 |
| `#s-name "pack" "author"` | Changes a sticker's pack name and author |

Send the command together with the photo or video, or as a reply to a
message.

### Owner commands

The owner is your personal number. The bot asks for it the first time you
start it, after you choose how to link it, and saves it in
`config/owners.json`. Only that number can use these commands. If someone
else sends them, the bot doesn't answer.

The bot always works for the owner, even when it's turned off in groups
or private chats.

| Command | What it does |
| --- | --- |
| `#grupos on` / `#grupos off` | Lets the bot work in groups or not |
| `#privado on` / `#privado off` | Lets the bot work in private chats or not |
| `#limite on` / `#limite off` | Turns the command limit on or off for everyone |
| `#listagrupos` | Shows the groups the bot is in |
| `#permitir <number>` | Makes the bot work only in the groups you allow |
| `#quitar <number>` | Removes a group from the allowed list |

The number for `#permitir` and `#quitar` is the one shown in
`#listagrupos`. You can also send `#permitir` or `#quitar` inside the
group, without a number. If no groups are allowed, the bot works in all
of them.

<details>
<summary><b>Usage limits (tap to see)</b></summary>

The bot limits how many commands each person can send and how often.
That gives WhatsApp fewer reasons to treat it as spam and keeps the phone
from getting overloaded. It also stops a single person from keeping the
bot busy all the time.

These limits matter most if you decide to let more people use the bot,
for example in big groups or if you share its number. If only you or a
small group you trust use it, you'll barely notice them.

| Limit | What happens if someone goes over it |
| --- | --- |
| 3 s between commands | The bot ignores the command |
| 15 s between heavy conversions (`#s+a`, `#tomp4`, `#recortar`, `#s <link>`) | The bot ignores the command |
| 10 commands every 10 s per person | It says how long to wait |
| 3 heavy conversions per minute | It says how long to wait |
| 10 stickers per hour per person | It says in how many minutes they can make more |
| 25 commands every 10 s in the same group | It says in the group how long to wait |

The warning is sent only once. Until the time is up, the bot ignores that
person's commands without replying.

None of these limits apply to the owner, and the owner's commands don't
count toward the group limit.

With `#limite off` you turn these limits off for everyone, and with
`#limite on` you turn them back on. Even when they're off, the bot still
waits a little between each message and sticker it sends, and never sends
more than 20 stickers per minute. That can't be turned off, because it's
what protects the number from a ban the most.

</details>

### Stickers from links

Send `#s` or `#s+a` followed by a video link, for example
`#s https://vm.tiktok.com/...`. The bot downloads the video, removes the
black borders and crops it square. If you add `completo`, it doesn't crop
it and the whole video is shown. With `#s+a` the sticker has the video's
sound.

It only accepts links from TikTok, Facebook and X (Twitter). With any
other site it replies that it isn't allowed.

The video can be up to 50MB and up to 2 minutes long. The sticker uses
the first 12 seconds.

**Links:** `#s <link>` needs [yt-dlp](https://github.com/yt-dlp/yt-dlp).
It's optional: without it, everything else works the same.

- Termux: `pkg install -y yt-dlp`
- Windows: `winget install yt-dlp.yt-dlp`
- Linux: install the `yt-dlp` package or put the executable in
  `bin/yt-dlp` (you can also set the path with the `YTDLP_PATH`
  variable).

## Performance

<details>
<summary><b>Bot speed (tap to see)</b></summary>

The bot makes the stickers on the same phone or PC where you installed
it, so the speed depends on that device. On a low-end phone, stickers
take longer than on a high-end phone or a PC.

Photos come out fast on almost any device. Videos take longer, because
the bot converts them several times, lowering the quality each time,
until the sticker is as small as WhatsApp allows. `#s+a` takes a bit
longer because it also extracts the audio. With a link, it first has to
download the video, so your internet speed matters too.

The bot converts up to 3 videos at a time. If more arrive, they wait
their turn, and the bot tells each person how many files are ahead of
theirs. If a conversion takes more than 2 minutes, the bot cancels it and
says it took too long. If more than 30 are waiting, it reacts with 🕐 and
doesn't make that sticker. The owner's videos don't wait in line: they go
first as soon as a spot frees up and never get 🕐.

On Termux you can change how many it converts at a time when you start
the bot. On a high-end phone you can raise it to 5:

```bash
cd ~/botstickers && FFMPEG_MAX_CONCURRENT=5 bash start.sh
```

If your phone is low-end and Termux closes by itself while making
stickers, lower it to 1 with `FFMPEG_MAX_CONCURRENT=1`.

To make it faster:

- Turn off battery saving for Termux. If it's on, Android may slow the
  bot down or close it.

</details>

# THE NUMBER MUST BE WRITTEN ALL TOGETHER, WITH THE COUNTRY CODE AND NO SPACES, FOR EXAMPLE:
+502 1234 5678 : (This must not have spaces)
+50212345678 : (This is how it should look)
## Termux

### Install

Install Termux from [F-Droid](https://f-droid.org/packages/com.termux/),
[GitHub](https://github.com/termux/termux-app/releases) or the
[Play Store](https://play.google.com/store/apps/details?id=com.termux)
and type:

```bash
pkg update -y && pkg upgrade -y && pkg install -y git && git clone https://github.com/opgbl/botstickers ~/botstickers && cd ~/botstickers && bash start.sh
```

The first time, it installs everything it needs and asks how to link the
bot: `1` with a code or `2` with a QR.

### Stop the bot

Press `CTRL` + `C` (the `CTRL` key is in the row of keys above the
keyboard). If it says "Reiniciando en 5 s", press `CTRL` + `C` again
before it starts again.

To close Termux completely, type `exit` or tap "Exit" in the Termux
notification.

### Start the bot again

```bash
cd ~/botstickers && bash start.sh
```

You don't need to link it again: the session stays saved in the
`baileys_auth_info` folder.

### Update the bot

When there's a new version, stop the bot and type:

```bash
cd ~/botstickers && git pull && npm install --omit=dev --no-audit --no-fund && bash start.sh
```

You don't lose the session or your settings: the `baileys_auth_info`
folder, `config/owners.json` and `config/settings.json` aren't touched
when updating.

### Connection problems or linking again

If the bot doesn't connect, keeps disconnecting, or you logged out the
session in WhatsApp, delete the session and link it again:

```bash
rm -rf ~/botstickers/baileys_auth_info && cd ~/botstickers && bash start.sh
```

### Remove the bot completely

1. Stop the bot.
2. Log out the session in WhatsApp (the steps are further down, in
   "Log out the linked device").
3. Delete the bot's folder:

   ```bash
   rm -rf ~/botstickers
   ```

4. Optional: if you don't use Node.js or ffmpeg for anything else, you
   can remove them too:

   ```bash
   pkg uninstall -y nodejs-lts ffmpeg
   ```


## Windows

### Install

1. Install [Node.js](https://nodejs.org) (version 20 or newer).
2. Install ffmpeg. In PowerShell or CMD:

   ```
   winget install Gyan.FFmpeg
   ```

3. Download the bot from Code > Download ZIP and unzip it.
4. Open `iniciar.bat`. The first time, it installs the dependencies and
   asks how to link the bot, just like on Termux.

### Stop the bot

Close the `iniciar.bat` window. You can also press `Ctrl` + `C` and, when
it asks "¿Desea terminar el trabajo por lotes?" ("Terminate batch job?"),
type `S` (or `Y`) and Enter.

### Start the bot again

Open `iniciar.bat` again. You don't need to link it again.

### Update the bot

Stop the bot, download the ZIP again and unzip it. Copy the
`baileys_auth_info` folder and the `config/owners.json` and
`config/settings.json` files from the old folder into the new one, and
open `iniciar.bat`. If `config/settings.json` doesn't exist, it's because
you never used the owner commands.

### Connection problems or linking again

If the bot doesn't connect, keeps disconnecting, or you logged out the
session in WhatsApp, stop the bot, delete the `baileys_auth_info` folder
and open `iniciar.bat` again.

### Remove the bot completely

1. Stop the bot.
2. Log out the session in WhatsApp (the steps are below).
3. Delete the folder where you unzipped the bot.
4. Optional: if you don't use Node.js or ffmpeg for anything else,
   uninstall Node.js from Settings > Apps, and ffmpeg with:

   ```
   winget uninstall Gyan.FFmpeg
   ```

## Log out the linked device

This disconnects the bot from your WhatsApp. It's useful if you won't use
it anymore, if you think someone else has your session, or if you want to
link another number.

1. Open WhatsApp on your phone.
2. On Android, tap the three dots (⋮) at the top right. On iPhone, go to
   Settings.
3. Go to Linked devices.
4. Tap the bot's device and then Log out.

After this the bot can't get in anymore. If you start it, it will show
"Sesión cerrada por WhatsApp". To use it again, follow the steps in
"Connection problems or linking again" for Termux or Windows.

If you change phones or link the bot again, also remove the old device
from Linked devices.
