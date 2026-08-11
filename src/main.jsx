import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function useRoom(role) {
  const params = new URLSearchParams(window.location.search);
  const initial = (params.get('room') || '').toUpperCase();
  const [code, setCode] = useState(initial);
  const [error, setError] = useState('');
  const channel = useRef(null);

  const setRoom = (value) => {
    const next = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(next);
    if (next) history.replaceState({}, '', `?role=${role}&room=${next}`);
  };

  const ensureCode = () => {
    const next = code || makeCode();
    setRoom(next);
    return next;
  };

  useEffect(() => () => {
    if (channel.current && supabase) supabase.removeChannel(channel.current);
  }, []);

  const openChannel = async (onSignal) => {
    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return null;
    }
    const room = ensureCode();
    const ch = supabase.channel(`adivue:${room}`, { config: { broadcast: { ack: true } } });
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload));
    const status = await ch.subscribe();
    if (status !== 'SUBSCRIBED') {
      setError(`Realtime connection failed: ${status}`);
      return null;
    }
    channel.current = ch;
    return ch;
  };

  const send = (payload) => channel.current?.send({ type: 'broadcast', event: 'signal', payload });
  return { code, setCode: setRoom, setError, error, ensureCode, openChannel, send };
}

function Header({ role }) {
  return <header>
    <div className="brand"><span className="mark">A</span><div><b>Adivue</b><small>Live creator monitor</small></div></div>
    <span className="role">{role}</span>
  </header>;
}

function RoomCard({ room, status, error }) {
  return <div className="room">
    <div><small>ROOM</small><strong>{room}</strong></div>
    <div><small>STATUS</small><span>{status}</span></div>
    {error && <p className="error">{error}</p>}
  </div>;
}

function Camera({ room }) {
  const video = useRef(null);
  const pc = useRef(null);
  const stream = useRef(null);
  const pendingCandidates = useRef([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [facing, setFacing] = useState('environment');

  const createOffer = async () => {
    if (!room.channel) return;
    pc.current?.close();
    pc.current = new RTCPeerConnection({ iceServers: STUN });
    stream.current?.getTracks().forEach(track => pc.current.addTrack(track, stream.current));
    pc.current.onicecandidate = e => e.candidate && room.send({ type: 'candidate', candidate: e.candidate });
    pc.current.onconnectionstatechange = () => {
      const state = pc.current?.connectionState || 'closed';
      setStatus(state === 'connected' ? 'Monitor connected' : state);
    };
    const offer = await pc.current.createOffer({ offerToReceiveVideo: false });
    await pc.current.setLocalDescription(offer);
    await room.send({ type: 'offer', sdp: pc.current.localDescription });
  };

  const start = async () => {
    try {
      room.setError('');
      room.ensureCode();
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API is unavailable. Use HTTPS and a supported browser.');
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false
      });
      if (video.current) video.current.srcObject = stream.current;
      setRunning(true);
      setStatus('Waiting for monitor');

      const channel = await room.openChannel(async msg => {
        if (msg.type === 'monitor-ready') {
          await createOffer();
          return;
        }
        if (msg.type === 'answer' && pc.current) {
          await pc.current.setRemoteDescription(msg.sdp);
          setStatus('Live');
          for (const candidate of pendingCandidates.current.splice(0)) {
            try { await pc.current.addIceCandidate(candidate); } catch {}
          }
          return;
        }
        if (msg.type === 'candidate' && pc.current && msg.candidate) {
          if (pc.current.remoteDescription) {
            try { await pc.current.addIceCandidate(msg.candidate); } catch {}
          } else {
            pendingCandidates.current.push(msg.candidate);
          }
        }
      });
      if (!channel) return;
      room.channel = channel;
      await room.send({ type: 'camera-ready' });
    } catch (e) {
      setStatus(e.name || 'Camera error');
      room.setError(e.message || 'Camera permission failed.');
    }
  };

  const stop = () => {
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    pc.current?.close();
    pc.current = null;
    if (video.current) video.current.srcObject = null;
    setRunning(false);
    setStatus('Stopped');
  };

  const flip = async () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    if (running) {
      stop();
      setTimeout(start, 120);
    }
  };

  return <div className="page">
    <Header role="CAMERA" />
    <main className="camera-main">
      <div className="video-shell"><video ref={video} autoPlay playsInline muted /></div>
      <div className="controls">
        <button className="primary" onClick={running ? stop : start}>{running ? '■ Stop Camera' : '▶ Start Camera'}</button>
        <button onClick={flip}>↔ Flip</button>
      </div>
      <RoomCard room={room.code || '------'} status={status} error={room.error} />
      <p className="hint">Open this page on the camera device. Keep it visible and allow camera access. Adivue sends the camera stream peer-to-peer after the monitor joins.</p>
    </main>
  </div>;
}

