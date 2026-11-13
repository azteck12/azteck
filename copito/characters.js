// Módulo compartido: Copito (y el osito) idénticos en todos los episodios.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const bounce = (x) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + .75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + .9375;
  return n1 * (x -= 2.625 / d1) * x + .984375;
};
const pulse = (t, a, b, fade = .15) => sstep(a, a + fade, t) * (1 - sstep(b - fade, b, t));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rand(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SPH = new THREE.SphereGeometry(1, 48, 32);
const SPHlo = new THREE.SphereGeometry(1, 20, 14);
const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .55, ...o });
const MAT = {
  fur: phys('#fdfbf7', { roughness: .9, sheen: 1, sheenRoughness: .45, sheenColor: new THREE.Color('#ffffff') }),
  pink: phys('#ffb3c7', { roughness: .7, sheen: .6, sheenColor: new THREE.Color('#ffe0ea') }),
  nose: phys('#ff7fa6', { roughness: .3, clearcoat: .6 }),
  denim: phys('#2f7de1', { roughness: .85, sheen: .5, sheenColor: new THREE.Color('#9cc8ff') }),
  denimDark: phys('#2363b8', { roughness: .9 }),
  button: phys('#ffd23f', { roughness: .25, metalness: .3, clearcoat: 1 }),
  sclera: phys('#ffffff', { roughness: .08, clearcoat: 1 }),
  irisBlue: phys('#2aa7ff', { roughness: .15, clearcoat: 1, emissive: '#0a4c9a', emissiveIntensity: .35 }),
  irisBrown: phys('#5a3418', { roughness: .15, clearcoat: 1 }),
  pupil: phys('#0b0d1a', { roughness: .05, clearcoat: 1 }),
  hl: new THREE.MeshBasicMaterial({ color: '#f2f2f2' }),
  mouth: phys('#7a1f35', { roughness: .4 }),
  line: phys('#5b2a3a', { roughness: .5 }),
  tooth: phys('#ffffff', { roughness: .2, clearcoat: .8 }),
  bear: phys('#b07848', { roughness: .9, sheen: 1, sheenRoughness: .5, sheenColor: new THREE.Color('#ffd2a6') }),
  bearTan: phys('#f0cfa0', { roughness: .85, sheen: .6, sheenColor: new THREE.Color('#fff0d8') }),
  bearNose: phys('#3b2216', { roughness: .25, clearcoat: 1 }),
  red: phys('#ff3b4e', { roughness: .3, clearcoat: .8 }),
  browBunny: phys('#e8c9d2', { roughness: .8 }),
  browBear: phys('#6b4426', { roughness: .8 }),
  card: phys('#c9925a', { roughness: .95 }),
  cardDark: phys('#a8743f', { roughness: .95 }),
  tape: phys('#e9d29c', { roughness: .5, clearcoat: .3 }),
};

