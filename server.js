// Jornada Radio — live MP3 transcode server.
// Takes whatever song is currently playing on each station website (same
// station clock) and transcodes it to MP3 on the fly, serving an endless
// Shoutcast-style stream per station. When Tom edits the YouTube playlists,
// the hourly tracks.json refresh picks it up automatically.

const http = require('http');
const { spawn } = require('child_process');

const WORKER_A = 'https://jornada-radio.artieai.workers.dev/a/';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Silent plain-stereo 128k MP3 frames (no ID3 tag, no Xing header) sent to
// each new listener immediately on connect, so old players (TCPMP-based
// HPC Media Player via WinInet) get clean decodable audio instantly.
const PREROLL = Buffer.from('//uQBAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSBECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kgRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5IEQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSBECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kgRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5IEQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSBECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kgRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5IEQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSBECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kgRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5IEQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV', 'base64');

const STATIONS = {
  house: {
    name: 'House Tracks Radio',
    epochMs: 1790553600000,
    tracksUrl: 'https://artieai-house-tracks-radio.static.hf.space/tracks.json',
    path: '/house.mp3',
    tracks: [],
    clients: new Set(),
    djRunning: false,
    currentFF: null,
    idleTimer: null,
    ring: [],
    ringBytes: 0,
  },
  shm: {
    name: 'Super Hot Mix Radio',
    epochMs: 1790380800000,
    tracksUrl: 'https://artieai-super-hot-mix-radio.static.hf.space/tracks.json',
    path: '/shm.mp3',
    tracks: [],
    clients: new Set(),
    djRunning: false,
    currentFF: null,
    idleTimer: null,
    ring: [],
    ringBytes: 0,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ring buffer sizing (128 kbps = 16,000 bytes/s): keep 90s, burst the
// last ~32s to each new listener on connect.
const RING_CAP = 90 * 16000;
const BURST_BYTES = 512 * 1024;

async function refreshTracks() {
  for (const [key, st] of Object.entries(STATIONS)) {
    try {
      const r = await fetch(st.tracksUrl, { headers: { 'User-Agent': UA } });
      if (!r.ok) { console.log(`[${key}] tracks.json HTTP ${r.status}, keeping old list`); continue; }
      const list = await r.json();
      if (Array.isArray(list) && list.length) {
        st.tracks = list.filter((t) => t && t.v && t.d > 0);
        console.log(`[${key}] loaded ${st.tracks.length} tracks`);
      }
    } catch (e) {
      console.log(`[${key}] tracks.json fetch failed: ${e.message}, keeping old list`);
    }
  }
}

// Same station-clock math as the websites: which track + offset is playing now.
function currentPosition(tracks, epochMs) {
  const total = tracks.reduce((s, t) => s + t.d, 0);
  if (!total) return null;
  let elapsed = Math.floor((Date.now() - epochMs) / 1000) % total;
  if (elapsed < 0) elapsed += total;
  for (let i = 0; i < tracks.length; i++) {
    if (elapsed < tracks[i].d) return { index: i, offset: elapsed, track: tracks[i] };
    elapsed -= tracks[i].d;
  }
  return { index: 0, offset: 0, track: tracks[0] };
}

// Quick ranged probe: does the worker have audio for this video right now?
async function checkAudio(videoId) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(WORKER_A + videoId + '.m4a', {
      headers: { Range: 'bytes=0-4095', 'User-Agent': UA },
      signal: ctrl.signal,
    });
    clearTimeout(to);
    // Drain/close so we don't leak sockets.
    if (r.body) { try { await r.body.cancel(); } catch (_) {} }
    return r.status === 206 || r.status === 200;
  } catch (_) {
    return false;
  }
}

function broadcast(st, chunk) {
  // Keep the last ~90 seconds in a ring buffer: new listeners get an
  // instant burst from it (Shoutcast/Icecast-style), because old players
  // won't start playing a live stream that only trickles in at realtime
  // rate — they prebuffer first, and a burst fills that buffer at once.
  st.ring.push(chunk);
  st.ringBytes += chunk.length;
  while (st.ringBytes > RING_CAP && st.ring.length > 1) {
    st.ringBytes -= st.ring.shift().length;
  }
  for (const res of st.clients) {
    try {
      if (!res.write(chunk)) { /* backpressure: drop for slow clients, keep radio live */ }
    } catch (_) {}
  }
}

