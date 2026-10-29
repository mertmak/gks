// Door simulation engine: pure state updates, driven by the page's animation
// loop. The server plans the day and decides every card read; the engine
// walks people between areas, predicts each read from the same rules so the
// animation never waits for the network, and queues the reads for sending.
export const OUTSIDE = 'dis';
export const SPEEDS = [1, 5, 20]; // simulated minutes per real second
export const MISREAD_CARD = 'OKUNAMADI';
const MINUTE = 60000;
const WALK = 120; // plan units per simulated minute
const RETRY = 0.5 * MINUTE;
const EVENT_TARGETS = { giris: 'home', moladan_don: 'home', yemekten_don: 'home', mola: 'Mola', yemek: 'Yemekhane', cikis: OUTSIDE };
const EVENT_LABELS = { giris: 'İşe geliyor', mola: 'Molaya çıkıyor', moladan_don: 'Moladan dönüyor', yemek: 'Yemeğe gidiyor', yemekten_don: 'Yemekten dönüyor', cikis: 'Çıkıyor' };

export const toMs = wallClock => Date.parse(wallClock + 'Z');
export const wallClock = ms => new Date(ms).toISOString().slice(0, 19);
export const clockLabel = ms => new Date(ms).toISOString().slice(11, 16);

const sides = door => [door.a ?? OUTSIDE, door.b ?? OUTSIDE];

// Door types are directional where the plan allows it: the main entry only
// leads in, the cafeteria entry only into the cafeteria, and so on. A door
// whose sides cannot satisfy its rule is used both ways.
export function canPass(door, from, to, typeOf) {
  const rule = {
    'Ana Giriş': [node => node === OUTSIDE, () => true],
    'Ana Çıkış': [() => true, node => node === OUTSIDE],
    'Yemekhane Giriş': [() => true, node => typeOf(node) === 'Yemekhane'],
    'Yemekhane Çıkış': [node => typeOf(node) === 'Yemekhane', () => true],
    'Mola / Sigara Alanı': [() => true, node => typeOf(node) === 'Mola'],
  }[door.type];
  if (!rule) return true;
  const [a, b] = sides(door);
  const fits = (x, y) => rule[0](x) && rule[1](y);
  return fits(a, b) || fits(b, a) ? fits(from, to) : true;
}

