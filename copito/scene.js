// "Copito y la Estrella" — cortometraje 3D procedural (Three.js)
// Render determinista: window.renderAt(t) dibuja el cuadro del segundo t.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const params = new URLSearchParams(location.search);
const W = +params.get('w') || 540, H = +params.get('h') || 960;
const TL = await (await fetch('build/timeline.json')).json();

// ------------------------------------------------------------------ utilidades
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
const R = rand(1234);
const mouthAt = (who, t) => { const a = TL.mouth[who]; const f = t * TL.fps; const i = Math.floor(f); const v0 = a[i] || 0, v1 = a[i + 1] || 0; return lerp(v0, v1, f - i); };

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 3000);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.5, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ materiales y geometrías base
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

// ------------------------------------------------------------------ cielo
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uSpace: { value: 0 }, uGlow: { value: 0 }, uTime: { value: 0 }, uPx: { value: H / 1920 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
  varying vec3 vDir; uniform float uSpace,uGlow,uTime,uPx;
  float hash(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
  void main(){
    vec3 d = normalize(vDir); float h = d.y;
    vec3 night = mix(vec3(.30,.17,.48), vec3(.03,.05,.20), smoothstep(-.05,.65,h));
    night += vec3(.55,.25,.45)*exp(-abs(h)*7.)*.55;
    float n = fbm(d*2.6 + vec3(0.,0.,uTime*.01));
    float n2 = fbm(d*5.0 + 7.3);
    vec3 space = vec3(.02,.025,.09) + vec3(.40,.10,.50)*smoothstep(.42,.78,n) + vec3(.05,.28,.55)*smoothstep(.5,.85,n2)*.8;
    space += vec3(.9,.4,.6)*smoothstep(.62,.9,n)*.35;
    vec3 col = mix(night, space, uSpace);
    vec3 glow = mix(vec3(.30,.14,.60), vec3(1.0,.55,.78), smoothstep(.3,.7,n)) + vec3(.2,.5,.9)*smoothstep(.55,.85,n2)*.6;
    col = mix(col, glow*.55, uGlow*.75);
    // estrellas procedurales
    vec3 sp = d*260.; vec3 cell = floor(sp); float r = hash(cell);
    vec3 off = vec3(hash(cell+1.3),hash(cell+2.7),hash(cell+5.1))-.5;
    float dist = length(fract(sp)-.5-off*.5);
    float thr = .9 - .06*uGlow - .03*uSpace;
    float st = step(thr, r)*smoothstep(.12,.0,dist);
    float tw = .55+.45*sin(uTime*(2.+r*4.) + r*80.);
    vec3 sc = mix(vec3(1.,.95,.8), vec3(.7,.85,1.), hash(cell+9.));
    col += sc*st*tw*(1.3+uGlow*2.5)*smoothstep(-.02,.12,h+uSpace);
    gl_FragColor = vec4(col,1.);
  }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), skyMat);
sky.renderOrder = -10; scene.add(sky);

// estrellas grandes con brillo
function makePoints(count, mk) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) mk(i, pos, col, size, seed);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  return geo;
}
const pointMat = (extra = '') => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPx: { value: H / 1920 }, uBright: { value: 1 }, uAlpha: { value: 1 } },
  vertexShader: `attribute float size; attribute float seed; attribute vec3 color; varying vec3 vC; varying float vTw;
    uniform float uTime,uPx,uBright;
    void main(){ vC=color; vTw = (.6+.4*sin(uTime*(2.+seed*3.)+seed*40.))*uBright;
      vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
      gl_PointSize = min(size*uPx*${extra ? '(300./-mv.z)' : '1.'}*(.7+.3*vTw), 34.*uPx); }`,
  fragmentShader: `varying vec3 vC; varying float vTw; uniform float uAlpha;
    void main(){ vec2 c = gl_PointCoord-.5; float d=length(c);
      float core = smoothstep(.5,.0,d); float cross = max(0.,1.-abs(c.x)*14.)*max(0.,1.-abs(c.y)*2.2)+max(0.,1.-abs(c.y)*14.)*max(0.,1.-abs(c.x)*2.2);
      float a = pow(core,2.5)+cross*.5*core;
      gl_FragColor = vec4(vC*a*vTw*1.6, a*uAlpha); }`,
});
const bigStarsMat = pointMat();
const bigStars = new THREE.Points(makePoints(700, (i, p, c, s, sd) => {
  const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
  const y = Math.abs(u) * .95 + .02;
  const rad = 1200;
  p.set([Math.cos(th) * rr * rad, (i < 450 ? y : u) * rad, Math.sin(th) * rr * rad], i * 3);
  const pal = [[1, .95, .8], [1, .85, .6], [.75, .85, 1], [1, .75, .9]][Math.floor(R() * 4)];
  c.set(pal, i * 3); s[i] = 6 + Math.pow(R(), 3) * 26; sd[i] = R();
}), bigStarsMat);
bigStars.frustumCulled = false; scene.add(bigStars);