function mesh(geo, mat, pos = [0, 0, 0], scl = [1, 1, 1], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (typeof scl === 'number') m.scale.setScalar(scl); else m.scale.set(...scl);
  m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// cápsula entre dos puntos
const CAP = new THREE.CapsuleGeometry(1, 1, 8, 16);
function stick(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(.001, len), 6, 12), mat);
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------------ personajes
function makeCritter(o) {
  const g = new THREE.Group();
  const P = { eyes: [], irises: [], brows: [], ears: [], arms: [], legs: [] };
  const fur = o.fur;
  const root = new THREE.Group(); g.add(root); P.root = root;
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * .2, .2, 0); root.add(leg); P.legs.push(leg);
    leg.add(mesh(SPH, fur, [0, -.09, .08], [.16, .11, .24]));
    leg.add(mesh(SPH, o.inner, [0, -.07, .3], [.09, .06, .03]));
  }
  const body = new THREE.Group(); root.add(body); P.body = body;
  body.add(mesh(SPH, fur, [0, .62, 0], [.5, .55, .47]));
  if (o.overall) {
    const shell = new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, Math.PI * .43, Math.PI * .57);
    body.add(mesh(shell, MAT.denim, [0, .62, 0], [.515, .565, .487]));
    body.add(mesh(new RoundedBoxGeometry(.46, .34, .1, 4, .045), MAT.denim, [0, .9, .405], 1, [-.32, 0, 0]));
    body.add(mesh(new RoundedBoxGeometry(.17, .1, .03, 3, .012), MAT.denimDark, [0, .88, .46], 1, [-.32, 0, 0]));
    for (const s of [-1, 1]) {
      body.add(stick(V(s * .17, 1.04, .38), V(s * .21, 1.13, .02), .035, MAT.denim));
      body.add(stick(V(s * .21, 1.13, .02), V(s * .17, .95, -.4), .035, MAT.denim));
      body.add(mesh(new THREE.CylinderGeometry(.045, .045, .03, 20), MAT.button, [s * .16, 1.02, .45], 1, [Math.PI / 2 - .32, 0, 0]));
    }
  }
  if (o.belly) body.add(mesh(SPH, o.belly, [0, .6, .3], [.33, .36, .2]));
  if (o.bowtie) {
    for (const s of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(.09, .16, 16), MAT.red, [s * .08, 1.03, .36], 1, [0, 0, s * Math.PI / 2]));
    body.add(mesh(SPH, MAT.red, [0, 1.03, .38], .05));
  }
  // cabeza
  const head = new THREE.Group(); head.position.y = 1.08; body.add(head); P.head = head;
  head.add(mesh(SPH, fur, [0, .36, 0], [.55, .49, .5]));
  for (const s of [-1, 1]) head.add(mesh(SPH, fur, [s * .23, .19, .27], [.16, .14, .15]));
  if (o.kind === 'bunny') {
    for (const s of [-1, 1]) head.add(mesh(SPH, fur, [s * .075, .2, .42], [.12, .1, .1]));
    head.add(mesh(SPH, MAT.nose, [0, .285, .5], [.065, .045, .04]));
    for (const s of [-1, 1]) head.add(mesh(new RoundedBoxGeometry(.045, .06, .02, 2, .008), MAT.tooth, [s * .025, .095, .475]));
  } else {
    head.add(mesh(SPH, o.inner, [0, .19, .4], [.19, .14, .13]));
    head.add(mesh(SPH, MAT.bearNose, [0, .26, .52], [.075, .05, .045]));
  }
  // mejillas sonrojadas
  const blushMat = new THREE.MeshBasicMaterial({ color: '#ff8fb1', transparent: true, opacity: .55, depthWrite: false });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(.075, 24), blushMat);
    b.position.set(s * .31, .2, .4); b.rotation.y = s * .65; head.add(b);
  }
  P.blushMat = blushMat;
  // boca
  P.mouth = mesh(SPH, MAT.mouth, [0, .1, .44], [.07, .02, .04]); head.add(P.mouth);
  P.smile = mesh(new THREE.TorusGeometry(.075, .013, 8, 28, Math.PI), MAT.line, [0, .14, .455], 1, [-.25, 0, Math.PI]);
  head.add(P.smile);
  // ojos
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * .2, .42, .38); eg.rotation.set(-.05, s * .33, 0); head.add(eg);
    const es = o.eyeScale || 1;
    eg.add(mesh(SPH, MAT.sclera, [0, 0, 0], [.145 * es, .175 * es, .1]));
    const ig = new THREE.Group(); ig.position.z = .045; eg.add(ig);
    ig.add(mesh(SPH, o.iris, [0, 0, .03], [.112 * es, .132 * es, .05]));
    ig.add(mesh(SPH, MAT.pupil, [0, 0, .055], [.064 * es, .076 * es, .032]));
    const h1 = new THREE.Mesh(SPH, MAT.hl); h1.position.set(.038 * es, .052 * es, .088); h1.scale.setScalar(.034 * es); ig.add(h1);
    const h2 = new THREE.Mesh(SPH, MAT.hl); h2.position.set(-.032 * es, -.045 * es, .086); h2.scale.setScalar(.017 * es); ig.add(h2);
    P.eyes.push(eg); P.irises.push(ig);
    const brow = mesh(CAP, o.brow, [s * .2, .64, .41], [.022, .055, .022], [0, 0, Math.PI / 2]);
    head.add(brow); P.brows.push(brow);
  }
  // orejas
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); head.add(eg); P.ears.push(eg);
    if (o.kind === 'bunny') {
      eg.position.set(s * .17, .76, -.04); eg.rotation.z = -s * .2;
      eg.add(mesh(CAP, fur, [0, .36, 0], [.115, .27, .06]));
      eg.add(mesh(CAP, MAT.pink, [0, .36, .04], [.072, .23, .025]));
    } else {
      eg.position.set(s * .36, .72, -.02);
      eg.add(mesh(SPH, fur, [0, 0, 0], [.16, .16, .09]));
      eg.add(mesh(SPH, o.inner, [0, 0, .05], [.095, .095, .05]));
    }
  }
  // brazos
  for (const s of [-1, 1]) {
    const ag = new THREE.Group(); ag.position.set(s * .4, .96, 0); body.add(ag); P.arms.push(ag);
    ag.add(mesh(CAP, fur, [0, -.21, 0], [.1, .14, .1]));
  }
  body.add(mesh(SPH, fur, [0, .45, -.47], o.kind === 'bunny' ? .15 : .09));
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { g, P, kind: o.kind };
}