function playTrack(st, track, offset, maxPlaySec) {
  return new Promise((resolve) => {
    const url = WORKER_A + track.v + '.m4a';
    const args = [
      '-ss', String(offset),
      '-re',
      '-i', url,
      '-vn',
      '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100',
      '-joint_stereo', '0', '-id3v2_version', '0', '-write_xing', '0',
      '-f', 'mp3', '-',
    ];
    console.log(`[${st.name}] now playing: ${track.t} @${offset}s`);
    st.ring = []; st.ringBytes = 0; // new track: burst buffer starts fresh
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    st.currentFF = ff;
    const startedAt = Date.now();
    // A substitute track must never overrun the station slot it fills:
    // kill it at the slot boundary so the loop resyncs to the clock.
    let killTimer = null;
    if (maxPlaySec && maxPlaySec > 0) {
      killTimer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch (_) {} }, maxPlaySec * 1000);
    }
    let stderrTail = '';
    ff.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-500); });
    ff.stdout.on('data', (chunk) => broadcast(st, chunk));
    const done = () => {
      if (killTimer) clearTimeout(killTimer);
      if (st.currentFF === ff) st.currentFF = null;
      resolve(Math.max(0, (Date.now() - startedAt) / 1000 - 1));
    };
    ff.on('close', (code) => {
      const played = Math.max(0, (Date.now() - startedAt) / 1000 - 1);
      console.log(`[${st.name}] ffmpeg closed code=${code} after ${played.toFixed(1)}s: ${track.t}${code ? ' | ' + stderrTail.slice(-200).trim().split('\n').pop() : ''}`);
      done();
    });
    ff.on('error', (e) => { console.log(`[${st.name}] ffmpeg error: ${e.message}`); done(); });
  });
}

// The DJ: keeps the stream glued to the station clock.
// - If the scheduled track's source dies mid-play, RESUME the same track
//   at the correct offset instead of jumping ahead to another song.
// - A substitute track is cut off at the slot boundary, so a failover
//   can never push the stream ahead of (or behind) the website clock
//   past the end of the current song's slot.
async function djLoop(key) {
  const st = STATIONS[key];
  if (st.djRunning) return;
  st.djRunning = true;
  console.log(`[${st.name}] DJ started`);
  try {
    while (st.clients.size > 0) {
      if (!st.tracks.length) { await sleep(15000); continue; }
      const pos = currentPosition(st.tracks, st.epochMs);
      if (!pos) { await sleep(15000); continue; }
      st.badIds = st.badIds || new Map();
      const slotSec = pos.track.d - pos.offset; // seconds left in this slot
      const slotEnd = Date.now() + slotSec * 1000;
      let played = false;
      const blacklisted = st.badIds.get(pos.track.v) > Date.now();
      // Blacklisted = had an early exit recently, skip without probing.
      const probeOk = blacklisted ? false : await checkAudio(pos.track.v);
      if (probeOk) {
        // Play the scheduled track, resuming at the right offset if its
        // source dies early, until the slot is genuinely over.
        let playedTotal = 0;
        let guard = 0;
        while (playedTotal < slotSec - 2 && st.clients.size > 0 && guard++ < 8 && Date.now() < slotEnd - 2000) {
          const playedNow = await playTrack(st, pos.track, pos.offset + Math.floor(playedTotal), slotSec - playedTotal);
          playedTotal += playedNow;
          if (playedTotal >= slotSec - 2) break;
          console.log(`[${st.name}] premature end at ${playedTotal.toFixed(0)}s of ${slotSec}s slot, resuming: ${pos.track.t}`);
          if (!(await checkAudio(pos.track.v))) break; // source gone: fail over for the rest of the slot
          await sleep(1500);
        }
        played = playedTotal > 0;
        if (played && playedTotal < 45) {
          // Died almost immediately every time = bad source. Skip this
          // video for a while so we don't loop on it.
          console.log(`[${st.name}] early exit after ${playedTotal.toFixed(0)}s, blacklisting: ${pos.track.t}`);
          st.badIds.set(pos.track.v, Date.now() + 30 * 60 * 1000);
        }
      } else {
        if (blacklisted) console.log(`[${st.name}] skip (blacklisted): ${pos.track.t}`);
        else console.log(`[${st.name}] skip (unfetchable): ${pos.track.t}`);
        // Failover: probe the next 9 tracks in parallel and play the
        // first that works — but only until this slot ends.
        const candidates = [];
        for (let a = 1; a < 10; a++) {
          const t = st.tracks[(pos.index + a) % st.tracks.length];
          if (st.badIds.get(t.v) > Date.now()) continue; // skip blacklisted
          candidates.push(t);
        }
        const results = await Promise.all(
          candidates.map(async (t) => ({ track: t, ok: await checkAudio(t.v) }))
        );
        const found = results.find((r) => r.ok);
        for (const r of results) {
          if (!r.ok) console.log(`[${st.name}] skip (unfetchable): ${r.track.t}`);
        }
        if (found) {
          const remain = Math.max(0, (slotEnd - Date.now()) / 1000);
          if (remain > 5) {
            const subPlayed = await playTrack(st, found.track, 0, remain);
            played = true;
            if (subPlayed < 45) {
              console.log(`[${st.name}] early exit after ${subPlayed.toFixed(0)}s, blacklisting: ${found.track.t}`);
              st.badIds.set(found.track.v, Date.now() + 30 * 60 * 1000);
            }
          }
        }
      }
      if (!played) {
        console.log(`[${st.name}] nothing playable for this slot, retrying in 20s`);
        await sleep(20000);
      }
      // Loop re-syncs to the station clock after every track.
    }
  } finally {
    st.djRunning = false;
    console.log(`[${st.name}] DJ stopped (no listeners)`);
  }
}