// Cheapest door sequence between two nodes. Doors the person cannot use
// (no permission, passive) are a last resort, so they are tried only when no
// other way exists and the read is then denied, as in a real building.
export function route(plan, from, to, usable = () => true) {
  if (from === to) return [];
  const typeOf = node => plan.areas.find(area => area.ref === node)?.type;
  const doors = plan.doors.filter(door => door.placed && (door.a || door.b));
  const best = new Map([[from, { cost: 0, path: [] }]]);
  const open = [from];
  while (open.length) {
    open.sort((x, y) => best.get(x).cost - best.get(y).cost);
    const node = open.shift();
    if (node === to) return best.get(node).path;
    for (const door of doors) {
      const [a, b] = sides(door);
      const next = node === a ? b : node === b ? a : null;
      if (next == null || !canPass(door, node, next, typeOf)) continue;
      // Breaks start at a break-area door; prefer it over an inner door.
      const cost = best.get(node).cost + 1 + (usable(door) ? 0 : 50)
        + (typeOf(next) === 'Mola' && door.type !== 'Mola / Sigara Alanı' ? 3 : 0);
      if (!best.has(next) || cost < best.get(next).cost) {
        best.set(next, { cost, path: [...best.get(node).path, { door, from: node, to: next }] });
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  return null;
}

// Each person stands at their own spot so dots in one area do not overlap.
function spot(plan, node, person, via) {
  const area = plan.areas.find(item => item.ref === node);
  if (!area) {
    if (!via) return { x: -100, y: -100 };
    const inside = plan.areas.find(item => item.ref === (via.a ?? via.b));
    const normal = !inside ? [0, 0] : via.x === inside.x ? [-1, 0] : via.x === inside.x + inside.w ? [1, 0] : via.y === inside.y ? [0, -1] : [0, 1];
    return { x: via.x + normal[0] * 40, y: via.y + normal[1] * 40 };
  }
  const columns = Math.max(1, Math.floor((area.w - 40) / 22));
  const rows = Math.max(1, Math.floor((area.h - 70) / 22));
  const slot = person.index % (columns * rows);
  return { x: area.x + 20 + (slot % columns) * 22 + 11, y: area.y + 56 + Math.floor(slot / columns) * 22 + 11 };
}

export function workAreas(areas) {
  for (const type of ['Ofis', 'Diğer', 'Lobi']) {
    const found = areas.filter(area => area.type === type);
    if (found.length) return found;
  }
  return areas.slice(0, 1);
}

export function createSimulation(plan, dayPlan, { misread = 0, random = Math.random } = {}) {
  const homes = workAreas(plan.areas);
  const planned = dayPlan.kisiler.filter(person => person.olaylar.length);
  const times = planned.flatMap(person => person.olaylar.map(event => toMs(event.zaman)));
  const day = toMs(dayPlan.tarih + 'T00:00:00');
  const people = planned.map((person, index) => ({
    id: person.id, name: person.ad_soyad, card: person.kart, late: person.gec, index,
    permitted: new Set(person.kapilar), home: homes[index % homes.length]?.ref ?? null,
    node: OUTSIDE, x: -100, y: -100, legs: [], next: 0,
    events: person.olaylar.map(event => ({ type: event.tur, at: toMs(event.zaman) })),
  }));
  return {
    plan, day, misread, random, people, nextRead: 1,
    clock: times.length ? Math.min(...times) - 30 * MINUTE : day + 8 * 60 * MINUTE,
    end: times.length ? Math.max(...times) + 30 * MINUTE : day + 18 * 60 * MINUTE,
    outbox: [], feed: [], flashes: [], counts: { ok: 0, denied: 0 }, notes: [],
    absent: dayPlan.kisiler.filter(person => !person.olaylar.length).map(person => ({ name: person.ad_soyad, reason: person.durum })),
  };
}

// Builds the timed legs of a trip: walk to each door, read, walk through.
function startTrip(sim, person, steps, label) {
  // People outside are not drawn; they appear in front of the first door.
  if (person.node === OUTSIDE && steps.length) Object.assign(person, spot(sim.plan, OUTSIDE, person, steps[0].door));
  let at = sim.clock, from = { x: person.x, y: person.y };
  const legs = [];
  for (const step of steps) {
    const door = { x: step.door.x, y: step.door.y };
    at += Math.max(0.2 * MINUTE, Math.hypot(door.x - from.x, door.y - from.y) / WALK * MINUTE);
    legs.push({ x: door.x, y: door.y, at, read: step });
    const target = spot(sim.plan, step.to, person, step.door);
    at += Math.max(0.2 * MINUTE, Math.hypot(target.x - door.x, target.y - door.y) / WALK * MINUTE);
    legs.push({ x: target.x, y: target.y, at, node: step.to });
    from = target;
  }
  person.legs = legs;
  person.legStart = { x: person.x, y: person.y, at: sim.clock };
  if (label) note(sim, `${clockLabel(sim.clock)} ${person.name}: ${label}`);
}

function note(sim, text) {
  sim.notes.unshift(text);
  sim.notes.length = Math.min(sim.notes.length, 50);
}

const usableBy = person => door => door.active && person.permitted.has(door.id);

function targetNode(sim, person, type) {
  const target = EVENT_TARGETS[type];
  if (target === 'home' || target === OUTSIDE) return target === 'home' ? person.home : OUTSIDE;
  return sim.plan.areas.find(area => area.type === target)?.ref ?? null;
}

// A read happens when a person reaches a door. The prediction uses the same
// rules as the server; the server's answer is attached to the feed later.
function read(sim, person, leg) {
  const { door, from } = leg.read;
  const misread = sim.misread && sim.random() < sim.misread;
  const card = misread ? MISREAD_CARD : person.card;
  const reason = !door.active ? 'Kapı pasif' : misread ? 'Tanımsız kart' : !person.permitted.has(door.id) ? 'Kapı yetkisi yok' : null;
  const entry = record(sim, { card, door, from, at: leg.at, person, ok: !reason, reason: reason || 'Geçiş onaylandı' });
  if (!reason) return;
  // Denied: a misread card is tried again; otherwise the person turns back.
  if (misread) {
    const retry = { ...leg, at: leg.at + RETRY };
    const rest = person.legs.map(item => ({ ...item, at: item.at + RETRY }));
    person.legs = [retry, ...rest];
    entry.retry = true;
    return;
  }
  const back = spot(sim.plan, from, person, door);
  person.legs = [{ x: back.x, y: back.y, at: leg.at + 0.5 * MINUTE, node: from }];
}

// Reads at a door on the plan carry the side they come from (A = door.a).
function record(sim, { card, door, from = sides(door)[0], at, person, ok, reason }) {
  const direction = door.a || door.b ? (from === sides(door)[0] ? 'A→B' : 'B→A') : undefined;
  const entry = { id: sim.nextRead++, card, doorId: door.id, doorName: door.name, direction, at, personId: person?.id ?? null, name: person?.name ?? 'Tanımsız kart', ok, reason };
  sim.outbox.push(entry);
  sim.feed.unshift(entry);
  sim.feed.length = Math.min(sim.feed.length, 200);
  sim.counts[ok ? 'ok' : 'denied']++;
  sim.flashes.push({ doorId: door.id, ok, until: at + 2 * MINUTE });
  return entry;
}

function advance(sim, person) {
  while (person.legs.length && person.legs[0].at <= sim.clock) {
    const leg = person.legs.shift();
    person.legStart = { x: leg.x, y: leg.y, at: leg.at };
    Object.assign(person, { x: leg.x, y: leg.y });
    if (leg.node) person.node = leg.node;
    if (leg.read) read(sim, person, leg);
  }
  if (person.legs.length) {
    const leg = person.legs[0], start = person.legStart;
    const share = Math.min(1, Math.max(0, (sim.clock - start.at) / Math.max(1, leg.at - start.at)));
    person.x = start.x + (leg.x - start.x) * share;
    person.y = start.y + (leg.y - start.y) * share;
  }
}

function startEvents(sim, person) {
  while (!person.legs.length && person.next < person.events.length && person.events[person.next].at <= sim.clock) {
    const event = person.events[person.next++];
    const target = targetNode(sim, person, event.type);
    if (target == null || target === person.node) continue;
    const steps = route(sim.plan, person.node, target, usableBy(person));
    if (!steps) { note(sim, `${clockLabel(sim.clock)} ${person.name}: ${EVENT_LABELS[event.type]} ama planda yol yok.`); continue; }
    startTrip(sim, person, steps, EVENT_LABELS[event.type] + (event.type === 'giris' && person.late ? ' (geç)' : ''));
  }
}

// Moves the clock in small slices so reads keep their exact minute.
export function step(sim, ms) {
  const target = Math.min(sim.end, sim.clock + ms);
  while (sim.clock < target) {
    sim.clock = Math.min(target, sim.clock + 15000);
    for (const person of sim.people) {
      startEvents(sim, person);
      advance(sim, person);
    }
  }
  sim.flashes = sim.flashes.filter(flash => flash.until > sim.clock);
  return sim;
}

export const finished = sim => sim.clock >= sim.end && sim.people.every(person => !person.legs.length);

export const inside = sim => sim.people.filter(person => person.node !== OUTSIDE || person.legs.length).length;

// Manual mode: walk a person to a door and try it from the side they reach.
export function manualPass(sim, personId, doorId) {
  const person = sim.people.find(item => item.id === personId);
  const door = sim.plan.doors.find(item => item.id === doorId);
  if (!person || !door?.placed) return 'Kapı planda değil.';
  if (person.legs.length) return `${person.name} şu an yürüyor; biraz sonra tekrar deneyin.`;
  const [a, b] = sides(door);
  const options = [[a, b], [b, a]].map(([near, far]) => ({ near, far, path: route(sim.plan, person.node, near, usableBy(person)) }))
    .filter(option => option.path).sort((x, y) => x.path.length - y.path.length);
  if (!options.length) return `${person.name} bu kapıya ulaşamıyor.`;
  const { near, far, path } = options[0];
  startTrip(sim, person, [...path, { door, from: near, to: far }], `${door.name} kapısına gidiyor`);
  return null;
}

export function unknownCard(sim, doorId) {
  const door = sim.plan.doors.find(item => item.id === doorId);
  if (!door?.placed) return null;
  const card = 'TANIMSIZ-' + String(Math.floor(sim.random() * 9000) + 1000);
  return record(sim, { card, door, at: sim.clock, person: null, ok: false, reason: door.active ? 'Tanımsız kart' : 'Kapı pasif' });
}

// Takes up to `max` queued reads in the server's request format.
export function takeReads(sim, max = 50) {
  const batch = sim.outbox.splice(0, max);
  return { batch, body: { tarih: wallClock(sim.day).slice(0, 10), okutmalar: batch.map(entry => ({ kart: entry.card, kapi_id: entry.doorId, zaman: wallClock(Math.floor(entry.at / 1000) * 1000), yon: entry.direction })) } };
}

export function settleReads(sim, batch, results) {
  batch.forEach((entry, i) => {
    const result = results[i];
    if (!result) return;
    entry.server = result.basarili;
    entry.serverReason = result.neden;
  });
}
