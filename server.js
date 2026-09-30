// Jornada Radio — live MP3 transcode server.
// Takes whatever song is currently playing on each station website (same
// station clock) and transcodes it to MP3 on the fly, serving an endless
// Shoutcast-style stream per station. When Tom edits the YouTube playlists,
// the hourly tracks.json refresh picks it up automatically.

const http = require('http');
const { spawn } = require('child_process');

const WORKER_A = 'https://jornada-radio.artieai.workers.dev/a/';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

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
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const to = setTimeout(() => ctrl.abort(), 15000);
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
  for (const res of st.clients) {
    try {
      if (!res.write(chunk)) { /* backpressure: drop for slow clients, keep radio live */ }
    } catch (_) {}
  }
}

function playTrack(st, track, offset) {
  return new Promise((resolve) => {
    const url = WORKER_A + track.v + '.m4a';
    const args = [
      '-ss', String(offset),
      '-re',
      '-i', url,
      '-vn',
      '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100',
      '-f', 'mp3', '-',
    ];
    console.log(`[${st.name}] now playing: ${track.t} @${offset}s`);
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    st.currentFF = ff;
    let stderrTail = '';
    ff.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-500); });
    ff.stdout.on('data', (chunk) => broadcast(st, chunk));
    const done = () => {
      if (st.currentFF === ff) st.currentFF = null;
      resolve();
    };
    ff.on('close', (code) => {
      if (code !== 0) console.log(`[${st.name}] ffmpeg exited code ${code}: ${stderrTail.slice(-200)}`);
      done();
    });
    ff.on('error', (e) => { console.log(`[${st.name}] ffmpeg error: ${e.message}`); done(); });
  });
}

// The DJ: keeps the stream on the station clock, skipping unfetchable tracks.
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
      let played = false;
      // Try the scheduled track, then up to 9 following tracks if they 502.
      for (let attempt = 0; attempt < 10; attempt++) {
        const idx = (pos.index + attempt) % st.tracks.length;
        const track = st.tracks[idx];
        const off = attempt === 0 ? pos.offset : 0;
        if (await checkAudio(track.v)) {
          await playTrack(st, track, off);
          played = true;
          break;
        }
        console.log(`[${st.name}] skip (unfetchable): ${track.t}`);
      }
      if (!played) {
        console.log(`[${st.name}] 10 tracks failed in a row, retrying in 20s`);
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
  });
  // Send a tiny ID3-free pre-roll so players start cleanly; ffmpeg follows.
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