function Monitor({ room }) {
  const remote = useRef(null);
  const pc = useRef(null);
  const pendingCandidates = useRef([]);
  const [status, setStatus] = useState('Waiting');
  const [connected, setConnected] = useState(false);

  const connect = async () => {
    if (!room.code || room.code.length !== 6) {
      room.setError('Enter the six-character camera room code first.');
      return;
    }
    room.setError('');
    const channel = await room.openChannel(async msg => {
      if (msg.type === 'camera-ready') {
        await room.send({ type: 'monitor-ready' });
        return;
      }
      if (msg.type === 'offer') {
        pc.current?.close();
        pc.current = new RTCPeerConnection({ iceServers: STUN });
        pc.current.ontrack = e => {
          if (remote.current && e.streams[0]) remote.current.srcObject = e.streams[0];
          setConnected(true);
          setStatus('LIVE');
        };
        pc.current.onicecandidate = e => e.candidate && room.send({ type: 'candidate', candidate: e.candidate });
        pc.current.onconnectionstatechange = () => {
          const state = pc.current?.connectionState || 'closed';
          if (state !== 'connected') setStatus(state);
        };
        await pc.current.setRemoteDescription(msg.sdp);
        for (const candidate of pendingCandidates.current.splice(0)) {
          try { await pc.current.addIceCandidate(candidate); } catch {}
        }
        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);
        await room.send({ type: 'answer', sdp: pc.current.localDescription });
        return;
      }
      if (msg.type === 'candidate' && pc.current && msg.candidate) {
        if (pc.current.remoteDescription) {
          try { await pc.current.addIceCandidate(msg.candidate); } catch {}
        } else {
          pendingCandidates.current.push(msg.candidate);
        }
      }
    });
    if (!channel) return;
    room.channel = channel;
    setStatus('Connecting…');
    await room.send({ type: 'monitor-ready' });
  };

  return <div className="page monitor">
    <Header role="MONITOR" />
    <main className="monitor-main">
      <div className="remote-shell"><video ref={remote} autoPlay playsInline /></div>
      <div className="monitor-bar">
        <div><span className={`dot ${connected ? 'live' : ''}`}></span>{status}</div>
        <button onClick={() => document.documentElement.requestFullscreen?.()}>⛶ Fullscreen</button>
      </div>
      <div className="join">
        <label>Camera room code</label>
        <div className="join-row">
          <input value={room.code} maxLength="6" onChange={e => room.setCode(e.target.value)} placeholder="ABC123" />
          <button className="primary" onClick={connect}>Connect</button>
        </div>
      </div>
      <RoomCard room={room.code || '------'} status={status} error={room.error} />
      <p className="hint">Use this page on any supported browser: Android, iPhone, iPad, Windows, or Mac. It monitors the shared camera stream and does not control the source device.</p>
    </main>
  </div>;
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const role = (params.get('role') || 'home').toLowerCase();
  const room = useRoom(role);
  if (role === 'camera') return <Camera room={room} />;
  if (role === 'monitor') return <Monitor room={room} />;
  return <div className="page">
    <Header role="CREATOR TOOL" />
    <main className="home"><div className="hero">
      <div className="eyebrow">ADII · CREATOR LAB</div>
      <h1>See your shot.<br /><em>While you shoot it.</em></h1>
      <p>Adivue turns one browser into a camera source and another into a low-latency live monitor. No native app required.</p>
      <div className="cards">
        <a href="?role=camera" className="card"><span>01</span><h2>Camera</h2><p>Open on the camera device, allow access, and share the room code.</p></a>
        <a href="?role=monitor" className="card"><span>02</span><h2>Monitor</h2><p>Open on another phone, tablet, Windows PC, or Mac and enter the room code.</p></a>
      </div>
      <div className="tech">WebRTC · Supabase Realtime signaling · Netlify · No app install</div>
    </div></main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
