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
// ------------------------------------------------------------------ estrella (episodio 1)
function makeStar() {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(starShape(1, .5, .2), { depth: .22, bevelEnabled: true, bevelThickness: .2, bevelSize: .14, bevelSegments: 10, curveSegments: 16 });
  geo.center(); geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffd84d', emissive: '#ffae00', emissiveIntensity: .4, roughness: .35, clearcoat: .8, clearcoatRoughness: .3, sheen: .5, sheenColor: new THREE.Color('#fff2b0') });
  const body = new THREE.Mesh(geo, mat); g.add(body);
  const front = .33;
  const P = { mat, eyes: [], brows: [], tears: [] };
  const face = new THREE.Group(); face.position.z = front; g.add(face); P.face = face;
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * .2, .1, 0); face.add(eg); P.eyes.push(eg);
    eg.add(mesh(SPH, MAT.pupil, [0, 0, 0], [.085, .12, .05]));
    eg.add(mesh(SPH, MAT.hl, [.03, .045, .04], .03));
    eg.add(mesh(SPH, MAT.hl, [-.025, -.04, .04], .015));
    const br = mesh(CAP, new THREE.MeshStandardMaterial({ color: '#b86b00' }), [s * .2, .3, .02], [.016, .05, .016], [0, 0, Math.PI / 2]);
    face.add(br); P.brows.push(br);
  }
  P.mouthArc = mesh(new THREE.TorusGeometry(.085, .016, 8, 28, Math.PI), MAT.mouth, [0, -.1, .02]);
  face.add(P.mouthArc);
  P.mouthO = mesh(SPH, MAT.mouth, [0, -.12, .01], [.06, .04, .03]); face.add(P.mouthO);
  const blush = new THREE.MeshBasicMaterial({ color: '#ff7aa8', transparent: true, opacity: .4, depthWrite: false });
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CircleGeometry(.07, 24), blush); b.position.set(s * .33, -.04, .02); face.add(b); }
  P.blush = blush;
  const tearMat = new THREE.MeshPhysicalMaterial({ color: '#8fd8ff', roughness: .05, transmission: .3, transparent: true, opacity: .9, emissive: '#3aa0ff', emissiveIntensity: .6 });
  for (let i = 0; i < 6; i++) { const tm = mesh(SPH, tearMat, [0, 0, 0], [.03, .042, .03]); face.add(tm); P.tears.push(tm); }
  return { g, P };
}
function poseStar(st, t, p) {
  const P = st.P;
  P.mat.emissiveIntensity = p.glow;
  P.eyes.forEach((e) => e.scale.set(1, Math.max(.08, p.blink), 1));
  const sad = p.sad;
  P.brows.forEach((b, i) => { const s = i ? 1 : -1; b.rotation.z = Math.PI / 2 - s * sad * .5; b.position.y = .3 + (1 - sad) * .02; });
  const happy = 1 - sad;
  P.mouthArc.scale.set(1 + happy * .3, lerp(1, -1.2, happy), 1);
  P.mouthArc.position.y = lerp(-.16, -.08, happy);
  P.mouthO.visible = p.mouth > .03;
  P.mouthO.scale.set(.05 + p.mouth * .02, .015 + p.mouth * .06, .03);
  P.mouthArc.visible = !P.mouthO.visible || happy > .5;
  P.blush.opacity = .3 + happy * .45;
  P.tears.forEach((tm, i) => {
    const s = i % 2 ? 1 : -1; const ph = ((t * .9 + i * .33) % 1);
    tm.visible = sad > .3;
    tm.position.set(s * (.25 + ph * .06), .02 - ph * .55, .03);
    tm.scale.setScalar(.03 * (0.6 + ph * .6) * sad);
    tm.scale.y *= 1.4;
  });
  st.g.rotation.z = Math.sin(t * .9) * .05 + (p.tilt || 0);
}


