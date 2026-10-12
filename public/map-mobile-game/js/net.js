/**
 * Primal Hunt - co-op networking.
 *
 * Players connect to each other directly over WebRTC data channels. The
 * site's API (/api/primal-hunt/room) is only the meeting point: a guest posts
 * "I'd like to join" for the room code, the host posts back an offer, the
 * guest posts its answer, and from then on everything goes peer to peer.
 * Offers and answers are sent whole, once ICE gathering has finished, so
 * setting up a connection is just two messages.
 *
 * Each connection has two channels: 'rel' (reliable and ordered: lobby,
 * button presses, effects, the end of a run) and 'fast' (unordered, no
 * retransmits: positions and snapshots, where only the latest matters).
 *
 * Without a TURN server some networks (strict mobile carriers, some offices)
 * cannot connect peer to peer; the API hands out TURN servers if the site
 * has one configured.
 */
window.PH = window.PH || {};

(() => {
  const API = '/api/primal-hunt/room';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

  const post = async (body) => {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 503) throw new Error('Co-op is not available right now.');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Could not reach the server.');
    return j;
  };

  /** Resolve once ICE gathering is done (or after a few seconds, with what there is). */
  const gathered = (pc) => new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); res(); } };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(res, 3500);
  });

  class Room {
    /**
     * handlers: onMessage(peerId, msg), onPeerOpen(peerId, name), onPeerClosed(peerId), onStatus(text)
     */
    constructor(handlers = {}) {
      this.id = uuid();
      this.h = handlers;
      this.peers = new Map();       // peer id -> { pc, rel, fast, name, open }
      this.after = 0;
      this.pollT = null;
      this.closed = false;
      this.isHost = false;
    }

    status(t) { this.h.onStatus && this.h.onStatus(t); }

    /** Open a room; guests join with the code it returns. */
    async host() {
      this.isHost = true;
      const r = await post({ action: 'create', id: this.id });
      this.code = r.code;
      this.ice = r.iceServers;
      this.poll(1200);
      return this.code;
    }

    /** Join a room by its code. Resolves once the connection to the host is open. */
    async join(code, name) {
      this.code = code.toUpperCase();
      const r = await post({ action: 'join', code: this.code, id: this.id, name });
      this.hostId = r.hostId;
      this.ice = r.iceServers;
      this.status('Waiting for the host…');
      this.poll(700);
      return new Promise((res, rej) => {
        this.joinWait = { res, rej };
        setTimeout(() => { if (this.joinWait) { this.joinWait = null; rej(new Error('Could not connect to the host. Try again, or both join the same Wi-Fi.')); } }, 25000);
      });
    }

    poll(every) {
      clearInterval(this.pollT);
      const tick = async () => {
        if (this.closed || this.polling) return;
        this.polling = true;
        try {
          const r = await fetch(`${API}?code=${this.code}&id=${this.id}&after=${this.after}`, { cache: 'no-store' });
          const j = await r.json();
          for (const m of j.messages || []) { this.after = Math.max(this.after, m.id); await this.onSignal(m); }
        } catch { /* try again on the next tick */ }
        this.polling = false;
      };
      tick();
      this.pollT = setInterval(tick, every);
    }

    stopPolling() { clearInterval(this.pollT); this.pollT = null; }

    async onSignal(m) {
      if (this.isHost && m.kind === 'join') return this.offerTo(m.from, (m.body && m.body.name) || 'Hunter');
      if (this.isHost && m.kind === 'answer') {
        const p = this.peers.get(m.from);
        if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription(m.body);
        return;
      }
      if (!this.isHost && m.kind === 'offer' && m.from === this.hostId && !this.peers.has(m.from)) return this.answer(m.from, m.body);
      if (m.kind === 'bye') this.drop(m.from);
    }

    /** Host: a guest asked to join - set up its connection and send the offer. */
    async offerTo(gid, name) {
      if (this.peers.has(gid) || this.peers.size >= 3) return;
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      const p = { pc, name, open: false };
      this.peers.set(gid, p);
      p.rel = pc.createDataChannel('rel', { ordered: true });
      p.fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
      this.wire(gid, p);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      await post({ action: 'signal', code: this.code, from: this.id, to: gid, kind: 'offer', body: pc.localDescription.toJSON() });
    }

    /** Guest: the host's offer arrived - answer it. */
    async answer(hid, offer) {
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      const p = { pc, name: 'Host', open: false };
      this.peers.set(hid, p);
      pc.ondatachannel = (e) => { p[e.channel.label] = e.channel; this.wireChannel(hid, p, e.channel); };
      this.wire(hid, p);
      await pc.setRemoteDescription(offer);
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      await post({ action: 'signal', code: this.code, from: this.id, to: hid, kind: 'answer', body: pc.localDescription.toJSON() });
      this.status('Connecting…');
    }

    wire(pid, p) {
      if (p.rel) this.wireChannel(pid, p, p.rel);
      if (p.fast) this.wireChannel(pid, p, p.fast);
      p.pc.onconnectionstatechange = () => {
        const s = p.pc.connectionState;
        if (s === 'failed' || s === 'closed') this.drop(pid);
        if (s === 'disconnected') setTimeout(() => { if (p.pc.connectionState === 'disconnected') this.drop(pid); }, 6000);
      };
    }

    wireChannel(pid, p, ch) {
      ch.onopen = () => {
        if (!p.rel || p.rel.readyState !== 'open' || p.open) return;
        p.open = true;
        if (!this.isHost) {
          this.stopPolling();
          if (this.joinWait) { this.joinWait.res(); this.joinWait = null; }
        }
        this.h.onPeerOpen && this.h.onPeerOpen(pid, p.name);
      };
      ch.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        this.h.onMessage && this.h.onMessage(pid, msg);
      };
      ch.onclose = () => { if (ch.label === 'rel') this.drop(pid); };
    }

    drop(pid) {
      const p = this.peers.get(pid);
      if (!p) return;
      this.peers.delete(pid);
      try { p.pc.close(); } catch { /* already closed */ }
      if (p.open) this.h.onPeerClosed && this.h.onPeerClosed(pid);
      else if (!this.isHost && this.joinWait) { this.joinWait.rej(new Error('The connection failed.')); this.joinWait = null; }
    }

    send(pid, msg, fast = false) {
      const p = this.peers.get(pid);
      const ch = p && (fast ? p.fast : p.rel);
      if (!ch || ch.readyState !== 'open') return;
      // An unordered channel that is backing up: drop this one, a newer one is coming.
      if (fast && ch.bufferedAmount > 64000) return;
      try { ch.send(JSON.stringify(msg)); } catch { /* closing */ }
    }

    broadcast(msg, fast = false) {
      const s = JSON.stringify(msg);
      for (const p of this.peers.values()) {
        const ch = fast ? p.fast : p.rel;
        if (!ch || ch.readyState !== 'open' || (fast && ch.bufferedAmount > 64000)) continue;
        try { ch.send(s); } catch { /* closing */ }
      }
    }

    /** Guests only: the host. */
    toHost(msg, fast = false) { this.send(this.hostId, msg, fast); }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.stopPolling();
      for (const [pid, p] of this.peers) {
        try { p.rel && p.rel.readyState === 'open' && p.rel.send(JSON.stringify({ t: 'bye' })); } catch { /* closing */ }
        try { p.pc.close(); } catch { /* closed */ }
        this.peers.delete(pid);
      }
    }
  }

  PH.Net = { Room, supported: typeof RTCPeerConnection === 'function' };
})();
