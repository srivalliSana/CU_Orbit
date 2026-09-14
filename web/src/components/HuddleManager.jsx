import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { emit, on } from '../api/socket';
import Avatar from './Avatar';

// Google's free public STUN servers — enough for NAT traversal on most
// home/campus/consumer-ISP networks. No TURN server is provisioned, so a
// call between two people both behind restrictive/symmetric NATs (common on
// some corporate networks and a few mobile carriers) can fail to connect —
// a real, known limitation of shipping without paid TURN infrastructure,
// not a bug in the signaling itself.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * 1:1 voice/video calls ("Huddles"), mounted once at the app root so an
 * incoming call can be answered regardless of which chat is currently
 * open. Pure peer-to-peer WebRTC — the server only relays signaling
 * (server/lib/realtime.js's huddle:* events), never sees or touches the
 * actual audio/video.
 */
const HuddleManager = forwardRef(function HuddleManager({ user }, ref) {
  const [state, setState] = useState('idle');   // idle | calling | incoming | active
  const [peerName, setPeerName] = useState('');
  const [videoOn, setVideoOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerIdRef = useRef(null);
  const containerIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const cleanup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peerIdRef.current = null;
    containerIdRef.current = null;
    pendingCandidatesRef.current = [];
    setState('idle');
    setVideoOn(false);
    setMuted(false);
  };

  const buildPeerConnection = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate && peerIdRef.current) {
        emit('huddle:signal', { toUserId: peerIdRef.current, signal: { type: 'ice-candidate', data: e.candidate } });
      }
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && state !== 'idle') {
        setError(pc.connectionState === 'failed' ? "Couldn't connect — the other person's network may be blocking direct calls." : null);
      }
    };
    return pc;
  };

  const getLocalStream = async (withVideo) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  const start = async (toUserId, toUserName, containerId) => {
    setError(null);
    try {
      peerIdRef.current = toUserId;
      containerIdRef.current = containerId;
      setPeerName(toUserName);
      setState('calling');
      const stream = await getLocalStream(false);
      const pc = buildPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emit('huddle:invite', { toUserId, containerId, fromUserName: user?.name });
      emit('huddle:signal', { toUserId, signal: { type: 'offer', data: offer } });
    } catch (e) {
      setError(e.message?.includes('Permission') ? 'Microphone access was blocked.' : 'Could not start the call.');
      cleanup();
    }
  };

  const accept = async () => {
    setError(null);
    try {
      const stream = await getLocalStream(false);
      const pc = buildPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      // The offer arrived while we were still "incoming" (no peer connection
      // yet to hand it to) — apply it now that one exists.
      const pending = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const item of pending) await applySignal(item);
      setState('active');
    } catch (e) {
      setError('Microphone access was blocked.');
      decline();
    }
  };

  const decline = () => {
    if (peerIdRef.current) emit('huddle:decline', { toUserId: peerIdRef.current });
    cleanup();
  };

  const end = () => {
    if (peerIdRef.current) emit('huddle:end', { toUserId: peerIdRef.current });
    cleanup();
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = muted; });
    setMuted((m) => !m);
  };

  const toggleVideo = async () => {
    if (!pcRef.current) return;
    if (!videoOn) {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
      if (!camStream) return;
      const track = camStream.getVideoTracks()[0];
      localStreamRef.current.addTrack(track);
      pcRef.current.addTrack(track, localStreamRef.current);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      emit('huddle:signal', { toUserId: peerIdRef.current, signal: { type: 'offer', data: offer } });
      setVideoOn(true);
    } else {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.stop(); localStreamRef.current.removeTrack(t); });
      setVideoOn(false);
    }
  };

  const applySignal = async ({ signal }) => {
    const pc = pcRef.current;
    if (!pc) { pendingCandidatesRef.current.push({ signal }); return; }
    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit('huddle:signal', { toUserId: peerIdRef.current, signal: { type: 'answer', data: answer } });
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      setState('active');
    } else if (signal.type === 'ice-candidate') {
      await pc.addIceCandidate(new RTCIceCandidate(signal.data)).catch(() => {});
    }
  };

  useImperativeHandle(ref, () => ({ start }));

  useEffect(() => {
    const offIncoming = on('huddle:incoming', ({ fromUserId, fromUserName, containerId }) => {
      // Already on a call — treat as busy, no UI change (matches a normal
      // phone; no call-waiting here).
      if (state !== 'idle') return;
      peerIdRef.current = fromUserId;
      containerIdRef.current = containerId;
      setPeerName(fromUserName || 'Someone');
      setState('incoming');
    });
    const offSignal = on('huddle:signal', ({ fromUserId, signal }) => {
      if (fromUserId !== peerIdRef.current) return;
      applySignal({ signal });
    });
    const offDeclined = on('huddle:declined', ({ fromUserId }) => {
      if (fromUserId !== peerIdRef.current) return;
      setError(`${peerName || 'They'} declined.`);
      cleanup();
    });
    const offEnded = on('huddle:ended', ({ fromUserId }) => {
      if (fromUserId !== peerIdRef.current) return;
      cleanup();
    });
    return () => { offIncoming(); offSignal(); offDeclined(); offEnded(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, peerName]);

  if (state === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-72 overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/10">
      {state === 'incoming' ? (
        <div className="flex flex-col items-center gap-3 p-5">
          <Avatar name={peerName} size={56} />
          <p className="text-sm font-semibold">{peerName}</p>
          <p className="text-xs text-slate-400">Incoming huddle…</p>
          <div className="flex gap-3">
            <button onClick={decline} className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold hover:bg-red-700">Decline</button>
            <button onClick={accept} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold hover:bg-emerald-700">Accept</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="relative aspect-video bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-2 right-2 h-16 w-24 rounded-lg border border-white/20 object-cover" />
            {!videoOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Avatar name={peerName} size={56} />
                <p className="text-sm font-semibold">{peerName}</p>
                <p className="text-xs text-slate-400">{state === 'calling' ? 'Calling…' : 'Huddle in progress'}</p>
              </div>
            )}
          </div>
          {error && <p className="px-3 pt-2 text-[11px] text-amber-400">{error}</p>}
          <div className="flex items-center justify-center gap-3 p-3">
            <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} className={`rounded-full p-2.5 ${muted ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>
              {muted ? '🔇' : '🎤'}
            </button>
            <button onClick={toggleVideo} title={videoOn ? 'Turn off video' : 'Turn on video'} className={`rounded-full p-2.5 ${videoOn ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>
              📷
            </button>
            <button onClick={end} title="Leave" className="rounded-full bg-red-600 p-2.5 hover:bg-red-700">📞</button>
          </div>
        </div>
      )}
    </div>
  );
});

export default HuddleManager;