// ------------------------------------------------------------------ monstruo (episodio 2)
const PALETTE = ['#ff5fa2', '#ffb02e', '#7bdc4a', '#2fd0c9', '#a67bff', '#ff5b5b', '#ffd23f', '#5aa8ff'];
function makeMonster() {
  const R = rand(77);
  const g = new THREE.Group(); const P = { eyes: [], lids: [], arms: [], legs: [], tears: [] };
  const root = new THREE.Group(); g.add(root); P.root = root;
  const purple = phys('#8f4dff', { roughness: .85, sheen: 1, sheenRoughness: .4, sheenColor: new THREE.Color('#e3ccff') });
  const lilac = phys('#c7a6ff', { roughness: .8, sheen: .6, sheenColor: new THREE.Color('#ffffff') });
  P.purple = purple;
  // cuerpo arcoíris (transformación): colores por vértice en franjas
  const rbGeo = new THREE.SphereGeometry(1, 48, 32); const rc = [];
  const pa = rbGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); const c = new THREE.Color().setHSL(((y + 1) * .42 + Math.atan2(pa.getZ(i), pa.getX(i)) * .02) % 1, .85, .62); rc.push(c.r, c.g, c.b); }
  rbGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  const rbMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .6, sheen: 1, sheenColor: new THREE.Color('#ffffff'), clearcoat: .3 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * .22, .14, 0); root.add(leg); P.legs.push(leg);
    leg.add(mesh(SPH, lilac, [0, -.06, .07], [.15, .1, .21]));
  }
  const body = new THREE.Group(); root.add(body); P.body = body;
  P.bodyPurple = mesh(SPH, purple, [0, .58, 0], [.6, .55, .55]); body.add(P.bodyPurple);
  P.bodyRainbow = mesh(rbGeo, rbMat, [0, .58, 0], [.6, .55, .55]); P.bodyRainbow.visible = false; body.add(P.bodyRainbow);
  body.add(mesh(SPH, lilac, [0, .5, .3], [.38, .33, .3]));
  const spotM = phys('#6a2fd6', { roughness: .9 });
  P.spots = [];
  for (const [x, y, z, s] of [[.42, .8, .2, .07], [-.45, .7, .15, .06], [.3, .35, -.35, .08], [-.2, .95, -.3, .06], [.5, .45, -.1, .05], [-.48, .4, .05, .07]]) { const sp = mesh(SPH, spotM, [x, y, z], [s, s, s * .4]); sp.lookAt(V(x * 3, (y - .58) * 3 + .58, z * 3)); body.add(sp); P.spots.push(sp); }
  const dots = []; // lunares de colores (aparecen al transformarse)
  for (let i = 0; i < 14; i++) {
    const th = R() * 6.28, ph = .4 + R() * 2.2; const x = Math.sin(ph) * Math.cos(th) * .6, y = Math.cos(ph) * .55 + .58, z = Math.sin(ph) * Math.sin(th) * .55;
    const d = mesh(SPH, phys(PALETTE[i % 8], { roughness: .3, clearcoat: 1 }), [x, y, z], [.06, .06, .025]); d.lookAt(V(x * 3, (y - .58) * 3 + .58, z * 3)); d.visible = false; body.add(d); dots.push(d);
  }
  P.dots = dots;
  // cuernitos
  for (const s of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(.07, .22, 14), lilac, [s * .26, 1.12, -.02], 1, [0, 0, -s * .35]));
  // tres ojos
  for (const [x, y, z, r] of [[0, .9, .45, .155], [-.27, .8, .41, .12], [.27, .8, .41, .12]]) {
    const eg = new THREE.Group(); eg.position.set(x, y, z); eg.lookAt(V(x * 2.2, y + .05, 2)); body.add(eg);
    eg.add(mesh(SPH, MAT.sclera, [0, 0, 0], [r, r * 1.1, r * .7]));
    const ig = new THREE.Group(); ig.position.z = r * .45; eg.add(ig);
    ig.add(mesh(SPH, phys('#7dff4a', { roughness: .15, clearcoat: 1, emissive: '#2a8a00', emissiveIntensity: .3 }), [0, 0, 0], [r * .62, r * .66, r * .3]));
    ig.add(mesh(SPH, MAT.pupil, [0, 0, r * .18], [r * .34, r * .38, r * .2]));
    const h1 = new THREE.Mesh(SPH, MAT.hl); h1.position.set(r * .22, r * .26, r * .32); h1.scale.setScalar(r * .2); ig.add(h1);
    const lid = mesh(new THREE.SphereGeometry(1, 24, 12, 0, 6.29, 0, Math.PI / 2), purple, [0, 0, 0], [r * 1.06, r * 1.16, r * .76]);
    lid.rotation.x = -1.4; eg.add(lid);
    P.eyes.push({ eg, ig, lid, r });
  }
  // boca y dientes graciosos
  P.mouth = mesh(SPH, MAT.mouth, [0, .44, .5], [.22, .06, .07]); body.add(P.mouth);
  P.teeth = new THREE.Group(); body.add(P.teeth);
  const toothM = MAT.tooth;
  P.teeth.add(mesh(new RoundedBoxGeometry(.075, .1, .03, 2, .012), toothM, [-.055, .47, .55]));
  P.teeth.add(mesh(new RoundedBoxGeometry(.075, .1, .03, 2, .012), toothM, [.055, .47, .55]));
  P.teeth.add(mesh(new THREE.ConeGeometry(.025, .06, 8), toothM, [.13, .4, .54], 1, [Math.PI, 0, .3]));
  // brazos
  for (const s of [-1, 1]) {
    const ag = new THREE.Group(); ag.position.set(s * .52, .62, .05); body.add(ag); P.arms.push(ag);
    ag.add(mesh(CAP, purple, [0, -.15, 0], [.075, .1, .075]));
  }
  body.add(mesh(SPH, lilac, [0, .3, -.52], .1));
  // lágrimas
  const tearMat = new THREE.MeshPhysicalMaterial({ color: '#8fd8ff', roughness: .05, transparent: true, opacity: .9, emissive: '#3aa0ff', emissiveIntensity: .5 });
  for (let i = 0; i < 9; i++) { const tm = mesh(SPH, tearMat, [0, 0, 0], .03); body.add(tm); P.tears.push(tm); }
  // mochila gigante aspiradora
  const pack = new THREE.Group(); pack.position.set(0, .75, -.5); body.add(pack); P.pack = pack;
  const metal = phys('#5fc2c7', { roughness: .35, metalness: .4, clearcoat: .8 });
  pack.add(mesh(new RoundedBoxGeometry(1.0, 1.15, .65, 5, .18), metal, [0, .25, -.15]));
  pack.add(mesh(new RoundedBoxGeometry(.7, .3, .1, 3, .05), phys('#ffd23f', { roughness: .3, clearcoat: 1 }), [0, .02, .2]));
  for (const s of [-1, 1]) body.add(stick(V(s * .3, .98, .28), V(s * .32, 1.0, -.45), .04, phys('#ff7a3d')));
  const jarGlass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .25, roughness: .05, clearcoat: 1 });
  pack.add(mesh(new THREE.CylinderGeometry(.33, .33, .55, 28, 1, true), jarGlass, [0, 1.12, -.15]));
  pack.add(mesh(new THREE.TorusGeometry(.33, .04, 10, 28), metal, [0, 1.4, -.15], 1, [Math.PI / 2, 0, 0]));
  P.swirlMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFill: { value: .3 } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform float uTime,uFill; vec3 hue(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
      void main(){ float a=atan(vP.z,vP.x); float h=vP.y*1.5+a/6.2832+uTime*.4; if(vP.y>uFill-.25) discard; gl_FragColor=vec4(hue(h)*1.6,1.); }`,
  });
  P.swirl = mesh(new THREE.CylinderGeometry(.29, .29, .5, 28), P.swirlMat, [0, 1.12, -.15]); pack.add(P.swirl);
  const curve = new THREE.CatmullRomCurve3([V(.35, .7, -.1), V(.6, 1.05, .1), V(.6, .95, .55), V(.42, .7, .85)]);
  pack.add(mesh(new THREE.TubeGeometry(curve, 40, .06, 10), phys('#ff7a3d', { roughness: .5 })));
  P.funnel = new THREE.Group(); P.funnel.position.set(.42, .7, .85); pack.add(P.funnel);
  P.funnel.add(mesh(new THREE.CylinderGeometry(.2, .07, .3, 20, 1, true), phys('#ffd23f', { side: THREE.DoubleSide, roughness: .3, metalness: .3 }), [0, 0, .12], 1, [Math.PI / 2, 0, 0]));
  P.bulbs = [];
  for (let i = 0; i < 3; i++) { const b = mesh(SPH, new THREE.MeshStandardMaterial({ color: PALETTE[i * 2], emissive: PALETTE[i * 2], emissiveIntensity: 2 }), [-.25 + i * .25, .55, .19], .04); pack.add(b); P.bulbs.push(b); }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { g, P };
}
function poseMonster(mo, t, p) {
  const P = mo.P;
  const br = Math.sin(t * 2.6) * .02;
  P.root.scale.set(1 + (p.squash || 0) * .15, 1 - (p.squash || 0) * .2 + br, 1 + (p.squash || 0) * .15);
  P.body.rotation.set(p.bodyX || 0, p.bodyY || 0, p.bodyZ || 0);
  const [al, ar] = [p.armL || [0, 0], p.armR || [0, 0]];
  P.arms[0].rotation.set(al[1], 0, -.5 - al[0]); P.arms[1].rotation.set(ar[1], 0, .5 + ar[0]);
  P.legs[0].rotation.x = p.legL || 0; P.legs[1].rotation.x = p.legR || 0;
  const [lx, ly] = p.look || [0, 0];
  P.eyes.forEach((e, i) => {
    e.ig.position.x = lx * e.r * .25; e.ig.position.y = ly * e.r * .25;
    const bl = Math.min(p.blink ?? 1, i === 0 ? 1 : (p.blinkSide ?? 1));
    // párpado: baja con el parpadeo y con la tristeza (inclinado)
    e.lid.rotation.x = lerp(-1.75, -.05, 1 - bl) + (p.sad || 0) * .55;
    e.lid.rotation.z = (i === 1 ? -1 : i === 2 ? 1 : 0) * (p.sad || 0) * .5;
    e.eg.scale.setScalar(1 + (p.eyeBig || 0) * .25);
  });
  const m = Math.max(p.mouth || 0, p.oMouth || 0);
  P.mouth.scale.set(.2 + m * .03 - (p.sad || 0) * .04, .03 + m * .12, .07);
  P.mouth.position.y = .44 - (p.sad || 0) * .02;
  P.tears.forEach((tm, i) => {
    const e = P.eyes[i % 3]; const ph = ((t * 1.1 + i * .37) % 1);
    tm.visible = (p.cry || 0) > .2;
    const side = i % 3 === 0 ? (i % 2 ? .08 : -.08) : (i % 3 === 1 ? -.1 : .1);
    tm.position.set(e.eg.position.x + side, e.eg.position.y - e.r - ph * .5, e.eg.position.z + .08 - ph * .02);
    tm.scale.set(.028 * (p.cry || 0), .04 * (p.cry || 0), .028 * (p.cry || 0));
  });
}


export { clamp, lerp, sstep, easeInOut, easeOutBack, bounce, pulse, V, rand, SPH, SPHlo, phys, MAT, mesh, CAP, stick, makeCritter, poseCritter, blinkAt, starShape, makeStar, poseStar, makeMonster, poseMonster, PALETTE };
