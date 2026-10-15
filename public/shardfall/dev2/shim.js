// Shardfall phase 2 DEV STAND-IN (loaded only with ?dev2=1, after the real sim/ai/missions scripts).
// Fakes whatever the phase 2 simulation contract adds but the loaded modules do not provide yet, so the front end
// can be built and tested before the real modules land. Each fake turns itself off when the real feature exists:
//   - team.faction, faction-filtered options(), Hegemony start units / AI unit picks (remapped from the roster)
//   - team.super charging (fast: ?swcharge=<seconds>, default 25), the 'superweapon' command, sim.strikes,
//     'superweapon' warn/strike events + damage, the ready/detected/launched alerts; ?sw=1 gives both teams a
//     superweapon building (and two reactors) at the start; ?aisw=1 lets the computer fire its own
//   - cloak for units with `cloak: true` (entity.cloaked, isVisible respecting it, 'cloak' events)
//   - sim.mission from a mission object: a timeline that ticks objectives off every ?mt=<seconds> (default 4),
//     plays the mission's messages and ends in a win (?lose=1: a loss)
//   - SF.MISSIONS (five placeholder missions) when js/missions.js is missing
// Nothing here is used without ?dev2=1. Delete this folder once the real modules are merged.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const C = window.SF_CONFIG;
    if (!SF.Sim || !C) return;
    const Q = new URLSearchParams(location.search);
    const P = {
        swcharge: +(Q.get('swcharge') || 25), sw: Q.get('sw') === '1', aisw: Q.get('aisw') === '1',
        mt: +(Q.get('mt') || 4), lose: Q.get('lose') === '1',
    };
    SF.DEV2 = { params: P, faked: {} };
    const H_UNITS = { rifleman: 'trooper', rocketeer: 'shocktrooper', buggy: 'skimmer', tank: 'lancer', artillery: 'phantom' };
    const V_UNITS = {}; for (const k in H_UNITS) V_UNITS[H_UNITS[k]] = k;
    const remapFor = (faction, type) => (faction === 'hegemony' ? H_UNITS[type] : V_UNITS[type]) || type;

    // ------------------------------------------------------------------ placeholder missions
    if (!Array.isArray(SF.MISSIONS) || !SF.MISSIONS.length) {
        SF.DEV2.faked.missions = true;
        const say = (from, text) => ({ message: { from, text } });
        const CV = 'Cmdr. Hale', CH = 'Overseer Vex';
        SF.MISSIONS = [
            { id: 'm1', title: 'First Light', faction: 'vanguard', enemyFaction: 'hegemony', summary: 'Build a foothold on Kessar and repel the first raid. (dev placeholder)',
              briefing: ['Placeholder briefing. Kessar’s shard fields are ours to take, Commander. Build a reactor, a refinery and start harvesting.', 'The Hegemony is watching. Train riflemen and hold the line.'],
              map: { seed: 1101, size: 64 }, player: { start: true }, enemy: { ai: 'easy', start: true },
              objectives: [{ id: 'o1', text: 'Build a Reactor', kind: 'build', type: 'reactor', count: 1 }, { id: 'o2', text: 'Build a Refinery', kind: 'build', type: 'refinery', count: 1 },
                  { id: 'o3', text: 'Harvest 1,500 credits', kind: 'harvest', credits: 1500 }, { id: 'o4', text: 'Destroy the Hegemony outpost', kind: 'destroyAll', hidden: true }],
              triggers: [{ at: 1, do: [say(CV, 'Commander, welcome to Kessar. Start with a Reactor from the Buildings tab.')] }, { at: 6, do: [say(CV, 'Good. A Refinery comes with a harvester. Shards mean credits.')] },
                  { at: 12, do: [say(CH, 'Vanguard intruders. You will not keep this field.')] }] },
            { id: 'm2', title: 'Hold the Ridge', faction: 'vanguard', enemyFaction: 'hegemony', summary: 'Survive eight minutes of Hegemony assaults. (dev placeholder)',
              briefing: ['Placeholder briefing. The ridge overlooks the richest fields on Kessar. Fortify it and hold.'], map: { seed: 2202, size: 64 },
              objectives: [{ id: 'o1', text: 'Survive', kind: 'survive', seconds: 480 }, { id: 'o2', text: 'Keep the Command Core alive', kind: 'protect', tag: 'core' }],
              triggers: [{ at: 2, do: [say(CV, 'Waves inbound from the north and east. Turrets need power: keep the reactors up.')] }] },
            { id: 'm3', title: 'Ghost Protocol', faction: 'hegemony', enemyFaction: 'vanguard', summary: 'Cross the map unseen and silence three comms arrays. (dev placeholder)',
              briefing: ['Placeholder briefing. Our Phantoms cannot be seen unless the enemy comes close. Use that.'], map: { seed: 3303, size: 64 },
              objectives: [{ id: 'o1', text: 'Destroy comms array Alpha', kind: 'destroy' }, { id: 'o2', text: 'Destroy comms array Beta', kind: 'destroy' }, { id: 'o3', text: 'Destroy comms array Gamma', kind: 'destroy' },
                  { id: 'o4', text: 'Reach the extraction point', kind: 'reach', hidden: true }],
              triggers: [{ at: 2, do: [say(CH, 'Stay out of their sight lines. A cloaked unit is revealed when it fires.')] }] },
            { id: 'm4', title: 'Breakthrough', faction: 'hegemony', enemyFaction: 'vanguard', summary: 'Break a fortified Vanguard base. (dev placeholder)',
              briefing: ['Placeholder briefing. The Vanguard has dug in behind turrets and artillery. Break them.'], map: { seed: 4404, size: 64 },
              objectives: [{ id: 'o1', text: 'Destroy every Vanguard structure', kind: 'destroyAll' }, { id: 'o2', text: 'Destroy the Orbital Uplink before it fires', kind: 'destroy', optional: true }],
              triggers: [{ at: 2, do: [say(CH, 'Their uplink is charging. Destroy it and the Lance never falls.')] }] },
            { id: 'm5', title: 'Shardfall', faction: 'vanguard', enemyFaction: 'hegemony', summary: 'The final battle for Kessar. (dev placeholder)',
              briefing: ['Placeholder briefing. Everything comes down to this field. Both sides have superweapons.'], map: { seed: 5505, size: 80 },
              objectives: [{ id: 'o1', text: 'Destroy every Hegemony structure', kind: 'destroyAll' }],
              triggers: [{ at: 2, do: [say(CV, 'Their Rift Silo is somewhere north. Find it before it finds us.')] }] },
        ];
    }

    // ------------------------------------------------------------------ the simulation wrapper
    const Base = SF.Sim;
    class DevSim extends Base {
        constructor(opts) {
            opts = Object.assign({}, opts || {});
            const mission = opts.mission || null;
            if (mission && mission.map) { if (mission.map.seed != null) opts.seed = mission.map.seed; if (mission.map.size) opts.size = mission.map.size; }
            super(opts);
            const dev = this._dev = {};
            const facs = opts.factions || (mission ? [mission.faction, mission.enemyFaction] : null) || ['vanguard', 'hegemony'];
            if (this.teams[0].faction === undefined) {
                dev.faction = dev.cloak = true;
                this.teams.forEach((t, i) => { t.faction = facs[i] || (i ? 'hegemony' : 'vanguard'); });
                for (const e of this.entities.values()) {
                    if (e.kind !== 'unit') continue;
                    const nt = remapFor(this.teams[e.team].faction, e.type);
                    if (nt !== e.type && C.UNITS[nt]) { e.type = nt; e.hp = e.maxHp = C.UNITS[nt].hp; e.radius = C.UNITS[nt].radius; }
                }
            }
            if (this.teams[0].super === undefined) { dev.super = true; this.teams.forEach((t) => { t.super = null; t._swSeen = null; }); this.strikes = []; this._sid = 1; }
            if (mission && !this.mission) dev.mission = new FakeMission(this, mission);
            if (P.sw && dev.super) {
                for (let t = 0; t < 2; t++) {
                    const s = this.map.starts[t];
                    // the superweapon building plus two reactors to power it
                    for (const type of [C.FACTIONS[this.teams[t].faction].superweapon, 'reactor', 'reactor']) {
                        for (let r = 4; r < 12; r++) {
                            let done = false;
                            for (const [dx, dz] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
                                const tx = s.tx + 1 + dx, tz = s.tz + 1 + dz;
                                if (this.canPlace(t, type, tx, tz)) { this._addBuilding(t, type, tx, tz, 1); done = true; break; }
                            }
                            if (done) break;
                        }
                    }
                }
                this._refreshLists(); this._updatePower(true);
            }
            SF.DEV2.faked.faction = !!dev.faction; SF.DEV2.faked.super = !!dev.super; SF.DEV2.faked.cloak = !!dev.cloak; SF.DEV2.faked.mission = !!dev.mission;
            this.events.length = 0;
        }
        options(team) {
            const out = super.options(team);
            if (!this._dev || !this._dev.faction || !this.teams[team]) return out;
            const f = this.teams[team].faction;
            return out.filter((o) => { const d = C.BUILDINGS[o.type] || C.UNITS[o.type]; return !d || !d.faction || d.faction === f; });
        }
        command(team, cmd) {
            const dev = this._dev;
            if (dev && cmd && cmd.type === 'superweapon' && dev.super) return this._devFire(team, cmd.x, cmd.z);
            if (dev && dev.faction && cmd && (cmd.type === 'queue' || cmd.type === 'cancel') && this.teams[team] && C.UNITS[cmd.item]) {
                cmd = Object.assign({}, cmd, { item: remapFor(this.teams[team].faction, cmd.item) });
            }
            return super.command(team, cmd);
        }
        isVisible(team, e) {
            if (this._dev && this._dev.cloak && e && e.cloaked && e.team !== team) return false;
            return super.isVisible(team, e);
        }
        step() {
            super.step();
            const dev = this._dev; if (!dev) return;
            if (dev.cloak) this._devCloak();
            if (dev.super) this._devSuper();
            if (dev.mission) dev.mission.step(this.cfg.TICK);
        }
        _devCloak() {
            for (const u of this.entities.values()) {
                if (u.kind !== 'unit' || u.dead) continue;
                const d = C.UNITS[u.type]; if (!d || !d.cloak) continue;
                let seen = u.firing < (d.cloakDelay || 2.5);
                if (!seen) for (const o of this.entities.values()) {
                    if (o.team === u.team || o.dead) continue;
                    const r = d.revealRange || 2.5;
                    if (Math.abs(o.x - u.x) < r + 1.5 && Math.abs(o.z - u.z) < r + 1.5 && Math.hypot(o.x - u.x, o.z - u.z) - (o.kind === 'building' ? o.radius : 0) <= r) { seen = true; break; }
                }
                const c = !seen;
                if (!!u.cloaked !== c) { u.cloaked = c; this._ev({ type: 'cloak', id: u.id, on: c }); }
            }
        }
        _devSuper() {
            const T = this.cfg.TICK;
            for (const tm of this.teams) {
                const kind = C.BUILDINGS[C.FACTIONS[tm.faction].superweapon].superweapon, sw = C.SUPERWEAPONS[kind];
                let b = null;
                for (const e of this._blds()) if (e.team === tm.id && !e.dead && C.BUILDINGS[e.type].superweapon && (e.built == null || e.built >= 1)) { b = e; break; }
                if (!b) { tm.super = null; tm._swSeen = null; continue; }
                if (tm._swSeen !== b.id) { tm._swSeen = b.id; this._alert(1 - tm.id, 'Enemy superweapon detected', b.x, b.z); }
                if (!tm.super || tm.super.building !== b.id) tm.super = { type: kind, building: b.id, charge: 0, ready: false };
                const s = tm.super;
                if (!s.ready && !tm.lowPower) {
                    s.charge = Math.min(1, s.charge + T / (P.swcharge || sw.charge));
                    if (s.charge >= 1) { s.ready = true; this._alert(tm.id, sw.name + ' ready'); }
                }
                if (s.ready && tm.ai && P.aisw) {
                    let tgt = null;
                    for (const e of this._blds()) if (e.team !== tm.id && !e.dead && this.isKnown(tm.id, e)) { tgt = e; if (e.type === 'core') break; }
                    if (tgt) this._devFire(tm.id, tgt.x, tgt.z);
                }
            }
            if (this.strikes.length) {
                const keep = [];
                for (const s of this.strikes) {
                    if (this.time < s.t) { keep.push(s); continue; }
                    const sw = C.SUPERWEAPONS[s.kind];
                    this._ev({ type: 'superweapon', team: s.team, kind: s.kind, x: s.x, z: s.z, phase: 'strike' });
                    for (const e of Array.from(this.entities.values())) {
                        if (e.dead) continue;
                        const d = Math.max(0, Math.hypot(e.x - s.x, e.z - s.z) - (e.kind === 'building' ? e.radius * 0.7 : 0));
                        if (d > sw.radius) continue;
                        const f = 1 - (1 - sw.falloff) * (d / sw.radius);
                        this._damage(e, sw.damage * (sw.vs[this._armor(e)] || 1) * f, null, s.team);
                    }
                }
                this.strikes = keep;
            }
        }
        _devFire(team, x, z) {
            const tm = this.teams[team];
            if (!tm || !tm.super || !tm.super.ready || !(x >= 0 && z >= 0 && x < this.map.w && z < this.map.h)) return false;
            if (tm.vis[(z | 0) * this.map.w + (x | 0)] < 1) return false;
            const kind = tm.super.type, sw = C.SUPERWEAPONS[kind];
            tm.super.ready = false; tm.super.charge = 0;
            const s = { id: this._sid++, team, kind, x, z, t: this.time + sw.warn, warn: sw.warn };
            this.strikes.push(s);
            this._ev({ type: 'superweapon', team, kind, x, z, phase: 'warn' });
            for (let t = 0; t < 2; t++) this._alert(t, 'Superweapon launched', x, z, 'swl' + s.id);
            return true;
        }
    }

    // Timeline stand-in for the real mission interpreter: shows the mission's objectives and messages and ticks
    // them off on a timer, so the HUD, radio panel and end screens can be exercised.
    class FakeMission {
        constructor(sim, def) {
            this.sim = sim; this.def = def; this.t = 0;
            sim.mission = { id: def.id, title: def.title, status: 'active', time: 0,
                objectives: (def.objectives || []).map((o) => ({ id: o.id, text: o.text, done: false, failed: false, progress: '', optional: !!o.optional, hidden: !!o.hidden })) };
            const msgs = [];
            for (const tr of def.triggers || []) for (const a of tr.do || []) if (a.message) msgs.push(a.message);
            const S = P.mt;
            this.plan = [];
            msgs.forEach((m, i) => this.plan.push({ t: 1 + i * S * 1.3, fn: () => this.msg(m) }));
            const req = sim.mission.objectives.filter((o) => !o.optional);
            if (P.lose) this.plan.push({ t: S * 2, fn: () => { const o = req[0]; if (o) { o.failed = true; this.ev(o); } this.end('lost', 'Objective failed'); } });
            else {
                req.forEach((o, i) => this.plan.push({ t: S * (i + 1.5), fn: () => this.complete(o) }));
                this.plan.push({ t: S * (req.length + 2.2), fn: () => this.end('won', 'All objectives complete') });
            }
            this.plan.sort((a, b) => a.t - b.t);
        }
        ev(o) { this.sim._ev({ type: 'objective', id: o.id, done: o.done, failed: o.failed, text: o.text }); }
        msg(m) { this.sim._ev({ type: 'message', from: m.from, text: m.text, portrait: m.portrait }); }
        complete(o) {
            o.done = true; o.progress = ''; this.ev(o);
            const objs = this.sim.mission.objectives, i = objs.indexOf(o), nx = objs.find((x, k) => k > i && x.hidden);
            if (nx) { nx.hidden = false; this.ev(nx); }
        }
        end(status, reason) {
            const M = this.sim.mission; if (M.status !== 'active') return;
            M.status = status; this.sim._ev({ type: 'mission', status, reason });
        }
        step(dt) {
            const M = this.sim.mission; this.t += dt; M.time = this.t;
            if (M.status !== 'active') return;
            while (this.plan.length && this.plan[0].t <= this.t) this.plan.shift().fn();
            for (const o of M.objectives) {
                if (o.hidden || o.done || o.failed) continue;
                const d = (this.def.objectives || []).find((x) => x.id === o.id) || {};
                if (d.kind === 'survive') { const left = Math.max(0, (d.seconds || 60) - this.t); o.progress = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'); }
                else if (d.kind === 'harvest') o.progress = Math.min(d.credits || 0, Math.round(this.t * 180)) + '/' + (d.credits || 0);
                else if (d.kind === 'army' || d.kind === 'build') o.progress = '0/' + (d.count || 1);
            }
        }
    }
    SF.Sim = DevSim;
})();
