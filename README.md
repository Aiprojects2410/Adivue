# Adivue

Adivue is a browser-first, cross-device live camera monitor for creators. Use one phone as a camera source and another phone, tablet, Windows PC, or Mac as the monitor.

## V1

- iPhone Safari / Android Chrome camera capture
- Android, iPhone, Windows, and macOS monitor browsers
- WebRTC peer-to-peer video transport
- Supabase Realtime Broadcast signaling only
- Six-character room pairing
- Front/back camera selection where the browser exposes it
- Fullscreen monitor
- 1080p capture target with adaptive WebRTC delivery
- No native app required
- No video is stored in Supabase

## Platform boundary

Adivue monitors a camera stream. It does not inject touches into iOS/Android, silently capture arbitrary system UI, or remotely operate native apps. Camera and screen capture require explicit browser permission and a secure context.

## Setup

1. Create a Supabase project.
2. Enable Realtime.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run `npm install`.
5. Run `npm run dev` for local development.
6. Deploy to Netlify with build command `npm run build` and publish directory `dist`.

For physical iPhone camera testing, use an HTTPS deployment or an HTTPS local tunnel. Camera APIs require a secure context.

## Architecture

`getUserMedia -> MediaStream -> RTCPeerConnection -> remote <video>`

`Supabase Realtime Broadcast -> room-scoped SDP/ICE signaling`

Netlify hosts the web application. It is not the video relay. STUN is used for direct WebRTC connectivity. A TURN service can be added later for networks where direct connectivity fails; TURN may create bandwidth costs because media is relayed.

## Public usage

Adivue is designed as a public URL-based product. There is no hard-coded personal device or account. Each session uses a temporary room code.