function poseCritter(c, t, p) {
  const P = c.P;
  const breathe = Math.sin(t * 2.4 + (p.phase || 0)) * .015;
  P.root.scale.set(1 + (p.squash || 0) * .15, 1 - (p.squash || 0) * .2 + breathe, 1 + (p.squash || 0) * .15);
  P.head.rotation.set(p.headX || 0, p.headY || 0, (p.headZ || 0) + Math.sin(t * 1.3 + (p.phase || 0)) * .03);
  P.body.rotation.set(p.bodyX || 0, 0, p.bodyZ || 0);
  const [al, ar] = [p.armL || [0, 0], p.armR || [0, 0]];
  P.arms[0].rotation.set(al[1], 0, -.35 - al[0]);
  P.arms[1].rotation.set(ar[1], 0, .35 + ar[0]);
  P.legs[0].rotation.x = p.legL || 0; P.legs[1].rotation.x = p.legR || 0;
  const wob = (p.earWobble || 0);
  P.ears.forEach((e, i) => {
    const s = i ? 1 : -1;
    if (c.kind === 'bunny') e.rotation.set(-.1 + Math.sin(t * 7 + i) * wob * .3 + (p.earBack || 0), 0, -s * (.2 + (p.earSpread || 0)) + Math.sin(t * 5 + i * 2) * wob * .15);
  });
  // ojos
  const blink = p.blink ?? 1;
  const eyeS = p.eyeBig || 1;
  P.eyes.forEach((e) => e.scale.set(eyeS, Math.max(.06, blink) * eyeS, 1));
  const [lx, ly] = p.look || [0, 0];
  P.irises.forEach((ig) => { ig.position.x = lx * .035; ig.position.y = ly * .04; });
  // cejas
  const sad = p.sad || 0, raise = p.raise || 0;
  P.brows.forEach((b, i) => {
    const s = i ? 1 : -1;
    b.position.y = .64 + raise * .07 + sad * .02;
    b.rotation.z = Math.PI / 2 - s * sad * .45 + s * (p.angry || 0) * .3;
  });
  // boca
  const m = p.mouth || 0;
  P.mouth.scale.set(.06 + m * .02 + (p.oMouth || 0) * .01, .012 + m * .075 + (p.oMouth || 0) * .07, .04);
  P.mouth.visible = m > .02 || (p.oMouth || 0) > .02;
  const smile = p.smile ?? 1; // 1 sonrisa, -1 tristeza
  P.smile.scale.set(1, -smile * (P.mouth.visible ? .6 : 1) + .0001, 1);
  P.smile.position.y = .14 + (smile < 0 ? -.04 : 0);
  P.blushMat.opacity = .35 + (p.blush || 0) * .5;
}

function blinkAt(t, seed) {
  const period = 3.1 + (seed % 3) * .7;
  const ph = ((t + seed * .37) % period) / period;
  const x = ph * period;
  return x < .13 ? Math.abs(Math.cos((x / .13) * Math.PI)) : 1;
}

// ------------------------------------------------------------------ estrella gigante
function starShape(Ro, Ri, round = .18) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const r = i % 2 ? Ri : Ro; const a = Math.PI / 2 + i * Math.PI / 5; pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0)); }
  const sh = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const rr = i % 2 ? round * .6 : round;
    const a = p1.clone().add(p0.clone().sub(p1).normalize().multiplyScalar(rr));
    const b = p1.clone().add(p2.clone().sub(p1).normalize().multiplyScalar(rr));
    if (i === 0) sh.moveTo(a.x, a.y); else sh.lineTo(a.x, a.y);
    sh.quadraticCurveTo(p1.x, p1.y, b.x, b.y);
  }
  sh.closePath();
  return sh;
}
export { clamp, lerp, sstep, easeInOut, easeOutBack, bounce, pulse, V, rand, SPH, SPHlo, phys, MAT, mesh, CAP, stick, makeCritter, poseCritter, blinkAt, starShape };
