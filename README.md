# CocoaAir

AirDrop for every device. Send files, photos and text between an iPhone, a Windows PC, a Mac or an Android phone, straight from the browser. Nothing to install.

- **Nearby:** devices on the same Wi‑Fi find each other on their own.
- **Room code:** on different networks, one device creates a six-character code (and QR code) and the other types or scans it.
- **Files of any type and size**, several at a time, with progress, speed, time left and cancel. The receiver accepts or declines first.
- **Text and pasted images** arrive instantly. Received text copies with one click; received images copy with one click or <kbd>Ctrl</kbd> + <kbd>C</kbd>, drag straight into other apps on desktop, and save or share through the share sheet on iPhone.
- **Paste to send:** on desktop, <kbd>Ctrl</kbd> + <kbd>V</kbd> anywhere sends whatever is on the clipboard. Drag files onto a device to send them.
- **Light and dark themes** (dark is CocoaShot's), a compact desktop window and a touch layout for phones. Installable as an app.

Files travel directly between the two devices over an encrypted WebRTC connection. The server only introduces the devices; it never sees the files or the text.

## Quick start

```bash
npm install
npm run build        # type-check, web app into dist/, server into dist-server/
npm start            # serves the app and the signalling server on http://localhost:8080
```

During development, run `npm run dev:server` (server on port 8080) and `npm run dev` (Vite on port 5173, with `/api` proxied).

With Docker:

```bash
docker build -t cocoaair .
docker run -p 8080:8080 cocoaair
```

## Trying it with an iPhone and a Windows PC

1. On the PC, run `npm run build && npm start`. Allow Node through Windows Firewall on private networks when asked.
2. Find the PC's address (`ipconfig`, e.g. `192.168.1.20`), and open `http://192.168.1.20:8080` on the PC and on the iPhone. Both devices appear under **Nearby**.
3. No shared Wi‑Fi? Turn on the iPhone's Personal Hotspot and connect the PC to it.

Copying images to the clipboard and the share sheet only work on **HTTPS** pages (sending, receiving and saving work either way). For the full experience on the iPhone, put the server behind HTTPS: deploy the Docker image to any host with TLS, or use a tunnel such as `cloudflared tunnel --url http://localhost:8080` while testing. Set `TRUST_PROXY=1` behind a proxy so devices on the same network are grouped by their real address.

## How it works

1. Each open app keeps a WebSocket to the server (`/api/ws`). The server groups devices that reach it from the same network (same public IPv4 address, same IPv6 /64, or any private address when the server itself is on the local network) and tells them about each other.
2. Rooms are six-character codes from an alphabet without look-alike characters. A fresh code can be joined for 10 minutes, and each join renews that window; the room stays open while anyone is in it. Join attempts are rate limited.
3. To send, the two devices open a WebRTC connection. The server relays only the connection set-up, and only between devices that can see each other. Both sides use one pre-negotiated, reliable data channel, and crossing offers are resolved with the "perfect negotiation" pattern.
4. On the same Wi‑Fi the connection is local and fast. Across networks, STUN finds a direct path; when none exists (some mobile and office networks), a TURN relay carries the encrypted data, if one is configured.
5. Files go in 64 KB chunks with back-pressure, so memory on the sender stays flat. The receiver confirms progress as it goes, and the sender shows those confirmations. The screen is kept awake during a transfer.

### Data channel messages

| Message | Meaning |
| --- | --- |
| `text` | A text message |
| `offer` / `answer` | Files on offer (names, sizes, types) and the receiver's yes or no. A single image up to 25 MB marked as a paste is accepted without asking |
| `file`, binary chunks, `done` | One file's data, in order |
| `ack` | Bytes received so far; the last one marks the transfer complete |
| `cancel` | Either side stops the transfer |

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT`, `HOST` | `8080`, `0.0.0.0` | Where to listen |
| `STATIC_DIR` | `./dist` | Built web app to serve; set it empty to run the signalling server only |
| `TRUST_PROXY` | — | `1` behind a reverse proxy, so devices are grouped by their real address |
| `STUN_URLS` | `stun:stun.l.google.com:19302` | Comma-separated STUN servers; empty for none |
| `TURN_URLS` | — | Comma-separated TURN servers, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349` |
| `TURN_SECRET` | — | coturn `static-auth-secret`; each device gets credentials that expire after 24 hours |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | — | Fixed TURN credentials, when no secret is set |
| `ROOM_TTL_MINUTES` | `10` | How long a room code can be joined |
| `ROOM_MAX_PEERS` | `8` | Most devices in one room |
| `MAX_CONNECTIONS_PER_IP` | `32` | Most open connections from one address |

Without TURN, devices on networks that block direct connections cannot reach each other by room code; on the same Wi‑Fi TURN is never needed.

## Limits

- Safari on iPhone must stay open on the page while sending or receiving; locking the phone or switching apps pauses the connection.
- Received files are held in memory until saved. Several gigabytes at once can exceed what an iPhone allows a browser tab.
- Anyone on the same network who opens CocoaAir can see this device and send it text. Files always ask first.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:server` | Web app and server with live reload |
| `npm run build` | Type-check and build both |
| `npm test` | Unit tests (network grouping, rooms, relaying, TURN credentials) |
| `npm run test:e2e` | Builds, then runs two browsers (desktop and iPhone-sized) through text, a pasted image, files, rooms and the theme switch |