function attachClient(key, req, res) {
  const st = STATIONS[key];
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache, no-store',
    'Connection': 'keep-alive',
    'icy-name': st.name,
    'icy-pub': '1',
    'icy-br': '128',
  });
  // Flush headers + the silent pre-roll right away; ffmpeg audio follows
  // as soon as the DJ has the current track running.
  try { res.write(PREROLL); } catch (_) {}
  // Instant burst: the last ~32s of audio, starting on a frame boundary.
  // This is what makes old players start: their prebuffer fills at once
  // instead of waiting ~30s for a realtime trickle to accumulate.
  if (st.ringBytes > 0) {
    const parts = [];
    let take = BURST_BYTES;
    for (let i = st.ring.length - 1; i >= 0 && take > 0; i--) {
      const b = st.ring[i];
      if (b.length <= take) { parts.unshift(b); take -= b.length; }
      else { parts.unshift(b.subarray(b.length - take)); take = 0; }
    }
    const burst = Buffer.concat(parts);
    let start = 0;
    while (start < burst.length - 1 &&
           !(burst[start] === 0xff && (burst[start + 1] & 0xe0) === 0xe0)) start++;
    try { res.write(burst.subarray(start)); } catch (_) {}
  }
  st.clients.add(res);
  if (st.idleTimer) { clearTimeout(st.idleTimer); st.idleTimer = null; }
  djLoop(key);
  console.log(`[${st.name}] listener +1 (${st.clients.size})`);
  req.on('close', () => {
    st.clients.delete(res);
    console.log(`[${st.name}] listener -1 (${st.clients.size})`);
    if (st.clients.size === 0 && !st.idleTimer) {
      // Grace period for blips, then stop ffmpeg to save CPU.
      st.idleTimer = setTimeout(() => {
        st.idleTimer = null;
        if (st.clients.size === 0 && st.currentFF) {
          console.log(`[${st.name}] idle 60s, stopping ffmpeg`);
          try { st.currentFF.kill('SIGKILL'); } catch (_) {}
        }
      }, 60000);
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/house.mp3') return attachClient('house', req, res);
  if (url.pathname === '/shm.mp3') return attachClient('shm', req, res);
  if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const s = {};
    for (const [k, st] of Object.entries(STATIONS)) {
      const pos = st.tracks.length ? currentPosition(st.tracks, st.epochMs) : null;
      s[k] = {
        name: st.name,
        tracks: st.tracks.length,
        listeners: st.clients.size,
        now: pos ? { title: pos.track.t, artist: pos.track.a, offset: pos.offset } : null,
      };
    }
    res.end(JSON.stringify(s, null, 2));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Jornada Radio live MP3 — /house.mp3 /shm.mp3\n');
});

const PORT = process.env.PORT || 7860;
(async () => {
  await refreshTracks();
  setInterval(refreshTracks, 60 * 60 * 1000); // pick up playlist edits hourly
  server.listen(PORT, () => console.log(`listening on ${PORT}`));
})();