// estrella fugaz
const shootMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uA: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv; uniform float uA; void main(){ float tail = pow(vUv.x,3.); float w = smoothstep(.5,0.,abs(vUv.y-.5))*tail; vec3 c = mix(vec3(.6,.8,1.),vec3(1.,.95,.8),vUv.x)*2.5; gl_FragColor=vec4(c*w*uA, w*uA);} `,
});
const shooting = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shootMat);
shooting.frustumCulled = false; scene.add(shooting);

// ------------------------------------------------------------------ jardín
const garden = new THREE.Group(); scene.add(garden);
{
  const gGeo = new THREE.CircleGeometry(90, 160, 0, Math.PI * 2);
  gGeo.rotateX(-Math.PI / 2);
  const pos = gGeo.attributes.position; const colors = [];
  const cA = new THREE.Color('#3fae4f'), cB = new THREE.Color('#2b8a45'), cC = new THREE.Color('#79c95a');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); const r = Math.hypot(x, z);
    const hgt = r > 9 ? (Math.sin(x * .08) * Math.cos(z * .07) * 2.5 + Math.sin(x * .21 + z * .13) * .8) * sstep(9, 30, r) + sstep(30, 90, r) * 6 : 0;
    pos.setY(i, hgt);
    const k = .5 + .5 * Math.sin(x * .7) * Math.cos(z * .6);
    const c = cA.clone().lerp(cB, k * .6).lerp(cC, clamp(hgt / 6) * .5); colors.push(c.r, c.g, c.b);
  }
  gGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; garden.add(ground);

  // césped (instanciado)
  const tuft = new THREE.ConeGeometry(.035, .22, 4); tuft.translate(0, .11, 0);
  const grass = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: '#4fc35a', roughness: .9 }), 4000);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 4000; i++) {
    const r = Math.sqrt(R()) * 12, a = R() * Math.PI * 2; const x = Math.cos(a) * r, z = Math.sin(a) * r - 1;
    e.set((R() - .5) * .5, R() * 3, (R() - .5) * .5); q.setFromEuler(e);
    m4.compose(V(x, 0, z), q, V(1, .6 + R() * .9, 1)); grass.setMatrixAt(i, m4);
    grass.setColorAt(i, new THREE.Color().setHSL(.3 + R() * .05, .55, .38 + R() * .15));
  }
  grass.receiveShadow = true; garden.add(grass);
  // flores
  const petalCols = ['#ff6fa8', '#ffd23f', '#ffffff', '#b38cff', '#ff8a5c', '#6fd3ff'];
  const flowerHead = new THREE.InstancedMesh(SPHlo, new THREE.MeshStandardMaterial({ roughness: .6, emissive: '#000' }), 160);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(.012, .012, 1, 5).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: '#2f8f3c' }), 160);
  for (let i = 0; i < 160; i++) {
    let x, z; do { x = (R() - .5) * 18; z = (R() - .5) * 14 - 2; } while (Math.hypot(x - .3, z + .4) < 2.6);
    const h = .25 + R() * .25;
    m4.compose(V(x, 0, z), q.identity(), V(1, h, 1)); stems.setMatrixAt(i, m4);
    m4.compose(V(x, h, z), q.identity(), V(.07, .055, .07)); flowerHead.setMatrixAt(i, m4);
    flowerHead.setColorAt(i, new THREE.Color(petalCols[i % petalCols.length]));
  }
  garden.add(stems, flowerHead);
  // casita
  const house = new THREE.Group(); house.position.set(-5.5, 0, -8.5); house.rotation.y = .45; garden.add(house);
  house.add(mesh(new RoundedBoxGeometry(4, 3, 3.4, 4, .12), phys('#fff1d6', { roughness: .9 }), [0, 1.5, 0]));
  const roof = mesh(new THREE.ConeGeometry(3.3, 2.0, 4), phys('#e8505b', { roughness: .7 }), [0, 4.0, 0], [1, 1, .9], [0, Math.PI / 4, 0]); house.add(roof);
  const winMat = new THREE.MeshStandardMaterial({ color: '#ffcf6e', emissive: '#ffb13b', emissiveIntensity: 2.2 });
  for (const x of [-1, 1]) house.add(mesh(new RoundedBoxGeometry(.8, .8, .1, 2, .05), winMat, [x * 1.0, 1.9, 1.71]));
  house.add(mesh(new RoundedBoxGeometry(.9, 1.5, .1, 2, .06), phys('#8c5a3c'), [0, .75, 1.71]));
  house.add(mesh(new RoundedBoxGeometry(.5, 1.1, .5, 2, .05), phys('#d0615a'), [1.2, 4.4, 0]));
  const wl = new THREE.PointLight('#ffb35a', 6, 9, 1.6); wl.position.set(0, 1.9, 2.5); house.add(wl);
  // árboles
  const treeMat = phys('#2e9d57', { roughness: .85, sheen: .4, sheenColor: new THREE.Color('#9be7a4') });
  for (const [x, z, s] of [[5.5, -6.5, 1.3], [8.5, -11, 1.6], [-10, -6, 1.4], [-3, -14, 1.7], [11, -4, 1.1]]) {
    const tr = new THREE.Group(); tr.position.set(x, 0, z); tr.scale.setScalar(s); garden.add(tr);
    tr.add(mesh(new THREE.CylinderGeometry(.18, .26, 2, 12), phys('#7a4a2a', { roughness: 1 }), [0, 1, 0]));
    for (const [a, b, c, r] of [[0, 2.5, 0, 1.1], [.7, 2.1, .2, .8], [-.7, 2.2, -.1, .85], [0, 3.2, .1, .8], [.2, 2.4, .7, .7]]) tr.add(mesh(SPH, treeMat, [a, b, c], r));
  }
  // valla
  const fenceMat = phys('#fff8ee', { roughness: .8 });
  for (let i = -14; i <= 14; i++) {
    const x = i * .7; const z = -10.5 + Math.sin(i * .3) * .3;
    garden.add(mesh(new RoundedBoxGeometry(.18, 1.1, .08, 2, .03), fenceMat, [x, .55, z]));
  }
  garden.add(mesh(new RoundedBoxGeometry(20, .1, .06, 2, .02), fenceMat, [0, .75, -10.4]));
  // guirnalda de luces
  const bulbCols = ['#ff5f7e', '#ffd23f', '#6fe3ff', '#9dff7a', '#c79bff'];
  const a0 = V(-3.4, 3.1, -6.6), a1 = V(5.1, 3.4, -5.5);
  for (let i = 0; i <= 22; i++) {
    const k = i / 22; const p = a0.clone().lerp(a1, k); p.y -= Math.sin(k * Math.PI) * 1.1;
    const bm = new THREE.MeshStandardMaterial({ color: bulbCols[i % 5], emissive: bulbCols[i % 5], emissiveIntensity: 3 });
    garden.add(mesh(SPH, bm, [p.x, p.y, p.z], .07));
  }
  // luna
  const moon = mesh(SPH, new THREE.MeshStandardMaterial({ color: '#fff4c9', emissive: '#ffe9a0', emissiveIntensity: 1.3 }), [-160, 170, -380], 22);
  moon.castShadow = false; garden.add(moon);
}

// luciérnagas
const fireflyMat = pointMat(true);
const fireflies = new THREE.Points(makePoints(60, (i, p, c, s, sd) => {
  p.set([(R() - .5) * 14, .3 + R() * 2.5, (R() - .5) * 10 - 2], i * 3); c.set([1, .85, .35], i * 3); s[i] = 3 + R() * 3; sd[i] = R();
}), fireflyMat);
const ffBase = fireflies.geometry.attributes.position.array.slice();
scene.add(fireflies);

// nubes
const clouds = new THREE.Group(); scene.add(clouds);
{
  const cm = new THREE.MeshStandardMaterial({ color: '#e9e6ff', roughness: 1, emissive: '#6a5aa8', emissiveIntensity: .35 });
  for (let i = 0; i < 26; i++) {
    const cg = new THREE.Group();
    const ang = R() * Math.PI * 2, rad = 5 + R() * 18;
    cg.position.set(1.7 + Math.cos(ang) * rad, 40 + R() * 90, -.8 + Math.sin(ang) * rad);
    const s = 1.5 + R() * 2.5; cg.scale.setScalar(s);
    for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(SPHlo, cm); m.position.set((R() - .5) * 2.4, (R() - .5) * .5, (R() - .5) * 1.2); m.scale.setScalar(.6 + R() * .6); cg.add(m); }
    clouds.add(cg);
  }
}

// ------------------------------------------------------------------ luces
const hemi = new THREE.HemisphereLight('#8fa8ff', '#2a5a3a', 1.0); scene.add(hemi);
const moonLight = new THREE.DirectionalLight('#c9d6ff', 2.2);
moonLight.position.set(-6, 10, 6); moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
Object.assign(moonLight.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .5, far: 40 });
moonLight.shadow.bias = -.0005; moonLight.shadow.radius = 4;
scene.add(moonLight, moonLight.target);
const rim = new THREE.DirectionalLight('#9fd0ff', 2.0); rim.position.set(3, 4, -8); scene.add(rim, rim.target);
const warmFill = new THREE.PointLight('#ffb36b', 4, 12, 1.5); scene.add(warmFill);
const starLight = new THREE.PointLight('#ffd46b', 0, 40, 1.2); scene.add(starLight);
const keySpace = new THREE.DirectionalLight('#ffffff', 0); scene.add(keySpace, keySpace.target);
const camFill = new THREE.PointLight('#fff1e0', 0, 30, 1.0); scene.add(camFill);

// ------------------------------------------------------------------ actores
const copito = makeCritter({ kind: 'bunny', fur: MAT.fur, inner: MAT.pink, iris: MAT.irisBlue, brow: MAT.browBunny, overall: true });
scene.add(copito.g);
const bear = makeCritter({ kind: 'bear', fur: MAT.bear, inner: MAT.bearTan, iris: MAT.irisBrown, brow: MAT.browBear, belly: MAT.bearTan, bowtie: true, eyeScale: .9 });
bear.g.scale.setScalar(.72); scene.add(bear.g);
const star = makeStar(); scene.add(star.g);
const SP = V(1.4, 206, -3); const SS = 3.0;
star.g.position.copy(SP); star.g.scale.setScalar(SS);

// cohete de cartón
const R0 = V(1.8, 0, -.9);
const rocket = new THREE.Group(); rocket.position.copy(R0); scene.add(rocket);
const pieces = [];
function piece(obj, t0) { rocket.add(obj); pieces.push({ obj, t0, y: obj.position.y, s: obj.scale.clone() }); return obj; }
{
  const base = new THREE.Group(); base.position.y = .6;
  base.add(mesh(new RoundedBoxGeometry(1.2, 1.0, 1.2, 4, .06), MAT.card));
  base.add(mesh(new RoundedBoxGeometry(.26, 1.02, 1.22, 2, .02), MAT.tape));
  const port = new THREE.Group(); port.position.set(.33, .05, .61);
  port.add(mesh(new THREE.TorusGeometry(.17, .04, 12, 32), phys('#d9dde6', { metalness: .9, roughness: .25 })));
  port.add(mesh(new THREE.CircleGeometry(.17, 32), new THREE.MeshStandardMaterial({ color: '#7fd4ff', emissive: '#3fb2ff', emissiveIntensity: .8 }), [0, 0, -.005]));
  base.add(port);
  piece(base, 6.9);
  const mid = new THREE.Group(); mid.position.y = 1.5; mid.rotation.y = .1;
  mid.add(mesh(new RoundedBoxGeometry(1.0, .85, 1.0, 4, .05), MAT.cardDark));
  const decal = new THREE.Mesh(new THREE.ShapeGeometry(starShape(.22, .1, .03)), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9d00', emissiveIntensity: .4 }));
  decal.position.set(0, 0, .505); mid.add(decal);
  piece(mid, 7.35);
  const cock = new THREE.Group(); cock.position.y = 2.15;
  for (let i = 0; i < 4; i++) {
    const w = mesh(new RoundedBoxGeometry(.92, .45, .06, 2, .02), MAT.card);
    const a = i * Math.PI / 2; w.position.set(Math.sin(a) * .43, 0, Math.cos(a) * .43); w.rotation.y = a; cock.add(w);
  }
  cock.add(mesh(new RoundedBoxGeometry(.92, .06, .92, 2, .02), MAT.card, [0, -.2, 0]));
  cock.add(mesh(new THREE.TorusGeometry(.5, .05, 10, 4), MAT.red, [0, .24, 0], [1, 1, 1], [Math.PI / 2, 0, Math.PI / 4]));
  piece(cock, 7.8);
  const finGeo = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(.55, -.15), new THREE.Vector2(.55, -.55), new THREE.Vector2(0, .7)]), { depth: .08, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 3 });
  finGeo.translate(0, 0, -.04);
  [['#ff4d5e', 0, 8.25], ['#3d8bff', Math.PI * 2 / 3, 8.5], ['#ffd23f', Math.PI * 4 / 3, 8.7]].forEach(([col, a, t0]) => {
    const f = new THREE.Group(); f.position.y = .55; f.rotation.y = a + Math.PI / 4;
    f.add(mesh(finGeo, phys(col, { roughness: .25, clearcoat: 1 }), [.6, 0, 0]));
    piece(f, t0);
  });
  // globos
  const bCols = ['#ff4d6d', '#ffd23f', '#4dc3ff', '#9b7bff', '#5ee07a'];
  const corners = [[.42, .42], [-.42, .42], [-.42, -.42], [.42, -.42], [0, -.45]];
  bCols.forEach((col, i) => {
    const bg = new THREE.Group(); const [cx, cz] = corners[i]; bg.position.set(cx, 2.35, cz);
    const top = V(cx * 1.2 + (i === 4 ? .3 : 0), 1.05 + (i % 3) * .25, cz * 1.2);
    bg.add(stick(V(0, 0, 0), top, .007, new THREE.MeshStandardMaterial({ color: '#d8d4e0', roughness: .8 })));
    const bm = phys(col, { roughness: .15, clearcoat: 1, sheen: .3 });
    bg.add(mesh(SPH, bm, [top.x, top.y + .3, top.z], [.26, .31, .26]));
    bg.add(mesh(new THREE.ConeGeometry(.04, .06, 10), bm, [top.x, top.y + .0, top.z]));
    bg.userData.balloon = i;
    piece(bg, [10.6, 10.95, 11.3, 11.3, 10.95][i]);
  });
  // molinete de juguete
  const pw = new THREE.Group(); pw.position.set(-.53, 1.6, .2);
  pw.add(stick(V(0, -.5, 0), V(0, .25, 0), .015, phys('#ffffff')));
  const wheel = new THREE.Group(); wheel.position.set(-.05, .28, 0); wheel.rotation.y = -Math.PI / 2; pw.add(wheel);
  ['#ff4d6d', '#ffd23f', '#4dc3ff', '#5ee07a'].forEach((c, i) => {
    const bl = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(.22, .05), new THREE.Vector2(.05, .22)])), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide }));
    bl.rotation.z = i * Math.PI / 2; wheel.add(bl);
  });
  pw.userData.wheel = wheel;
  piece(pw, 11.65);
  // patito de goma
  const duck = new THREE.Group(); duck.position.set(.35, 1.14, .38); duck.rotation.y = .6;
  const dm = phys('#ffd23f', { roughness: .2, clearcoat: 1 });
  duck.add(mesh(SPH, dm, [0, .07, 0], [.14, .1, .17]), mesh(SPH, dm, [0, .2, .08], .085), mesh(SPH, phys('#ff8c2a'), [0, .19, .17], [.05, .02, .05]));
  duck.add(mesh(SPH, MAT.pupil, [.045, .23, .14], .015), mesh(SPH, MAT.pupil, [-.045, .23, .14], .015));
  piece(duck, 12.0);
}
// llama mágica
const flame = new THREE.Group(); rocket.add(flame); flame.position.y = .05;
const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(.42, 1.6, 24, 1, true).rotateX(Math.PI).translate(0, -.8, 0), new THREE.MeshBasicMaterial({ color: '#ff7a2f', transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
const flameInner = new THREE.Mesh(new THREE.ConeGeometry(.24, 1.0, 20, 1, true).rotateX(Math.PI).translate(0, -.5, 0), new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
flame.add(flameOuter, flameInner);
const rocketLight = new THREE.PointLight('#ff9a4a', 0, 14, 1.4); rocketLight.position.y = -.5; rocket.add(rocketLight);

// humo (instanciado, determinista)
const SMOKE_N = 90;
const smoke = new THREE.InstancedMesh(SPHlo, new THREE.MeshStandardMaterial({ color: '#f4f0ff', roughness: 1, emissive: '#ffb27a', emissiveIntensity: .25, transparent: true, opacity: .92 }), SMOKE_N);
smoke.frustumCulled = false; scene.add(smoke);
const smokeSeeds = Array.from({ length: SMOKE_N }, () => [R(), R(), R(), R()]);

// chispas / magia (CPU, deterministas)
const SPARK_N = 2500;
const sparkGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(SPARK_N * 3), sCol = new Float32Array(SPARK_N * 3), sSize = new Float32Array(SPARK_N), sSeed = new Float32Array(SPARK_N);
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
sparkGeo.setAttribute('size', new THREE.BufferAttribute(sSize, 1));
sparkGeo.setAttribute('seed', new THREE.BufferAttribute(sSeed, 1));
const sparkMat = pointMat(true);
const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);
const sparkRnd = Array.from({ length: 4000 }, () => [R(), R(), R(), R(), R()]);
const RAINBOW = [[1, .35, .5], [1, .8, .25], [.4, .85, 1], [.6, 1, .5], [.8, .55, 1], [1, 1, 1]];

// corazones
const heartShape = new THREE.Shape();
heartShape.moveTo(0, -.5); heartShape.bezierCurveTo(-.1, -.35, -.55, -.1, -.55, .2); heartShape.bezierCurveTo(-.55, .45, -.25, .55, 0, .3);
heartShape.bezierCurveTo(.25, .55, .55, .45, .55, .2); heartShape.bezierCurveTo(.55, -.1, .1, -.35, 0, -.5);
const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: .15, bevelEnabled: true, bevelThickness: .08, bevelSize: .06, bevelSegments: 4 }); heartGeo.center();
const hearts = [];
for (let i = 0; i < 12; i++) {
  const hm = new THREE.MeshPhysicalMaterial({ color: i % 3 ? '#ff5d8f' : '#ff9ec0', emissive: '#ff2f6e', emissiveIntensity: .5, roughness: .25, clearcoat: 1, transparent: true });
  const h = new THREE.Mesh(heartGeo, hm); h.userData = { r: [R(), R(), R()] }; scene.add(h); hearts.push(h);
}
// anillos de luz del final
const ringMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uA: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv; uniform float uA; void main(){ float d=length(vUv-.5)*2.; float r = smoothstep(.75,.92,d)*smoothstep(1.,.92,d); vec3 c = mix(vec3(1.,.85,.4), vec3(1.,.5,.8), d); gl_FragColor=vec4(c*r*uA*2., r*uA);} `,
});
const rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat.clone()); m.frustumCulled = false; scene.add(m); return m; });
// halo de la estrella
const haloMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uA: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv; uniform float uA,uTime; void main(){ vec2 c=vUv-.5; float d=length(c)*2.; float a=atan(c.y,c.x);
    float rays = pow(.5+.5*sin(a*12.+uTime*.6),6.)*.6 + pow(.5+.5*sin(a*7.-uTime*.4),8.)*.4;
    float g = exp(-d*3.2) + rays*smoothstep(1.,.15,d)*.5; gl_FragColor=vec4(vec3(1.,.82,.45)*g*uA, g*uA);} `,
});
const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat); halo.frustumCulled = false; scene.add(halo);

// ------------------------------------------------------------------ HUD (subtítulos y título)
const hudCanvas = document.createElement('canvas'); hudCanvas.width = W; hudCanvas.height = H;
const hctx = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas); hudTex.colorSpace = THREE.SRGBColorSpace;
const hudScene = new THREE.Scene(); const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
hudScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, toneMapped: false })));
let hudKey = '';
function wrap(text, maxW) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const w of words) { const tst = cur ? cur + ' ' + w : w; if (hctx.measureText(tst).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tst; }
  if (cur) lines.push(cur); return lines;
}
function drawStarPath(cx, cy, r) {
  hctx.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .48 : r; const a = -Math.PI / 2 + i * Math.PI / 5; hctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  hctx.closePath();
}
function drawHUD(t) {
  const u = H / 1920;
  const line = TL.lines.find((l) => t >= l.start - .1 && t <= l.end + .25);
  const subA = line ? sstep(line.start - .1, line.start + .1, t) * (1 - sstep(line.end + .05, line.end + .25, t)) : 0;
  const titleA = sstep(33.95, 34.35, t);
  const key = `${line ? line.id : ''}|${subA.toFixed(2)}|${titleA.toFixed(2)}`;
  if (key === hudKey) return; hudKey = key;
  hctx.clearRect(0, 0, W, H);
  if (line && subA > 0) {
    hctx.save(); hctx.globalAlpha = subA;
    hctx.font = `700 ${Math.round(64 * u)}px Fredoka`; hctx.textAlign = 'center'; hctx.textBaseline = 'middle';
    const lines = wrap(line.text.replace('Snif... ', '*snif* '), W * .82);
    const lh = 80 * u; const y0 = H * .80 - (lines.length - 1) * lh / 2;
    const col = { copito: '#ffffff', bear: '#ffe2b8', star: '#fff2a0' }[line.who];
    lines.forEach((l, i) => {
      const y = y0 + i * lh;
      hctx.lineJoin = 'round'; hctx.lineWidth = 14 * u; hctx.strokeStyle = 'rgba(30,20,70,.85)'; hctx.strokeText(l, W / 2, y);
      hctx.fillStyle = col; hctx.fillText(l, W / 2, y);
    });
    hctx.restore();
  }
  if (titleA > 0) {
    hctx.save(); hctx.globalAlpha = titleA; hctx.textAlign = 'center'; hctx.textBaseline = 'middle';
    const s = .85 + .15 * easeOutBack(clamp((t - 33.95) / .4));
    hctx.translate(W / 2, H * .2); hctx.scale(s, s);
    hctx.font = `700 ${Math.round(120 * u)}px Fredoka`;
    hctx.lineJoin = 'round'; hctx.lineWidth = 22 * u; hctx.strokeStyle = '#2a1a6e';
    hctx.strokeText('Copito', 0, -70 * u); hctx.fillStyle = '#ffffff'; hctx.fillText('Copito', 0, -70 * u);
    hctx.font = `700 ${Math.round(72 * u)}px Fredoka`;
    hctx.strokeText('y la Estrella', 0, 40 * u); hctx.fillStyle = '#ffd84d'; hctx.fillText('y la Estrella', 0, 40 * u);
    for (const sx of [-1, 1]) { drawStarPath(sx * 300 * u, -70 * u, 34 * u); hctx.fillStyle = '#ffd84d'; hctx.lineWidth = 8 * u; hctx.stroke(); hctx.fill(); }
    hctx.restore();
  }
  hudTex.needsUpdate = true;
}

// ------------------------------------------------------------------ trayectorias
const T_LIFT = 15.2;
function rocketY(t) {
  if (t < T_LIFT) return 0;
  const x = t - T_LIFT;
  if (t < 18.9) return 1.2 * x * x + 2.5 * x * x * x + 3 * x * x * x * x * .5;
  return null;
}
const RH = SP.clone().add(V(-4.2, -3.4, 2.0)); // posición de llegada junto a la estrella
function rocketPos(t) {
  if (t < T_LIFT) return R0.clone();
  if (t < 18.9) { const y = Math.min(rocketY(t), 250); const p = R0.clone(); p.y += y; return p; }
  // tramo final: frena junto a la estrella
  const k = easeInOut(clamp((t - 18.9) / 1.6));
  const from = R0.clone(); from.y = RH.y - 30;
  const p = from.lerp(RH, 1 - Math.pow(1 - k, 3));
  p.y += Math.sin(t * 1.6) * .12 * k;
  return p;
}
const COCKPIT = V(0, 2.05, 0);
const HUG = SP.clone().add(V(2.0, -2.15, 1.35));

// ------------------------------------------------------------------ cámara
const shots = [
  [0.0, 2.7, () => ({ a: [V(.25, 1.0, 4.2), V(0, 1.65, 0), 40], b: [V(.1, 1.1, 3.4), V(0, 1.75, 0), 38] })],
  [2.7, 6.5, () => ({ a: [V(1.5, .6, 3.6), V(0, 2.4, -1), 46], b: [V(1.0, .8, 2.6), V(1.3, 60, -2.2), 50] })],
  [6.5, 9.0, () => ({ a: [V(.3, 3.0, 11.8), V(.3, 1.3, -.6), 40], b: [V(.2, 2.6, 10.4), V(.3, 1.3, -.6), 40] })],
  [9.0, 11.0, () => ({ a: [V(.1, .95, 3.2), V(-1.5, .7, .3), 38], b: [V(-.2, .9, 2.8), V(-1.5, .72, .3), 38] })],
  [11.0, 13.0, () => ({ a: [V(1.0, 2.4, 6.8), V(1.7, 2.2, -.9), 40], b: [V(1.4, 2.8, 6.0), V(1.8, 2.7, -.9), 40] })],
  [13.0, 15.2, () => ({ a: [V(2.2, 3.7, 3.8), V(1.8, 3.35, -.9), 38], b: [V(2.0, 3.6, 3.1), V(1.8, 3.4, -.9), 38] })],
  [15.2, 16.9, (t) => ({ a: [V(-.8, .4, 6.0), rocketPos(t).add(V(0, 1.8, 0)), 52], b: [V(-.6, .45, 5.6), rocketPos(t).add(V(0, 1.8, 0)), 54] })],
  [16.9, 18.9, (t) => { const r = rocketPos(t); return { a: [r.clone().add(V(4.6, -1.6, 6.6)), r.clone().add(V(0, 1.8, 0)), 44], b: [r.clone().add(V(4.0, -.9, 5.6)), r.clone().add(V(0, 2.0, 0)), 44] }; }],
  [18.9, 21.6, () => ({ a: [SP.clone().add(V(-1.2, -2.2, 23)), SP.clone().add(V(-1.0, -1.2, 0)), 42], b: [SP.clone().add(V(-.6, -1.6, 19)), SP.clone().add(V(-.8, -1.0, 0)), 42] })],
  [21.6, 24.3, () => ({ a: [SP.clone().add(V(.5, .2, 8.6)), SP.clone().add(V(0, -.2, 0)), 40], b: [SP.clone().add(V(1.4, -.5, 10.5)), SP.clone().add(V(.6, -.8, 0)), 42] })],
  [24.3, 27.0, () => ({ a: [SP.clone().add(V(-1.6, -.9, 12.0)), SP.clone().add(V(1.0, -.9, 0)), 40], b: [SP.clone().add(V(-1.2, -1.1, 10.4)), SP.clone().add(V(1.2, -1.0, 0)), 40] })],
  [27.0, 29.3, () => ({ a: [SP.clone().add(V(1.2, .1, 9.0)), SP.clone().add(V(.5, -.5, 0)), 40], b: [SP.clone().add(V(.9, -.1, 10.2)), SP.clone().add(V(.5, -.6, 0)), 40] })],
  [29.3, 32.2, () => ({ a: [SP.clone().add(V(1.2, -.8, 11)), SP.clone().add(V(.8, -.8, 0)), 42], b: [SP.clone().add(V(.8, -1.2, 25)), SP.clone().add(V(.4, -.6, 0)), 44] })],
  [32.2, 35.01, () => ({ a: [HUG.clone().add(V(.2, 1.15, 4.6)), HUG.clone().add(V(-.1, 1.2, 0)), 40], b: [HUG.clone().add(V(.2, 1.5, 6.6)), HUG.clone().add(V(-.5, 1.9, 0)), 42] })],
];
function cameraAt(t) {
  const s = shots.find(([a, b]) => t >= a && t < b) || shots[shots.length - 1];
  const [a, b, f] = s; const k = easeInOut(clamp((t - a) / (b - a)));
  const { a: A, b: B } = f(t);
  const pos = A[0].clone().lerp(B[0], k), look = A[1].clone().lerp(B[1], k), fov = lerp(A[2], B[2], k);
  // movimiento de cámara en mano suave
  pos.x += Math.sin(t * .7) * .03; pos.y += Math.sin(t * .9 + 1) * .025;
  return { pos, look, fov };
}

// ------------------------------------------------------------------ animación por cuadro
function update(t) {
  // --------- cámara
  const cam = cameraAt(t);
  let shake = 0;
  if (t > 14.4 && t < 18.9) shake = sstep(14.4, 15.2, t) * (1 - sstep(17.5, 18.9, t)) * .05;
  cam.pos.x += Math.sin(t * 61) * shake; cam.pos.y += Math.sin(t * 47 + 2) * shake;
  camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.fov = cam.fov; camera.updateProjectionMatrix();
  sky.position.copy(camera.position); bigStars.position.copy(camera.position);

  // --------- entorno
  const space = sstep(30, 150, camera.position.y);
  const glow = sstep(28.8, 31.0, t);
  skyMat.uniforms.uSpace.value = space; skyMat.uniforms.uGlow.value = glow; skyMat.uniforms.uTime.value = t;
  bigStarsMat.uniforms.uTime.value = t; bigStarsMat.uniforms.uBright.value = 1 + glow * .6 + space * .2;
  fireflyMat.uniforms.uTime.value = t; sparkMat.uniforms.uTime.value = t;
  garden.visible = camera.position.y < 160; fireflies.visible = garden.visible;
  clouds.visible = camera.position.y > 15 && camera.position.y < 170;
  hemi.intensity = lerp(1.0, .55, space); moonLight.intensity = lerp(2.2, 0, space);
  rim.intensity = lerp(2.0, 1.4, space);
  rim.position.copy(camera.position).add(V(3, 5, -10)); rim.target.position.copy(camera.position).add(V(0, 0, 0));
  if (space > .5) { rim.position.copy(SP).add(V(-4, 6, -8)); rim.target.position.copy(SP); }
  moonLight.target.position.set(0, 0, -1);
  warmFill.position.set(1.5, 2.5, 3.5); warmFill.intensity = lerp(5, 0, space);
  bloom.strength = lerp(.6, .5, space) + glow * .15;
  bloom.threshold = lerp(.95, 1.0, space) + glow * .25;

  // estrella fugaz (apertura y cierre)
  const shootK = (t0, from, to, dur) => {
    const k = (t - t0) / dur; if (k < 0 || k > 1) return false;
    const p = from.clone().lerp(to, easeInOut(k));
    shooting.position.copy(p); shooting.lookAt(camera.position);
    const dir = to.clone().sub(from).normalize();
    // orientar la estela según la dirección en pantalla
    const a = p.clone().project(camera), b = p.clone().add(dir).project(camera);
    shooting.rotateZ(Math.atan2((b.y - a.y) * H, (b.x - a.x) * W));
    const dist = p.distanceTo(camera.position);
    shooting.scale.set(dist * .22, dist * .006, 1);
    shootMat.uniforms.uA.value = Math.sin(k * Math.PI);
    return true;
  };
  if (!shootK(0.05, camera.position.clone().add(V(-9, 18, -16)), camera.position.clone().add(V(8, 13, -18)), 1.2) &&
      !shootK(34.0, camera.position.clone().add(V(-12, 14, -24)), camera.position.clone().add(V(12, 6, -24)), 1.0)) shootMat.uniforms.uA.value = 0;

  // luciérnagas
  const fp = fireflies.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    fp.array[i * 3] = ffBase[i * 3] + Math.sin(t * .6 + i) * .4;
    fp.array[i * 3 + 1] = ffBase[i * 3 + 1] + Math.sin(t * .9 + i * 2.1) * .25;
    fp.array[i * 3 + 2] = ffBase[i * 3 + 2] + Math.cos(t * .5 + i * 1.3) * .4;
  }
  fp.needsUpdate = true;

  // --------- cohete: piezas
  for (const pc of pieces) {
    const k = (t - pc.t0) / .5;
    pc.obj.visible = k >= 0;
    if (k >= 0) {
      const b = bounce(clamp(k));
      pc.obj.position.y = pc.y + (1 - b) * 3.5;
      const sq = k > .35 && k < 1.2 ? Math.sin((k - .35) * 9) * Math.exp(-(k - .35) * 3) * .12 : 0;
      pc.obj.scale.set(pc.s.x * (1 + sq), pc.s.y * (1 - sq), pc.s.z * (1 + sq));
    }
    if (pc.obj.userData.balloon !== undefined) { const i = pc.obj.userData.balloon; pc.obj.rotation.set(Math.sin(t * 1.7 + i) * .08, 0, Math.cos(t * 1.3 + i * 2) * .1 - (t > T_LIFT ? sstep(T_LIFT, 16, t) * .25 * (pc.obj.position.x > 0 ? -1 : 1) : 0)); }
    if (pc.obj.userData.wheel) pc.obj.userData.wheel.rotation.z = t * (t > T_LIFT ? 25 : 3);
  }
  const rp = rocketPos(t); rocket.position.copy(rp);
  const rshake = (t > 14.4 && t < 19.5) ? .025 * sstep(14.4, 15.2, t) : 0;
  rocket.rotation.set(Math.sin(t * 53) * rshake, 0, Math.sin(t * 41) * rshake + (t > 18.9 ? Math.sin(t * 1.3) * .05 : 0));
  const fl = (t > 14.8 && t < 19.8) ? sstep(14.8, 15.3, t) * (1 - sstep(19.0, 19.8, t)) : 0;
  flame.visible = fl > 0.01;
  flame.scale.set(fl * (1 + Math.sin(t * 40) * .1), fl * (1 + Math.sin(t * 33) * .25 + sstep(15.2, 16, t) * .6), fl);
  rocketLight.intensity = fl * 25;

  // humo
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < SMOKE_N; i++) {
    const [a, b, c, d] = smokeSeeds[i];
    const tb = 14.6 + (i / SMOKE_N) * 2.2; const age = t - tb;
    if (age < 0 || age > 3.2) { m4.makeScale(0, 0, 0); smoke.setMatrixAt(i, m4); continue; }
    const ang = a * Math.PI * 2; const sp = .5 + b * .8;
    const base = rocketPos(Math.min(tb, 15.6));
    const p = V(base.x + Math.cos(ang) * sp * Math.sqrt(age) * 1.2, .15 + c * .3 + age * .25, base.z + Math.sin(ang) * sp * Math.sqrt(age) * 1.2);
    if (tb > 15.6) p.y = rocketPos(tb).y - age * 1.5;
    const s = (.2 + d * .22) * (1 + age * .8) * (1 - sstep(2.3, 3.2, age));
    m4.compose(p, q, V(s, s * .85, s)); smoke.setMatrixAt(i, m4);
  }
  smoke.instanceMatrix.needsUpdate = true;

  // --------- chispas
  let n = 0;
  const emit = (p, col, size) => { if (n >= SPARK_N) return; sPos.set([p.x, p.y, p.z], n * 3); sCol.set(col, n * 3); sSize[n] = size; sSeed[n] = (n * .618) % 1; n++; };
  // estela mágica del cohete
  if (t > 15.0 && t < 20.0) {
    for (let i = 0; i < 900; i++) {
      const tb = 15.0 + i * .005; const age = t - tb; if (age < 0 || age > 1.6) continue;
      const r = sparkRnd[i]; const p = rocketPos(tb);
      p.x += (r[0] - .5) * .6 + (r[3] - .5) * age * 1.6; p.z += (r[1] - .5) * .6 + (r[4] - .5) * age * 1.6; p.y += -age * 1.2 - .1;
      emit(p, RAINBOW[i % 6], (5 + r[2] * 9) * (1 - age / 1.6));
    }
  }
  // brillo en el jardín (escena 1)
  if (t < 6.6) {
    for (let i = 0; i < 80; i++) {
      const r = sparkRnd[1000 + i]; const ph = (t * .25 + r[0]) % 1;
      emit(V(-3 + r[1] * 7, .2 + ph * 3.5, -3 + r[2] * 5), RAINBOW[i % 6], 3 + r[3] * 3 * Math.sin(ph * Math.PI));
    }
  }
  // polvo de estrellas alrededor de la estrella (más intenso al final)
  if (t > 18.5) {
    const amount = Math.floor(lerp(120, 700, glow));
    for (let i = 0; i < amount; i++) {
      const r = sparkRnd[1200 + i]; const a = r[0] * Math.PI * 2 + t * (.1 + r[1] * .2); const rad = 3.5 + r[2] * (6 + glow * 10);
      const p = SP.clone().add(V(Math.cos(a) * rad, Math.sin(a * 1.3) * rad * .6 + (r[3] - .5) * 3, (r[4] - .5) * 6 - 2));
      emit(p, glow > .3 ? RAINBOW[i % 6] : [1, .9, .6], (3 + r[3] * 5) * (.6 + glow * .5));
    }
  }
  // destello del abrazo
  if (t > 26.8 && t < 29) {
    for (let i = 0; i < 160; i++) {
      const r = sparkRnd[2000 + i]; const age = t - 26.8; const a = r[0] * Math.PI * 2, e = (r[1] - .5) * Math.PI;
      const sp = (1 + r[2] * 2.5) * age;
      const p = HUG.clone().add(V(-.4, 1.2, .2)).add(V(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp));
      emit(p, RAINBOW[i % 6], (6 + r[3] * 8) * (1 - sstep(.8, 2.2, age)));
    }
  }
  sparkGeo.setDrawRange(0, n);
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true; sparkGeo.attributes.size.needsUpdate = true; sparkGeo.attributes.seed.needsUpdate = true;

  // --------- Copito
  const cp = copito.g; let pose = { phase: 0, blink: blinkAt(t, 1), mouth: mouthAt('copito', t) * 1.1, smile: 1, earWobble: .2 };
  if (t < 6.5) {
    // mirando las estrellas
    cp.position.set(0, 0, 0); cp.rotation.set(0, 0, 0);
    const reach = sstep(1.1, 1.7, t) * (1 - sstep(5.6, 6.3, t));
    const hop1 = Math.max(0, Math.sin(clamp((t - 3.1) / .5) * Math.PI)), hop2 = Math.max(0, Math.sin(clamp((t - 4.4) / .5) * Math.PI));
    const hop = hop1 + hop2;
    cp.position.y = hop * .35;
    Object.assign(pose, {
      headX: -.55 + reach * .1, look: [0, 1], eyeBig: 1 + reach * .08 + sstep(.0, .6, t) * .04,
      armR: [lerp(.1, 2.5, reach) + Math.sin(t * 6) * .08 * reach, -reach * .4], armL: [.15 + hop * 1.2, 0],
      squash: -hop * .4 + (pulse(t, 3.0, 3.15, .05) + pulse(t, 4.3, 4.45, .05)) * .5, smile: 1, earWobble: .4 + hop, blush: reach * .6,
    });
  } else if (t < 12.3) {
    // construyendo: salta alrededor del cohete
    const k = (t - 6.5);
    const x = lerp(-.2, .55, sstep(6.5, 7.5, t)); const z = .4;
    const hop = Math.abs(Math.sin(k * 4.2)) * .22;
    cp.position.set(x, hop, z); cp.rotation.set(0, lerp(0, .7, sstep(6.5, 7.2, t)) + Math.sin(k * 1.3) * .2, 0);
    const cheer = pulse(t, 8.8, 9.6, .2) + pulse(t, 11.0, 12.0, .2);
    Object.assign(pose, {
      headX: -.1, headY: Math.sin(k * 1.1) * .2, look: [.3, .2], armL: [.4 + Math.abs(Math.sin(k * 4.2)) * .8 + cheer * 1.8, -.3], armR: [.4 + Math.abs(Math.cos(k * 4.2)) * .8 + cheer * 1.8, -.3],
      squash: -hop * .5, earWobble: 1, smile: 1, oMouth: cheer * .4, blush: .5,
    });
    if (t > 9.0 && t < 11.0) { cp.rotation.y = -.5; pose.look = [-1, 0]; }
  } else if (t < 13.0) {
    // salta a la cabina
    const k = easeInOut(clamp((t - 12.3) / .6));
    const from = V(.55, 0, .4), to = rocketPos(t).add(COCKPIT);
    const p = from.clone().lerp(to, k); p.y += Math.sin(k * Math.PI) * 1.3;
    cp.position.copy(p); cp.rotation.set(0, lerp(.7, .15, k), 0);
    Object.assign(pose, { armL: [2.4 * Math.sin(k * Math.PI), 0], armR: [2.4 * Math.sin(k * Math.PI), 0], earWobble: 1.5, oMouth: Math.sin(k * Math.PI) * .6, squash: -Math.sin(k * Math.PI) * .3 });
  } else if (t < 23.2) {
    // dentro del cohete
    const p = rocketPos(t).add(COCKPIT); cp.position.copy(p); cp.rotation.set(rocket.rotation.x, .15, rocket.rotation.z);
    const lift = sstep(15.2, 15.8, t);
    Object.assign(pose, {
      armL: [.6 + lift * 1.9, -.4], armR: [2.6 - lift * .3 + Math.sin(t * 9) * .15 * (1 - lift), 0], headX: lerp(0, -.25, lift), earWobble: 1 + lift * 2, earBack: lift * .8,
      smile: 1, oMouth: pulse(t, 15.2, 17.5, .3) * .5, look: [0, lift * .5],
    });
    if (t > 18.9) {
      // ve a la estrella triste
      const concern = sstep(19.6, 20.4, t);
      cp.rotation.y = lerp(.15, .9, concern);
      Object.assign(pose, { armL: [.3, -.3], armR: [.3, -.3], headX: -.25, sad: concern * .9, smile: lerp(1, -.4, concern), look: [.3, .9], earBack: 0, earWobble: .2, earSpread: concern * .5 });
    }
  } else if (t < 24.3) {
    // vuela hacia la estrella
    const k = easeInOut(clamp((t - 23.2) / 1.1));
    const from = rocketPos(23.2).add(COCKPIT); const p = from.lerp(HUG, k); p.y += Math.sin(k * Math.PI) * .9;
    cp.position.copy(p); cp.rotation.set(0, lerp(.9, -Math.PI / 2 + .6, k), Math.sin(k * Math.PI) * .2);
    Object.assign(pose, { armL: [1.4 + k, -.6], armR: [1.4 + k, -.6], legL: .4, legR: -.3, sad: .5 * (1 - k), smile: .5, earWobble: 1.5, earBack: .6, look: [.5, .3] });
  } else {
    // abrazo y final
    cp.position.copy(HUG); cp.position.y += Math.sin(t * 1.4) * .04;
    const turn = sstep(32.0, 33.0, t);
    cp.rotation.set(0, lerp(-Math.PI / 2 + .6, -.45, turn), 0);
    const hugArms = 1 - turn * .5;
    const wave = sstep(32.6, 33.0, t);
    Object.assign(pose, {
      armL: [lerp(2.0, 2.2, turn) * hugArms + .2, -1.25 * hugArms], armR: [lerp(2.0, 2.6, wave), lerp(-1.25, 0, wave)],
      headX: -.08, headZ: .12, headY: lerp(.35, .2, turn), smile: 1, blush: .6 + glow * .4,
      look: [turn > .5 ? 0 : -.6, .2], earWobble: .4, legL: .25, legR: -.2, eyeBig: 1 + glow * .05,
    });
    if (wave > 0) pose.armR[0] += Math.sin(t * 10) * .25 * wave;
    if (t > 26.6 && t < 27.4) pose.blink = Math.min(pose.blink, 1 - pulse(t, 26.7, 27.3, .15) * .85); // ojos cerrados de cariño
  }
  poseCritter(copito, t, pose);

  // --------- Osito
  {
    const bg = bear.g; bg.position.set(-1.5, 0, .3); bg.rotation.set(0, .55, 0);
    const surprise = sstep(8.85, 9.05, t) * (1 - sstep(11.2, 11.8, t));
    const jump = Math.max(0, Math.sin(clamp((t - 8.95) / .45) * Math.PI));
    bg.position.y = jump * .45;
    let bp = { phase: 2, blink: surprise > .5 ? 1 : blinkAt(t, 2), mouth: mouthAt('bear', t) * 1.2, smile: 1, eyeBig: 1 + surprise * .28, raise: surprise, oMouth: surprise * (1 - sstep(9.1, 9.3, t)) * .8, squash: -jump * .4, look: [.7, .1] };
    bp.armL = [.2 + surprise * 2.3 + jump, 0]; bp.armR = [.2 + surprise * 2.3 + jump, 0];
    if (t > T_LIFT) { const wv = sstep(15.4, 15.8, t); bp.armR = [2.6, 0]; bp.armR[0] += Math.sin(t * 9) * .3 * wv; bp.headX = -.6 * sstep(15.2, 16, t); bp.look = [.3, 1]; bp.smile = 1; bp.oMouth = .5 * wv; }
    poseCritter(bear, t, bp);
  }

  // --------- Estrella
  {
    const happy = sstep(26.4, 27.6, t);
    const sad = (1 - happy);
    const glowV = lerp(.35, .6, happy) + glow * .4 - sstep(31.8, 32.6, t) * .45;
    poseStar(star, t, { glow: glowV, blink: blinkAt(t, 3) * (sad > .5 ? .8 : 1), sad, mouth: mouthAt('star', t), tilt: sad * .06 - happy * .04 });
    // la estrella se encoge un poco al llorar (sollozos)
    const sob = sad * Math.max(0, Math.sin(t * 7)) * .02;
    star.g.scale.set(SS * (1 + sob), SS * (1 - sob), SS);
    starLight.position.copy(SP).add(V(0, 0, 3)); starLight.intensity = (space > .3 ? 5 : 0) * (.7 + happy * .3 + glow * .3);
    keySpace.intensity = space * .9;
    camFill.position.copy(camera.position).add(V(-.5, 1, 0)); camFill.intensity = space * 2.5; keySpace.position.copy(SP).add(V(6, 4, 10)); keySpace.target.position.copy(SP);
    halo.position.copy(SP).add(V(0, 0, -.6)); halo.lookAt(camera.position);
    const hs = SS * (2.4 + glow * 4 + Math.sin(t * 2) * .1) * (1 + (1 - space) * 3); halo.scale.set(hs, hs, 1);
    haloMat.uniforms.uA.value = .12 + happy * .12 + glow * .45 + (1 - space) * .9; haloMat.uniforms.uTime.value = t;
    // anillos expansivos
    rings.forEach((rg, i) => {
      const t0 = 29.0 + i * .55; const k = (t - t0) / 2.2;
      rg.visible = k > 0 && k < 1; if (!rg.visible) return;
      rg.position.copy(SP); rg.lookAt(camera.position); const s = SS * (1 + k * 12); rg.scale.set(s, s, 1);
      rg.material.uniforms.uA.value = (1 - k) * .6;
    });
  }
  // corazones
  hearts.forEach((h, i) => {
    const [a, b, c] = h.userData.r; const t0 = 26.85 + i * .07; const age = t - t0;
    h.visible = age > 0 && age < 2.6;
    if (!h.visible) return;
    const ang = a * Math.PI * 2; const sp = .9 + b * 1.2;
    h.position.copy(HUG).add(V(.2 + Math.abs(Math.cos(ang)) * sp * age, 1.4 + age * (1.0 + c), .9 + Math.sin(ang) * .4));
    h.lookAt(camera.position); h.rotateZ(Math.sin(t * 3 + i) * .3);
    const s = .35 * easeOutBack(clamp(age / .4)) * (1 - sstep(2, 2.6, age)); h.scale.setScalar(Math.max(.001, s));
  });

  drawHUD(t);
}

function renderAt(t) {
  update(t);
  renderer.autoClear = true;
  composer.render();
  renderer.autoClear = false;
  renderer.setRenderTarget(null);
  renderer.render(hudScene, hudCam);
}
await document.fonts.load('700 40px Fredoka');
window.renderAt = renderAt;
window.frameJPEG = (t, q = .93) => { renderAt(t); return renderer.domElement.toDataURL('image/jpeg', q); };
window.READY = true;
if (params.get('play')) {
  const t0 = performance.now(); const loop = () => { renderAt(((performance.now() - t0) / 1000) % 35); requestAnimationFrame(loop); }; loop();
} else renderAt(+params.get('t') || 0);
