// Copito — Episodio 3: "¡La estrella que cayó del cielo!"
// Render determinista: window.renderAt(t). Personajes desde ../characters.js (idénticos a los episodios 1 y 2).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, lerp, sstep, easeInOut, easeOutBack, pulse, V, rand, SPH, SPHlo, phys, MAT, mesh, CAP, stick, makeCritter, poseCritter, blinkAt, makeStar, poseStar, makeMonster, poseMonster } from '../characters.js';

const params = new URLSearchParams(location.search);
const W = +params.get('w') || 540, H = +params.get('h') || 960;
const TL = await (await fetch('../build/ep3_timeline.json')).json();
const R = rand(2024);
const mouthAt = (who, t) => { const a = TL.mouth[who]; if (!a) return 0; const f = t * TL.fps; const i = Math.floor(f); return lerp(a[i] || 0, a[i + 1] || 0, f - i); };
const hop = (t, t0, d = .5) => Math.max(0, Math.sin(clamp((t - t0) / d) * Math.PI));

// ------------------------------------------------------------------ renderer + post
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, .05, 3000);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .6, .5, .9); composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ cielo nocturno (como el episodio 1)
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: { uGlow: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vDir; uniform float uGlow,uTime;
    float hash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float fbm(vec3 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
    void main(){ vec3 d=normalize(vDir); float h=d.y;
      vec3 col = mix(vec3(.20,.11,.36), vec3(.02,.03,.13), smoothstep(-.05,.55,h));
      col += vec3(.55,.25,.45)*exp(-abs(h)*7.)*.5;
      float n = fbm(d*2.6 + vec3(0.,0.,uTime*.01));
      col += vec3(.25,.08,.35)*smoothstep(.55,.85,n)*smoothstep(0.,.4,h)*.7;
      vec3 glow = mix(vec3(.35,.16,.62), vec3(1.,.6,.8), smoothstep(.35,.75,n)) + vec3(.2,.5,.9)*smoothstep(.55,.85,fbm(d*5.+7.))*.5;
      col = mix(col, glow*.6, uGlow*.7);
      vec3 sp = d*260.; vec3 cell = floor(sp); float r = hash(cell);
      vec3 off = vec3(hash(cell+1.3),hash(cell+2.7),hash(cell+5.1))-.5;
      float dist = length(fract(sp)-.5-off*.5);
      float st = step(.9-.05*uGlow, r)*smoothstep(.12,0.,dist);
      float tw = .55+.45*sin(uTime*(2.+r*4.)+r*80.);
      col += mix(vec3(1.,.95,.8),vec3(.7,.85,1.),hash(cell+9.))*st*tw*(1.3+uGlow*2.)*smoothstep(-.02,.12,h);
      gl_FragColor = vec4(col,1.); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), skyMat); scene.add(sky);
const moon = mesh(SPH, new THREE.MeshStandardMaterial({ color: '#fff4c9', emissive: '#ffe9a0', emissiveIntensity: 1.3 }), [-150, 160, -380], 20);
moon.castShadow = false; scene.add(moon);

// ------------------------------------------------------------------ luces
const hemi = new THREE.HemisphereLight('#7f98ff', '#1e3a2e', .4); scene.add(hemi);
const sun = new THREE.DirectionalLight('#c9d6ff', 1.6); sun.castShadow = true; // luz de luna
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: .5, far: 60 });
sun.shadow.bias = -.0004; sun.shadow.radius = 3; scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight('#9fd0ff', 1.6); scene.add(rim, rim.target);
const fireLight = new THREE.PointLight('#ff9a4a', 0, 14, 1.5); scene.add(fireLight);
const starLight = new THREE.PointLight('#ffd46b', 0, 30, 1.3); scene.add(starLight);
const camFill = new THREE.PointLight('#fff1e0', 0, 25, 1.0); scene.add(camFill);

// ------------------------------------------------------------------ bosque
const PALETTE = ['#ff5fa2', '#ffb02e', '#7bdc4a', '#2fd0c9', '#a67bff', '#ff5b5b', '#ffd23f', '#5aa8ff'];
const M = V(46.6, 0, 0); // claro donde se encuentran
const forest = new THREE.Group(); scene.add(forest);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler();
{
  const g = new THREE.PlaneGeometry(220, 160, 220, 160); g.rotateX(-Math.PI / 2); g.translate(25, 0, 0);
  const pos = g.attributes.position; const cols = [];
  const grass = new THREE.Color('#4cc94f'), grass2 = new THREE.Color('#2fae55'), dirt = new THREE.Color('#e3b77a');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const path = (x > -3 && x < 62) ? sstep(1.4, .8, Math.abs(z + Math.sin(x * .2) * .15)) : 0;
    const clearing = sstep(3.2, 1.5, Math.hypot(x, z)) * .5 + sstep(4.5, 2.5, Math.hypot(x - M.x, z - M.z)) * .4 + sstep(3.5, 2, Math.hypot(x - 12.5, z)) * .4;
    const far = Math.abs(z) > 9 ? (Math.sin(x * .09) * Math.cos(z * .11) * 2 + 1.5) * sstep(9, 30, Math.abs(z)) : 0;
    pos.setY(i, far);
    const k = .5 + .5 * Math.sin(x * .6 + z * .4) * Math.cos(z * .7);
    const c = grass.clone().lerp(grass2, k * .5).lerp(dirt, Math.max(path * .85, clearing * .35));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); ground.receiveShadow = true; forest.add(ground);

  // árboles de colores (copa de caramelo)
  const trunkGeo = new THREE.CylinderGeometry(.16, .24, 1, 10); trunkGeo.translate(0, .5, 0);
  const trunkMat = phys('#8a5a36', { roughness: 1 });
  const crownMats = PALETTE.map((c) => phys(c, { roughness: .6, sheen: .6, sheenColor: new THREE.Color('#ffffff'), clearcoat: .2 }));
  const spots = [];
  for (let x = -14; x < 66; x += 2.1) for (const side of [-1, 1]) {
    if (R() < .25) continue;
    const z = side > 0 ? 9.5 + R() * 6 : -(3.2 + R() * 6), xx = x + (R() - .5) * 1.4;
    if (Math.hypot(xx, z) < 5 || Math.hypot(xx - M.x, z - M.z) < 5.5 || Math.hypot(xx - 12.5, z) < 3.5) continue;
    spots.push([xx, z]);
  }
  for (const [x, z] of spots) {
    const tr = new THREE.Group(); const s = .8 + R() * .7; tr.position.set(x, 0, z); tr.scale.setScalar(s); forest.add(tr);
    const th = 1.4 + R() * 1.2; const tk = new THREE.Mesh(trunkGeo, trunkMat); tk.scale.y = th; tk.castShadow = true; tr.add(tk);
    const cm = crownMats[Math.floor(R() * crownMats.length)];
    const n = 2 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) tr.add(mesh(SPHlo, cm, [(R() - .5) * 1.1, th + .5 + R() * .7, (R() - .5) * 1.1], .7 + R() * .5));
  }
  // flores
  const N = 2200;
  const heads = new THREE.InstancedMesh(SPHlo, new THREE.MeshStandardMaterial({ roughness: .5 }), N);
  const centers = new THREE.InstancedMesh(SPHlo, new THREE.MeshStandardMaterial({ color: '#ffe066', roughness: .6 }), N);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(.012, .012, 1, 4).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: '#2f9f3c' }), N);
  for (let i = 0; i < N; i++) {
    let x, z;
    const r = R();
    if (r < .2) { const a = R() * 6.28, rr = 1.2 + R() * 4; x = Math.cos(a) * rr; z = Math.sin(a) * rr; }
    else if (r < .35) { const a = R() * 6.28, rr = 1.6 + R() * 2.6; x = M.x + Math.cos(a) * rr; z = M.z + Math.sin(a) * rr; }
    else if (r < .45) { const a = R() * 6.28, rr = 1.2 + R() * 3.5; x = 12.5 + Math.cos(a) * rr; z = Math.sin(a) * rr; }
    else { x = -8 + R() * 72; z = R() < .55 ? -(1.3 + R() * 7) : 1.3 + R() * 3.2; }
    const h = .18 + R() * .3;
    m4.compose(V(x, 0, z), q.identity(), V(1, h, 1)); stems.setMatrixAt(i, m4);
    m4.compose(V(x, h, z), q.identity(), V(.085, .05, .085)); heads.setMatrixAt(i, m4);
    m4.compose(V(x, h + .03, z), q.identity(), V(.035, .03, .035)); centers.setMatrixAt(i, m4);
    heads.setColorAt(i, new THREE.Color(PALETTE[i % PALETTE.length]).offsetHSL(0, 0, (R() - .5) * .1));
  }
  forest.add(stems, heads, centers);
  // hongos rojos con lunares
  const capM = phys('#ff3b3b', { roughness: .35, clearcoat: .6 }), stemM = phys('#fff4e0', { roughness: .8 }), dotM = phys('#ffffff', { roughness: .4 });
  for (let i = 0; i < 26; i++) {
    let x = -6 + R() * 62, z = (R() < .5 ? -1 : 1) * (1.5 + R() * 3.5);
    if (i < 5) { const a = i * 1.3 + 1; x = Math.cos(a) * 2.3; z = Math.sin(a) * 2.3 - .5; }
    if (i >= 5 && i < 10) { const a = i * 1.2; x = M.x + Math.cos(a) * 2.8; z = M.z + Math.sin(a) * 2.8 - .6; }
    const s = .6 + R() * .6; const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.scale.setScalar(s); g2.rotation.z = (R() - .5) * .3; forest.add(g2);
    g2.add(mesh(new THREE.CylinderGeometry(.07, .09, .3, 10).translate(0, .15, 0), stemM));
    g2.add(mesh(new THREE.SphereGeometry(.2, 20, 12, 0, 6.29, 0, Math.PI / 2), capM, [0, .28, 0], [1, .8, 1]));
    for (let k = 0; k < 5; k++) { const a = k * 1.25; g2.add(mesh(SPHlo, dotM, [Math.cos(a) * .12, .37, Math.sin(a) * .12], [.03, .015, .03])); }
  }
}

// ------------------------------------------------------------------ fogata, cráter y arcoíris
const K = V(56, 0, -1); // donde cae la estrella
const campfire = new THREE.Group(); campfire.position.copy(M); scene.add(campfire);
{
  const logM = phys('#7a4a2a', { roughness: 1 });
  for (let i = 0; i < 4; i++) campfire.add(mesh(new THREE.CylinderGeometry(.07, .08, .9, 10), logM, [0, .1, 0], 1, [Math.PI / 2 - .25, i * Math.PI / 4, 0]));
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; campfire.add(mesh(new THREE.DodecahedronGeometry(.11, 0), phys('#8a8f9e'), [Math.cos(a) * .5, .06, Math.sin(a) * .5])); }
}
const flames = [['#ff5a1f', .32, .9], ['#ffa21f', .22, .7], ['#ffe27a', .12, .45]].map(([c, r, h]) => {
  const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16, 1, true).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  f.position.copy(M).add(V(0, .12, 0)); scene.add(f); return f;
});
// cráter
const crater = new THREE.Group(); crater.position.copy(K); scene.add(crater);
crater.add(mesh(new THREE.TorusGeometry(1.2, .28, 12, 40), phys('#7d5a3c', { roughness: 1 }), [0, .02, 0], [1, 1, .45], [Math.PI / 2, 0, 0]));
crater.add(mesh(new THREE.CircleGeometry(1.15, 40), phys('#4a3524', { roughness: 1 }), [0, .03, 0], 1, [-Math.PI / 2, 0, 0]));
const craterGlow = mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false }), [0, .05, 0], 1, [-Math.PI / 2, 0, 0]);
crater.add(craterGlow);

// camino de arcoíris (cinta que crece desde el cráter hasta el cielo)
const rbCurve = new THREE.CatmullRomCurve3([
  K.clone().add(V(0, .35, 0)), K.clone().add(V(-1.2, 3.5, -2.2)), K.clone().add(V(-3.5, 9.5, -6)), K.clone().add(V(-6.5, 15.5, -9.5)),
  K.clone().add(V(-9.5, 19.5, -12)), K.clone().add(V(-12, 20.6, -13.6)), K.clone().add(V(-13.6, 21.0, -14.6)),
  K.clone().add(V(-15, 25, -15.8)), K.clone().add(V(-16, 33, -16.8)), K.clone().add(V(-16.5, 44, -17.5)),
], false, 'catmullrom', .5);
const RB_N = 400, RB_W = 2.6;
const rbFrames = [];
{
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= RB_N; i++) {
    const u = i / RB_N; const p = rbCurve.getPointAt(u); const tg = rbCurve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(tg, V(0, 1, 0)).normalize();
    const nrm = new THREE.Vector3().crossVectors(side, tg).normalize();
    rbFrames.push({ p, tg, side, nrm });
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s * RB_W / 2); pos.push(q.x, q.y, q.z); uv.push(u, (s + 1) / 2); }
    if (i < RB_N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  var rbGeo = new THREE.BufferGeometry();
  rbGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rbGeo.setIndex(idx);
}
const rbMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uGrow: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uGrow,uTime;
    void main(){ if (vUv.x > uGrow) discard;
      vec3 b[7]; b[0]=vec3(1.,.25,.3); b[1]=vec3(1.,.55,.15); b[2]=vec3(1.,.9,.2); b[3]=vec3(.35,.9,.35); b[4]=vec3(.25,.7,1.); b[5]=vec3(.4,.4,1.); b[6]=vec3(.75,.4,1.);
      int i = int(clamp(vUv.y*7.,0.,6.99)); vec3 c = b[i];
      float edge = smoothstep(0.,.05,vUv.y)*smoothstep(1.,.95,vUv.y);
      float shine = .15*sin(vUv.x*300.-uTime*8.);
      float tip = smoothstep(uGrow-.015, uGrow, vUv.x);
      gl_FragColor = vec4(c*(.85+shine) + vec3(1.)*tip*1.2, .82*edge); }`,
});
const rainbowRoad = new THREE.Mesh(rbGeo, rbMat); rainbowRoad.frustumCulled = false; scene.add(rainbowRoad);
// punta de la cima (donde se detienen): el punto más plano tras la subida
let U_TIP = .5; { let best = 1e9; for (let i = 0; i <= RB_N; i++) { const d = rbFrames[i].p.distanceTo(K.clone().add(V(-12.8, 20.8, -14.1))); if (d < best) { best = d; U_TIP = i / RB_N; } } }
const frameAt = (u) => rbFrames[Math.round(clamp(u) * RB_N)];
const TIPF = frameAt(U_TIP);
const FWD = V(TIPF.tg.x, 0, TIPF.tg.z).normalize();          // dirección de avance
const SIDE = new THREE.Vector3().crossVectors(FWD, V(0, 1, 0)).normalize();
const TIP = TIPF.p.clone();
const SKYHOME = TIP.clone().add(V(0, 10, 0)).addScaledVector(FWD, -4);

// ------------------------------------------------------------------ personajes
const copito = makeCritter({ kind: 'bunny', fur: MAT.fur, inner: MAT.pink, iris: MAT.irisBlue, brow: MAT.browBunny, overall: true });
scene.add(copito.g);
const bear = makeCritter({ kind: 'bear', fur: MAT.bear, inner: MAT.bearTan, iris: MAT.irisBrown, brow: MAT.browBear, belly: MAT.bearTan, bowtie: true, eyeScale: .9 });
bear.g.scale.setScalar(.72); scene.add(bear.g);
const monster = makeMonster(); scene.add(monster.g);
{ const P = monster.P; P.bodyPurple.visible = false; P.bodyRainbow.visible = true; P.dots.forEach((d) => (d.visible = true)); P.spots.forEach((s) => (s.visible = false)); P.swirlMat.uniforms.uFill.value = .55; }
const star = makeStar(); scene.add(star.g);
// malvavisco en el palito de Copito
const mallow = new THREE.Group(); copito.P.arms[1].add(mallow);
mallow.add(stick(V(0, -.34, 0), V(.05, -.4, .75), .012, phys('#a0703f')));
mallow.add(mesh(new THREE.CylinderGeometry(.06, .06, .09, 14), phys('#fff7ec', { roughness: .8 }), [.05, -.4, .78], 1, [Math.PI / 2, 0, 0]));
// halo de la estrella
const haloMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv; uniform float uA,uTime; void main(){ vec2 c=vUv-.5; float d=length(c)*2.; float a=atan(c.y,c.x);
    float rays = pow(.5+.5*sin(a*12.+uTime*.6),6.)*.6 + pow(.5+.5*sin(a*7.-uTime*.4),8.)*.4;
    float g = exp(-d*3.2) + rays*smoothstep(1.,.15,d)*.5; gl_FragColor=vec4(vec3(1.,.82,.45)*g*uA, g*uA);} `,
});
const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat); halo.frustumCulled = false; scene.add(halo);

const pointMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPx: { value: H / 1920 } },
  vertexShader: `attribute float size; attribute float seed; attribute vec3 color; varying vec3 vC; varying float vTw; uniform float uTime,uPx;
    void main(){ vC=color; vTw=.65+.35*sin(uTime*(3.+seed*3.)+seed*40.); vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=min(size*uPx*(300./-mv.z)*(.7+.3*vTw), 40.*uPx); }`,
  fragmentShader: `varying vec3 vC; varying float vTw; void main(){ vec2 c=gl_PointCoord-.5; float d=length(c);
    float core=smoothstep(.5,0.,d); float cr=max(0.,1.-abs(c.x)*14.)*max(0.,1.-abs(c.y)*2.2)+max(0.,1.-abs(c.y)*14.)*max(0.,1.-abs(c.x)*2.2);
    float a=pow(core,2.5)+cr*.5*core; gl_FragColor=vec4(vC*a*vTw*1.5, a); }`,
});

// ------------------------------------------------------------------ partículas
const SPARK_N = 3000;
const sparkGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(SPARK_N * 3), sCol = new Float32Array(SPARK_N * 3), sSize = new Float32Array(SPARK_N), sSeed = new Float32Array(SPARK_N);
for (const [k, a, n] of [['position', sPos, 3], ['color', sCol, 3], ['size', sSize, 1], ['seed', sSeed, 1]]) sparkGeo.setAttribute(k, new THREE.BufferAttribute(a, n));
const sparkMat = pointMat(); const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);
const RND = Array.from({ length: 6000 }, () => [R(), R(), R(), R(), R()]);
const hex2rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const RAIN = PALETTE.map(hex2rgb);
const SMOKE_N = 30;
const smoke = new THREE.InstancedMesh(SPHlo, new THREE.MeshStandardMaterial({ color: '#b9b4c8', roughness: 1, transparent: true, opacity: .35 }), SMOKE_N);
smoke.frustumCulled = false; scene.add(smoke);


// ------------------------------------------------------------------ HUD: título, subtítulos karaoke y marca
const hudCanvas = document.createElement('canvas'); hudCanvas.width = W; hudCanvas.height = H;
const hc = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas); hudTex.colorSpace = THREE.SRGBColorSpace;
const hudScene = new THREE.Scene(); const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
hudScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, toneMapped: false })));
const INK = '#2a1a6e';
const WORD_COLS = ['#ffd84d', '#ff7ab8', '#6fe3ff', '#8dff6a', '#ffa64d', '#c9a2ff'];
function outlined(txt, x, y, size, fill, sw = .2) {
  hc.font = `700 ${size}px Fredoka`; hc.lineJoin = 'round';
  hc.lineWidth = size * sw * 1.5; hc.strokeStyle = 'rgba(20,10,60,.4)'; hc.strokeText(txt, x, y + size * .07);
  hc.lineWidth = size * sw; hc.strokeStyle = INK; hc.strokeText(txt, x, y); hc.fillStyle = fill; hc.fillText(txt, x, y);
}
function starPath(cx, cy, r) { hc.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .48 : r; const a = -Math.PI / 2 + i * Math.PI / 5; hc.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } hc.closePath(); }
let hudKey = '';
function drawHUD(t) {
  const u = H / 1920;
  const line = TL.lines.find((l) => t >= l.start - .05 && t <= l.end + .35);
  const titleA = t < 1.95 ? 1 - sstep(1.6, 1.95, t) : 0;
  const titleGray = 0;
  const endA = sstep(33.55, 33.9, t);
  let wordIdx = -1, subA = 0, words = [];
  if (line) {
    subA = sstep(line.start - .05, line.start + .08, t) * (1 - sstep(line.end + .15, line.end + .35, t));
    words = line.text.split(' ');
    const total = words.reduce((s, w) => s + w.length + 1, 0); let acc = 0; const k = clamp((t - line.start) / (line.end - line.start - .1));
    words.forEach((w, i) => { if (k * total >= acc) wordIdx = i; acc += w.length + 1; });
  }
  const key = `${line ? line.id : ''}|${wordIdx}|${subA.toFixed(2)}|${titleA.toFixed(2)}|${titleGray.toFixed(2)}|${endA.toFixed(2)}|${Math.floor(t * 10)}`;
  if (key === hudKey) return; hudKey = key;
  hc.clearRect(0, 0, W, H);
  hc.textAlign = 'center'; hc.textBaseline = 'middle';
  // marca de agua
  hc.save(); hc.globalAlpha = .85 * (1 - endA);
  hc.font = `700 ${Math.round(40 * u)}px Fredoka`; hc.textAlign = 'left';
  outlined('COPITO', 36 * u, 70 * u, Math.round(40 * u), '#ffffff', .22);
  const cw = hc.measureText('COPITO').width;
  hc.beginPath(); hc.roundRect(36 * u + cw + 10 * u, 46 * u, 62 * u, 48 * u, 12 * u); hc.fillStyle = '#ffd84d'; hc.fill(); hc.lineWidth = 5 * u; hc.strokeStyle = INK; hc.stroke();
  hc.fillStyle = INK; hc.textAlign = 'center'; hc.font = `700 ${Math.round(30 * u)}px Fredoka`; hc.fillText('TV', 36 * u + cw + 41 * u, 72 * u);
  hc.restore();
  // título (gancho)
  if (titleA > 0) {
    hc.save(); hc.globalAlpha = titleA;
    const pop = easeOutBack(clamp(t / .45));
    hc.translate(W / 2, H * .17); hc.scale(pop, pop); hc.rotate(-.04 + Math.sin(t * 6) * .01);
    const rows = [['¡LA', 'ESTRELLA'], ['QUE', 'CAYÓ'], ['DEL', 'CIELO!']];
    const sizes = [120, 104, 124];
    let y = -150 * u;
    rows.forEach((row, ri) => {
      const sz = Math.round(sizes[ri] * u); hc.font = `700 ${sz}px Fredoka`;
      const widths = row.map((w) => hc.measureText(w).width); const gap = sz * .28;
      let x = -(widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1)) / 2;
      row.forEach((w, wi) => {
        let col = WORD_COLS[(ri * 3 + wi) % WORD_COLS.length];
        if (titleGray > 0) { const c = new THREE.Color(col); const l = c.r * .3 + c.g * .59 + c.b * .11; c.lerp(new THREE.Color(l, l, l), titleGray); col = '#' + c.getHexString(); }
        hc.textAlign = 'left'; outlined(w, x, y + Math.sin(t * 8 + wi + ri) * 4 * u, sz, col, .2); x += widths[wi] + gap;
      });
      y += sz * 1.08;
    });
    hc.restore();
  }
  // subtítulos grandes de colores con palabra activa resaltada
  if (line && subA > 0) {
    hc.save(); hc.globalAlpha = subA;
    const sz = Math.round(80 * u); hc.font = `700 ${sz}px Fredoka`;
    const maxW = W * .86; const lines = []; let cur = [];
    words.forEach((w, i) => { const tst = [...cur, w].map((k) => words[k] ?? k); const s = cur.map((k) => words[k]).concat(w).join(' '); if (hc.measureText(s).width > maxW && cur.length) { lines.push(cur); cur = [i]; } else cur.push(i); });
    if (cur.length) lines.push(cur);
    const lh = sz * 1.18; const y0 = H * .755 - (lines.length - 1) * lh / 2;
    const base = { monster: ['#d6b3ff', '#b6ff8a', '#ffd84d'], star: ['#fff2a0', '#ffe066', '#fff2a0'], bear: ['#ffe2b8', '#ffd3a0', '#ffe2b8'] }[line.who] || ['#ffffff', '#ffffff', '#ffffff'];
    lines.forEach((ln, li) => {
      const ws = ln.map((i) => words[i]); const gap = sz * .26;
      const widths = ws.map((w) => hc.measureText(w).width);
      let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (ws.length - 1)) / 2;
      ln.forEach((i, j) => {
        const active = i === wordIdx; const spoken = i <= wordIdx;
        const col = active ? WORD_COLS[i % WORD_COLS.length] : (spoken ? base[i % 3] : base[i % 3]);
        hc.save(); hc.translate(x + widths[j] / 2, y0 + li * lh);
        const s = active ? 1.16 : 1; hc.scale(s, s); hc.rotate(active ? Math.sin(i) * .05 : 0);
        hc.globalAlpha = subA * (spoken ? 1 : .7);
        hc.textAlign = 'center'; outlined(words[i], 0, 0, sz, col, .22); hc.restore();
        x += widths[j] + gap;
      });
    });
    hc.restore();
  }
  // tarjeta final
  if (endA > 0) {
    hc.save(); hc.globalAlpha = endA; const s = .8 + .2 * easeOutBack(clamp((t - 33.55) / .4));
    hc.translate(W / 2, H * .2); hc.scale(s, s); hc.textAlign = 'center';
    outlined('COPITO', -60 * u, 0, Math.round(150 * u), '#ffffff', .2);
    hc.font = `700 ${Math.round(150 * u)}px Fredoka`; const cw2 = hc.measureText('COPITO').width;
    const bx = -60 * u + cw2 / 2 + 22 * u; hc.save(); hc.translate(bx + 70 * u, 0); hc.rotate(-.06);
    hc.beginPath(); hc.roundRect(-70 * u, -58 * u, 140 * u, 116 * u, 28 * u); hc.fillStyle = '#ffd84d'; hc.fill(); hc.lineWidth = 10 * u; hc.strokeStyle = INK; hc.stroke();
    hc.fillStyle = INK; hc.font = `700 ${Math.round(90 * u)}px Fredoka`; hc.fillText('TV', 0, 6 * u); hc.restore();
    hc.beginPath(); hc.roundRect(-300 * u, 105 * u, 600 * u, 110 * u, 55 * u); hc.fillStyle = '#ff2d4a'; hc.fill(); hc.lineWidth = 9 * u; hc.strokeStyle = '#ffffff'; hc.stroke();
    hc.fillStyle = '#ffffff'; hc.font = `700 ${Math.round(66 * u)}px Fredoka`; hc.fillText('¡SUSCRÍBETE!', 0, 162 * u);
    for (const [x, y, r] of [[-360, -40, 34], [380, -60, 28]]) { starPath(x * u, y * u, r * u); hc.fillStyle = '#ffd84d'; hc.lineWidth = 7 * u; hc.strokeStyle = INK; hc.stroke(); hc.fill(); }
    hc.restore();
  }
  hudTex.needsUpdate = true;
}



// ------------------------------------------------------------------ posiciones
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const SEAT = { copito: M.clone().add(V(-1.0, 0, .55)), bear: M.clone().add(V(1.0, 0, .6)), monster: M.clone().add(V(.15, 0, -1.05)) };
const CRATER = { copito: K.clone().add(V(-1.45, 0, .75)), monster: K.clone().add(V(1.45, 0, .7)), bear: K.clone().add(V(-.3, 0, -1.55)) };
const STAR_REST = K.clone().add(V(0, .55, 0));
const TIPPOS = { copito: TIP.clone().addScaledVector(SIDE, -1.0), monster: TIP.clone().addScaledVector(SIDE, 1.05), bear: TIP.clone().addScaledVector(SIDE, -.3).addScaledVector(FWD, -1.1), star: TIP.clone().add(V(0, .6, 0)) };
const RIDE = { star: [0, 0], copito: [-.014, -.6], monster: [-.028, .6], bear: [-.042, 0] };
const uLead = (t) => lerp(.015, U_TIP, easeInOut(clamp((t - 16.0) / 3.8)));
function ridePos(who, t) {
  const [du, so] = RIDE[who]; const u = clamp(uLead(t) + du, .005, 1); const f = frameAt(u);
  const p = f.p.clone().addScaledVector(f.side, so).addScaledVector(f.nrm, .04);
  return { p, yaw: Math.atan2(f.tg.x, f.tg.z), pitch: -Math.asin(clamp(f.tg.y, -1, 1)) * .55 };
}
function starPosAt(t) {
  if (t < 1.25) { const k = clamp((t - .2) / 1.05); return K.clone().add(V(17.2, 15, -5.5)).lerp(STAR_REST, k * (.4 + .6 * k)); }
  if (t < 15.6) return STAR_REST.clone();
  if (t < 16.0) { const k = sstep(15.6, 16.0, t); const r = ridePos('star', 16).p.add(V(0, .45, 0)); return STAR_REST.clone().lerp(r, k).add(V(0, Math.sin(k * Math.PI) * .5, 0)); }
  if (t < 19.8) return ridePos('star', t).p.add(V(0, .45, 0));
  if (t < 26.3) return TIPPOS.star.clone().lerp(TIPPOS.star, 0).add(V(0, Math.sin(t * 2) * .05 + sstep(25.0, 26.0, t) * .25, 0));
  const k = easeInOut(clamp((t - 26.3) / 2.7));
  const p = TIPPOS.star.clone().add(V(0, .25, 0)).lerp(SKYHOME, k); p.addScaledVector(SIDE, Math.sin(k * Math.PI) * 1.2);
  return p.add(V(0, t > 29 ? Math.sin(t * 1.5) * .15 : 0, 0));
}

// ------------------------------------------------------------------ cámara (planos)
const up = V(0, 1, 0);
const copPosNow = { p: TIPPOS.copito.clone() };
const shots = [
  [0, 1.3, () => ({ a: [V(41.0, 1.7, 2.0), K.clone().add(V(4, 4.6, -1.3)), 48], b: [V(41.4, 1.6, 1.9), K.clone().add(V(2, 3.2, -.7)), 46] })],
  [1.3, 4.0, () => ({ a: [M.clone().add(V(3.8, 1.3, 2.6)), M.clone().add(V(-.2, 1.0, .2)), 42], b: [M.clone().add(V(3.4, 1.3, 2.3)), M.clone().add(V(-.2, 1.05, .2)), 40] })],
  [4.0, 5.6, (t) => { const x = lerp(M.x, K.x - 1.5, easeInOut(clamp((t - 4) / 1.6))); return { a: [V(x - .5, 1.6, 8.5), V(x + 1.2, .9, 0), 44], b: [V(x - .5, 1.6, 8.5), V(x + 1.2, .9, 0), 44] }; }],
  [5.6, 6.3, () => ({ a: [K.clone().add(V(0, 2.4, 6.6)), K.clone().add(V(0, .4, 0)), 44], b: [K.clone().add(V(0, 2.2, 6.0)), K.clone().add(V(0, .45, 0)), 44] })],
  [6.3, 9.2, () => ({ a: [K.clone().add(V(.15, 1.05, 2.9)), K.clone().add(V(0, .65, 0)), 40], b: [K.clone().add(V(.1, .95, 2.4)), K.clone().add(V(0, .65, 0)), 38] })],
  [9.2, 10.1, () => ({ a: [K.clone().add(V(0, 2.0, 7.0)), K.clone().add(V(0, .7, 0)), 44], b: [K.clone().add(V(0, 1.9, 6.6)), K.clone().add(V(0, .7, 0)), 44] })],
  [10.1, 12.2, () => ({ a: [K.clone().add(V(2.1, 1.25, 2.2)), K.clone().add(V(-1.0, 1.15, .6)), 38], b: [K.clone().add(V(1.8, 1.25, 1.9)), K.clone().add(V(-1.0, 1.2, .6)), 36] })],
  [12.2, 13.4, () => ({ a: [K.clone().add(V(-1.6, 1.15, 2.4)), K.clone().add(V(1.4, 1.0, .7)), 40], b: [K.clone().add(V(-1.4, 1.1, 2.1)), K.clone().add(V(1.4, 1.05, .7)), 38] })],
  [13.4, 16.0, () => ({ a: [K.clone().add(V(1.5, 1.3, 6.5)), K.clone().add(V(-1.5, 4.5, -2.5)), 56], b: [K.clone().add(V(1.8, 1.2, 7.2)), K.clone().add(V(-2.5, 6.5, -4)), 58] })],
  [16.0, 19.8, (t) => { const f = frameAt(uLead(t) - .015); const sd = f.side.z > 0 ? 1 : -1; const c = f.p.clone().addScaledVector(f.side, 6.5 * sd).add(V(0, 3.4, 0)).addScaledVector(f.tg, -2.5); const l = f.p.clone().add(V(0, .9, 0)); return { a: [c, l, 46], b: [c, l, 46] }; }],
  [19.8, 23.0, () => ({ a: [TIP.clone().addScaledVector(FWD, 8.0).add(V(0, 1.8, 0)), TIP.clone().add(V(0, .9, 0)), 44], b: [TIP.clone().addScaledVector(FWD, 6.8).add(V(0, 1.6, 0)), TIP.clone().add(V(0, .95, 0)), 42] })],
  [23.0, 24.6, () => ({ a: [TIPPOS.copito.clone().addScaledVector(FWD, 3.3).addScaledVector(SIDE, .5).add(V(0, 1.3, 0)), TIPPOS.copito.clone().add(V(0, 1.2, 0)), 38], b: [TIPPOS.copito.clone().addScaledVector(FWD, 2.9).addScaledVector(SIDE, .5).add(V(0, 1.3, 0)), TIPPOS.copito.clone().add(V(0, 1.25, 0)), 36] })],
  [24.6, 26.0, () => ({ a: [TIP.clone().addScaledVector(FWD, 6.0).add(V(0, 1.4, 0)), TIP.clone().add(V(0, .95, 0)), 42], b: [TIP.clone().addScaledVector(FWD, 5.4).add(V(0, 1.3, 0)), TIP.clone().add(V(0, .95, 0)), 40] })],
  [26.0, 27.0, () => ({ a: [TIP.clone().addScaledVector(FWD, 6.5).add(V(0, 1.6, 0)), TIP.clone().add(V(0, 1.3, 0)), 44], b: [TIP.clone().addScaledVector(FWD, 9).add(V(0, 2.2, 0)), TIP.clone().add(V(0, 2.2, 0)), 48] })],
  [27.0, 29.0, (t) => { const s = starPosAt(t); return { a: [s.clone().addScaledVector(FWD, 5.5).add(V(0, -.6, 0)), s.clone(), 42], b: [s.clone().addScaledVector(FWD, 6.5).add(V(0, -.8, 0)), s.clone(), 44] }; }],
  [29.0, 31.3, () => ({ a: [TIP.clone().addScaledVector(FWD, 13).add(V(0, 3.0, 0)), TIP.clone().add(V(0, 5.2, 0)).addScaledVector(FWD, -1), 52], b: [TIP.clone().addScaledVector(FWD, 12).add(V(0, 3.4, 0)), TIP.clone().add(V(0, 5.6, 0)).addScaledVector(FWD, -1), 52] })],
  [31.3, 33.5, () => ({ a: [TIPPOS.copito.clone().addScaledVector(FWD, 3.6).add(V(0, 1.4, 0)), TIPPOS.copito.clone().add(V(0, 1.35, 0)), 38], b: [TIPPOS.copito.clone().addScaledVector(FWD, 3.0).add(V(0, 1.45, 0)), TIPPOS.copito.clone().add(V(0, 1.4, 0)), 36] })],
  [33.5, 35.01, () => ({ a: [TIP.clone().addScaledVector(FWD, 11).add(V(0, 2.6, 0)), TIP.clone().add(V(0, 4.5, 0)), 50], b: [TIP.clone().addScaledVector(FWD, 13).add(V(0, 3.0, 0)), TIP.clone().add(V(0, 5.0, 0)), 52] })],
];
function cameraAt(t) {
  const [a, b, f] = shots.find(([s0, s1]) => t >= s0 && t < s1) || shots[shots.length - 1];
  const k = easeInOut(clamp((t - a) / (b - a)));
  const { a: A, b: B } = f(t);
  const pos = A[0].clone().lerp(B[0], k), look = A[1].clone().lerp(B[1], k);
  pos.x += Math.sin(t * .8) * .025; pos.y += Math.sin(t * 1.1 + 1) * .02;
  return { pos, look, fov: lerp(A[2], B[2], k) };
}

// ------------------------------------------------------------------ animación
function placeCritter(g, who, t, extra = {}) {
  // devuelve {pos, yaw, pitch, mode}
  if (t < 4.0) return { p: SEAT[who].clone(), yaw: t < 1.3 ? faceTo(SEAT[who], M) : lerp(faceTo(SEAT[who], M), Math.PI / 2, sstep(1.3, 1.8, t)), pitch: 0, mode: 'camp' };
  if (t < 5.6) { const k = easeInOut(clamp((t - 4.0) / 1.6)); const p = SEAT[who].clone().lerp(CRATER[who], k); return { p, yaw: faceTo(SEAT[who], CRATER[who]), pitch: 0, mode: 'run' }; }
  if (t < 15.4) return { p: CRATER[who].clone(), yaw: faceTo(CRATER[who], K), pitch: 0, mode: 'crater' };
  if (t < 16.0) { const k = sstep(15.4, 16.0, t); const r = ridePos(who, 16); const p = CRATER[who].clone().lerp(r.p, k); p.y += Math.sin(k * Math.PI) * .7; return { p, yaw: lerp(faceTo(CRATER[who], K), r.yaw, k), pitch: r.pitch * k, mode: 'hopOn' }; }
  if (t < 19.8) { const r = ridePos(who, t); return { p: r.p, yaw: r.yaw, pitch: r.pitch, mode: 'ride' }; }
  if (t < 20.3) { const k = sstep(19.8, 20.3, t); const r = ridePos(who, 19.8); return { p: r.p.clone().lerp(TIPPOS[who], k), yaw: lerp(r.yaw, Math.atan2(FWD.x, FWD.z), k), pitch: r.pitch * (1 - k), mode: 'tip' }; }
  return { p: TIPPOS[who].clone(), yaw: Math.atan2(FWD.x, FWD.z), pitch: 0, mode: 'tip' };
}

function update(t) {
  // ---------- cámara
  const cam = cameraAt(t);
  const shake = pulse(t, 1.25, 1.8, .04) * .06 + pulse(t, 26.0, 26.6, .05) * .04;
  cam.pos.x += Math.sin(t * 63) * shake; cam.pos.y += Math.sin(t * 49 + 2) * shake;
  camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.fov = cam.fov; camera.updateProjectionMatrix();
  sky.position.copy(camera.position); skyMat.uniforms.uTime.value = t; sparkMat.uniforms.uTime.value = t;
  const glowSky = sstep(26.0, 30.0, t);
  skyMat.uniforms.uGlow.value = glowSky;
  const focus = cam.look.clone(); const fy = focus.y; focus.y = Math.max(0, fy - 1);
  sun.position.copy(focus).add(V(-8, 14, 9)); sun.target.position.copy(focus);
  rim.position.copy(focus).add(V(4, 5, -8)); rim.target.position.copy(focus);
  camFill.position.copy(camera.position).add(V(0, .5, 0)); camFill.intensity = .7 + (camera.position.y > 8 ? .8 : 0);
  rbMat.uniforms.uTime.value = t;
  rbMat.uniforms.uGrow.value = t < 13.4 ? 0 : (t < 26.0 ? lerp(0, U_TIP + .01, easeInOut(clamp((t - 13.4) / 2.4))) : U_TIP + .01);
  // fogata
  const fl = 1 + Math.sin(t * 13) * .12 + Math.sin(t * 7.3) * .08;
  flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 9 + i) * .08, fl * (1 + i * .05) * (1 + Math.sin(t * 17 + i * 2) * .12), 1 + Math.cos(t * 8 + i) * .08); f.rotation.y = t * (1 + i); });
  fireLight.position.copy(M).add(V(0, .7, 0)); fireLight.intensity = 9 * fl * (camera.position.distanceTo(M) < 20 ? 1 : 0);
  hemi.intensity = .4; bloom.strength = .6 + pulse(t, 1.25, 2.0, .05) * .4 + pulse(t, 26.0, 26.8, .1) * .3;

  // ---------- estrella
  const sp = starPosAt(t); star.g.position.copy(sp);
  const fallen = t < 1.25;
  let sScale = .62, glow = .3, sad = 1, sBlink = blinkAt(t, 3), sTilt = 0;
  if (fallen) { sScale = .25; glow = 2.5; }
  else if (t < 5.8) { star.g.rotation.set(-1.15, 0, .3); glow = .35 + .15 * Math.sin(t * 9); sBlink = .1; }
  else if (t < 15.6) { const k = sstep(5.8, 6.3, t); star.g.rotation.set(lerp(-1.15, -.15, k), 0, lerp(.3, 0, k)); glow = .3 + .1 * Math.sin(t * 7); }
  else if (t < 19.8) { star.g.rotation.set(-.15, Math.atan2(FWD.x, FWD.z) * 0 + .0, 0); glow = .4; sad = lerp(1, .3, sstep(16, 16.6, t)); }
  else if (t < 26.0) { star.g.rotation.set(0, 0, 0); const dim = sstep(19.9, 21.0, t) * (1 - sstep(24.8, 25.6, t)); glow = lerp(.4, .12, dim) * (1 + .3 * Math.sin(t * 11) * dim) + sstep(24.8, 26.0, t) * 1.0; sad = lerp(.4, 1, dim); if (t > 24.8) sad = lerp(1, 0, sstep(24.8, 25.8, t)); }
  else { const k = sstep(26.0, 26.4, t); sad = 0; glow = .9 + k * .3 - sstep(28.5, 29.5, t) * .2; sScale = lerp(.62, 2.2, easeInOut(clamp((t - 26.3) / 2.9))); star.g.rotation.set(0, 0, 0); }
  // la estrella mira hacia la cámara (siempre que esté de pie)
  if (t > 15.6) { const yaw = Math.atan2(camera.position.x - sp.x, camera.position.z - sp.z); star.g.rotation.y = yaw; }
  else if (t >= 5.8) { star.g.rotation.y = Math.atan2(camera.position.x - sp.x, camera.position.z - sp.z) * .6; }
  star.g.scale.setScalar(sScale);
  poseStar(star, t, { glow, blink: sBlink, sad, mouth: mouthAt('star', t), tilt: sTilt });
  star.g.rotation.z += 0;
  starLight.position.copy(sp).add(V(0, 0, .5)); starLight.intensity = fallen ? 6 : glow * 2.5 + (t > 1.25 && t < 3 ? (1 - (t - 1.25) / 1.75) * 30 : 0);
  if (t > 1.25 && t < 3) starLight.position.copy(K).add(V(0, 1.5, 0));
  halo.position.copy(sp); halo.lookAt(camera.position); halo.translateZ(-.4 * sScale);
  const hs = sScale * (fallen ? 9 : 3.2 + glow * 1.5); halo.scale.set(hs, hs, 1);
  haloMat.uniforms.uA.value = fallen ? 1.0 : .06 + glow * .14; haloMat.uniforms.uTime.value = t;
  craterGlow.material.opacity = t > 1.25 && t < 15.6 ? .25 + .1 * Math.sin(t * 6) + (t < 2.5 ? (1 - (t - 1.25) / 1.25) * .6 : 0) : 0;

  // ---------- Copito
  {
    const pl = placeCritter(copito.g, 'copito', t);
    copito.g.position.copy(pl.p); copito.g.rotation.set(0, pl.yaw, 0, 'YXZ'); copito.g.rotation.x = pl.pitch;
    mallow.visible = t < 1.4;
    let pose = { blink: blinkAt(t, 1), mouth: mouthAt('copito', t) * 1.15, smile: 1, earWobble: .3, blush: .5 };
    if (t < 1.3) Object.assign(pose, { armR: [.9 + Math.sin(t * 3) * .1, -1.0], armL: [.3, -.2], look: [.3, .2], oMouth: .3, headX: .1 });
    else if (t < 4.0) {
      const jump = hop(t, 1.35, .45); copito.g.position.y += jump * .4;
      Object.assign(pose, { eyeBig: 1.2, raise: 1, oMouth: .6, armR: [lerp(.4, 1.5, sstep(1.6, 1.9, t)), lerp(0, -1.45, sstep(1.6, 1.9, t))], armL: [.3 + jump * 2, -.2], squash: -jump * .4, earWobble: .2, earSpread: -.15, look: [0, .1] });
      if (t < 2.6) pose.blink = 1;
    } else if (pl.mode === 'run') {
      const c = Math.sin(t * 15); copito.g.position.y += Math.abs(c) * .12;
      Object.assign(pose, { legL: c * .9, legR: -c * .9, armL: [.3, -c * .9], armR: [.3, c * .9], bodyX: .25, earBack: .9, earWobble: 1.3, oMouth: .3 });
    } else if (pl.mode === 'crater') {
      const concern = sstep(5.6, 6.2, t) * (1 - sstep(10.0, 10.4, t));
      Object.assign(pose, { sad: concern * .8, smile: lerp(1, -.4, concern), earSpread: concern * .5, look: [.4, -.3], armL: [.3, -.3], armR: [.3, -.3] });
      if (t > 10.0) { const reach = sstep(10.2, 10.7, t); copito.g.position.lerp(K.clone().add(V(-1.0, 0, .6)), reach); Object.assign(pose, { armR: [lerp(.3, 1.2, reach), lerp(-.3, -1.1, reach)], smile: 1, blush: .8, look: [.5, -.2] }); }
      if (t > 12.2) Object.assign(pose, { look: [.9, .2], eyeBig: 1.1 });
      if (t > 13.4) { const k = sstep(13.4, 13.8, t); Object.assign(pose, { headX: -.5 * k, look: [0, 1], oMouth: .6 * k, eyeBig: 1.15, armL: [1.5 * k, -.3], armR: [1.5 * k, -.3] }); }
    } else if (pl.mode === 'hopOn' || pl.mode === 'ride') {
      Object.assign(pose, { legL: -1.3, legR: -1.3, armL: [2.3 + Math.sin(t * 8) * .2, -.3], armR: [2.3 + Math.cos(t * 8) * .2, -.3], oMouth: .55, earBack: .9, earWobble: 1.5, look: [0, .3], blush: 1 });
    } else {
      Object.assign(pose, { look: [.4, .1] });
      const worry = sstep(20.2, 20.9, t) * (1 - sstep(22.9, 23.3, t));
      Object.assign(pose, { sad: worry * .8, smile: lerp(1, -.3, worry), earSpread: worry * .4, look: [.7, .2] });
      if (t > 23.0 && t < 24.6) { copito.g.rotation.y += .35; Object.assign(pose, { armR: [1.2, -.6], armL: [1.5, -.3], smile: 1, look: [.2, 0] }); }
      if (t > 24.6 && t < 26.3) { const h = sstep(24.6, 25.1, t); copito.g.position.addScaledVector(SIDE, .45 * h); copito.g.rotation.y += .7 * h; Object.assign(pose, { armL: [lerp(.3, 1.8, h), lerp(0, -1.3, h)], armR: [lerp(.3, 1.8, h), lerp(0, -1.3, h)], smile: 1, blush: 1, blink: t > 25.2 ? .1 : pose.blink }); }
      if (t > 26.3) { const wave = Math.sin(t * 9) * .3; Object.assign(pose, { headX: t < 31 ? -.45 : 0, look: [0, t < 31 ? .9 : 0], armR: [2.5 + wave, 0], armL: [1.3, -.2], oMouth: t < 31 ? .5 : 0, blush: 1, eyeBig: 1.05 }); const h = hop(t, 27.0, .45) + hop(t, 27.6, .45); copito.g.position.y += h * .3; }
      if (t > 31.1) Object.assign(pose, { armR: [1.35, -1.45], look: [0, 0] });
    }
    poseCritter(copito, t, pose);
  }
  // ---------- Monstruo
  {
    const pl = placeCritter(monster.g, 'monster', t);
    monster.g.position.copy(pl.p); monster.g.rotation.set(pl.pitch, pl.yaw, 0, 'YXZ');
    monster.P.swirlMat.uniforms.uTime.value = t;
    let mp = { blink: blinkAt(t, 4), mouth: mouthAt('monster', t) * 1.1, look: [0, 0], oMouth: .2 };
    if (t < 1.3) Object.assign(mp, { armL: [.6, -.5], armR: [.6, -.5], look: [0, -.2] });
    else if (t < 4.0) { const j = hop(t, 1.4, .45); monster.g.position.y += j * .45; Object.assign(mp, { eyeBig: .6, oMouth: .8, armL: [2.2, 0], armR: [2.2, 0], squash: -j * .4 }); }
    else if (pl.mode === 'run') { const c = Math.sin(t * 17); monster.g.position.y += Math.abs(c) * .1; Object.assign(mp, { legL: c * .9, legR: -c * .9, armL: [.9, c * .8], armR: [.9, -c * .8], bodyX: .15 }); }
    else if (pl.mode === 'crater') {
      Object.assign(mp, { sad: sstep(5.8, 6.4, t) * (1 - sstep(11.8, 12.2, t)) * .7, look: [-.5, -.2] });
      if (t > 12.2) { const j = hop(t, 12.25, .4); monster.g.position.y += j * .35; monster.g.rotation.y += sstep(12.6, 13.2, t) * .6; Object.assign(mp, { eyeBig: .4, oMouth: .5, armL: [2.0, 0], armR: [1.5, -.6], squash: -j * .3, look: [.2, .6] }); }
    } else if (pl.mode === 'hopOn' || pl.mode === 'ride') Object.assign(mp, { legL: -1.0, legR: -1.0, armL: [2.4, 0], armR: [2.4, 0], oMouth: .6, eyeBig: .3, look: [0, .4] });
    else {
      const worry = sstep(20.2, 20.9, t) * (1 - sstep(22.9, 23.4, t));
      Object.assign(mp, { sad: worry * .8, look: [-.6, .1] });
      if (t > 24.6 && t < 26.3) { const h = sstep(24.6, 25.1, t); monster.g.position.addScaledVector(SIDE, -.45 * h); monster.g.rotation.y -= .7 * h; Object.assign(mp, { armL: [1.7 * h, -1.2 * h], armR: [1.7 * h, -1.2 * h], blink: t > 25.2 ? .15 : mp.blink }); }
      if (t > 26.3) { const h = hop(t, 27.3, .45) + hop(t, 27.9, .45); monster.g.position.y += h * .35; Object.assign(mp, { armL: [2.4 + Math.sin(t * 9) * .3, 0], armR: [2.4, 0], oMouth: .6, eyeBig: .35, look: [0, t < 31 ? .9 : 0] }); }
    }
    poseMonster(monster, t, mp);
  }
  // ---------- Osito
  {
    const pl = placeCritter(bear.g, 'bear', t);
    bear.g.position.copy(pl.p); bear.g.rotation.set(0, pl.yaw, 0, 'YXZ'); bear.g.rotation.x = pl.pitch;
    let bp = { blink: blinkAt(t, 2), mouth: mouthAt('bear', t) * 1.2, smile: 1, look: [.2, 0] };
    if (t < 1.3) Object.assign(bp, { armL: [.8, -.6], armR: [.8, -.6], oMouth: .3 });
    else if (t < 4.0) { const j = hop(t, 1.3, .45); bear.g.position.y += j * .35; Object.assign(bp, { eyeBig: 1.25, raise: 1, oMouth: .8, armL: [2.4, 0], armR: [2.4, 0], squash: -j * .4 }); }
    else if (pl.mode === 'run') { const c = Math.sin(t * 16); bear.g.position.y += Math.abs(c) * .1; Object.assign(bp, { legL: c * .9, legR: -c * .9, armL: [.3, -c * .9], armR: [.3, c * .9], bodyX: .2 }); }
    else if (pl.mode === 'crater') Object.assign(bp, { sad: sstep(5.8, 6.4, t) * (1 - sstep(11.8, 12.2, t)) * .8, smile: t > 6 && t < 12 ? -.3 : 1, look: [0, -.3], eyeBig: t > 13.4 ? 1.15 : 1 });
    else if (pl.mode === 'hopOn' || pl.mode === 'ride') Object.assign(bp, { legL: -1.3, legR: -1.3, armL: [2.5, -.2], armR: [2.5, -.2], oMouth: .5, look: [0, .3], blush: 1 });
    else {
      Object.assign(bp, { sad: sstep(20.2, 20.9, t) * (1 - sstep(22.9, 23.4, t)) * .8, look: [0, .3] });
      if (t > 24.6 && t < 26.3) { const h = sstep(24.6, 25.1, t); bear.g.position.addScaledVector(FWD, .5 * h); Object.assign(bp, { armL: [1.7 * h, -1.2 * h], armR: [1.7 * h, -1.2 * h] }); }
      if (t > 26.3) Object.assign(bp, { armL: [2.4, 0], armR: [2.4 + Math.sin(t * 9) * .3, 0], oMouth: .5, look: [0, t < 31 ? .9 : 0], headX: t < 31 ? -.4 : 0 });
    }
    poseCritter(bear, t, bp);
  }

  // ---------- chispas
  let n = 0;
  const emit = (p, col, size) => { if (n >= SPARK_N) return; sPos[n * 3] = p.x; sPos[n * 3 + 1] = p.y; sPos[n * 3 + 2] = p.z; sCol.set(col, n * 3); sSize[n] = size; sSeed[n] = (n * .618) % 1; n++; };
  // luciérnagas
  for (let i = 0; i < 90; i++) {
    const r = RND[i]; const c = i < 45 ? M : K;
    emit(c.clone().add(V((r[0] - .5) * 9 + Math.sin(t * .6 + i) * .4, .3 + r[1] * 2.5 + Math.sin(t * .9 + i * 2) * .25, (r[2] - .5) * 7 + Math.cos(t * .5 + i) * .4)), [1, .85, .35], 3 + r[3] * 2);
  }
  // chispas de la fogata
  for (let i = 0; i < 40; i++) { const r = RND[100 + i]; const ph = (t * .8 + r[0]) % 1; emit(M.clone().add(V((r[1] - .5) * .4 + Math.sin(ph * 6 + i) * .1, .3 + ph * 2.2, (r[2] - .5) * .4)), [1, .6, .2], 3 * (1 - ph)); }
  // estela del meteorito
  if (t > .2 && t < 1.3) for (let i = 0; i < 260; i++) {
    const r = RND[200 + i]; const tb = .2 + i * .004; const age = t - tb; if (age < 0 || age > .8) continue;
    const p = starPosAt(tb).add(V((r[0] - .5) * .3, (r[1] - .5) * .3, (r[2] - .5) * .3));
    emit(p, i % 3 ? [1, .85, .4] : RAIN[i % 8], (10 + r[3] * 10) * (1 - age / .8));
  }
  // impacto
  if (t > 1.25 && t < 3.2) for (let i = 0; i < 400; i++) {
    const r = RND[600 + i]; const age = t - 1.25; const a = r[0] * 6.28, e = r[1] * 1.3;
    const spd = (2 + r[2] * 6) * (1 - Math.exp(-age * 3)) / 3 * 2;
    emit(K.clone().add(V(Math.cos(a) * Math.cos(e) * spd, Math.sin(e) * spd + .2 - age * age * 1.5, Math.sin(a) * Math.cos(e) * spd)), i % 2 ? [1, .85, .4] : RAIN[i % 8], (6 + r[3] * 8) * (1 - sstep(1.0, 1.9, age)));
  }
  // corriente del embudo al arcoíris
  if (t > 12.9 && t < 15.6) {
    const f = monster.P.funnel.getWorldPosition(new THREE.Vector3()); const target = K.clone().add(V(0, .5, 0));
    for (let i = 0; i < 300; i++) { const r = RND[1100 + i]; const k = ((t * 1.4 + r[0]) % 1); const p = f.clone().lerp(target, k); p.y += Math.sin(k * Math.PI) * 1.2; p.x += Math.sin(k * 10 + i) * .15; emit(p, RAIN[i % 8], 6 + r[1] * 5); }
  }
  // brillo en la punta del arcoíris mientras crece y estela del viaje
  const grow = rbMat.uniforms.uGrow.value;
  if (grow > .01 && grow < .999 && (t < 16.2 || t > 25.9)) { const tipP = rbCurve.getPointAt(clamp(grow)); for (let i = 0; i < 160; i++) { const r = RND[1500 + i]; emit(tipP.clone().add(V((r[0] - .5) * 2.4, (r[1] - .5) * 2, (r[2] - .5) * 2.4)), RAIN[i % 8], 6 + r[3] * 8); } }
  if (t > 16 && t < 20) for (let i = 0; i < 300; i++) { const r = RND[1700 + i]; const age = r[0] * .9; const pr = ridePos('bear', t - age).p; emit(pr.add(V((r[1] - .5) * 2, (r[2] - .5) + .3, (r[3] - .5) * 2)), RAIN[i % 8], (5 + r[4] * 6) * (1 - age / .9)); }
  // explosión de luz y abrazo
  if (t > 26.0 && t < 29.0) for (let i = 0; i < 400; i++) {
    const r = RND[2100 + i]; const age = t - 26.0; const a = r[0] * 6.28, e = (r[1] - .4) * 2;
    const spd = (2 + r[2] * 7) * (1 - Math.exp(-age * 2.5)) / 2.5 * 2;
    emit(TIPPOS.star.clone().add(V(Math.cos(a) * Math.cos(e) * spd, Math.sin(e) * spd, Math.sin(a) * Math.cos(e) * spd)), RAIN[i % 8], (5 + r[3] * 7) * (1 - sstep(1.5, 3, age)));
  }
  if (t > 26.3 && t < 29.6) for (let i = 0; i < 300; i++) { const r = RND[2600 + i]; const age = r[0] * .8; const p = starPosAt(t - age); emit(p.add(V((r[1] - .5) * .6, (r[2] - .5) * .6, (r[3] - .5) * .6)), RAIN[i % 8], (6 + r[4] * 6) * (1 - age / .8)); }
  // fuegos artificiales: corazón y estallidos
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), upv = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  if (t > 29.2) {
    const age = t - 29.2; const k = 1 - Math.exp(-age * 3); const fade = 1 - sstep(3.2, 5.2, age);
    for (let i = 0; i < 260; i++) {
      const th = i / 260 * 6.283; const hx = 16 * Math.pow(Math.sin(th), 3), hy = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th);
      const p = SKYHOME.clone().addScaledVector(right, hx * .2 * k).addScaledVector(upv, hy * .2 * k + 1.0 - age * .15);
      emit(p, i % 4 ? [1, .4, .65] : [1, .85, .4], (7 + 3 * Math.sin(i)) * fade);
    }
  }
  for (const [tb, off, col] of [[30.4, [-6, 2.5, -2], 0], [31.3, [6, 4, -3], 2], [32.3, [-4, 6, -4], 4], [33.2, [5, 1.5, -2], 6]]) {
    const age = t - tb; if (age < 0 || age > 2.2) continue;
    const c = SKYHOME.clone().addScaledVector(right, off[0]).addScaledVector(upv, off[1] - 3);
    for (let i = 0; i < 160; i++) { const r = RND[3000 + i]; const a = r[0] * 6.28, e = (r[1] - .5) * 3.1; const spd = (3 + r[2] * 2) * (1 - Math.exp(-age * 3)) / 3 * 2;
      emit(c.clone().add(V(Math.cos(a) * Math.cos(e) * spd, Math.sin(e) * spd - age * age * .8, Math.sin(a) * Math.cos(e) * spd)), RAIN[(col + (i % 2)) % 8], (6 + r[3] * 5) * (1 - sstep(1.2, 2.2, age))); }
  }
  sparkGeo.setDrawRange(0, n);
  for (const k of ['position', 'color', 'size', 'seed']) sparkGeo.attributes[k].needsUpdate = true;
  // humo del cráter
  for (let i = 0; i < SMOKE_N; i++) {
    const r = RND[5000 + i]; const ph = ((t * .25 + r[0]) % 1);
    if (t < 1.3 || t > 13.5) { m4.makeScale(0, 0, 0); smoke.setMatrixAt(i, m4); continue; }
    const p = K.clone().add(V((r[1] - .5) * 1.6 + ph * .5, .2 + ph * 3, (r[2] - .5) * 1.6));
    const s = (.06 + r[3] * .06) * (1 + ph * 2) * Math.sin(ph * Math.PI) * (1 - sstep(9, 12, t));
    m4.compose(p, q.identity(), V(s, s, s)); smoke.setMatrixAt(i, m4);
  }
  smoke.instanceMatrix.needsUpdate = true;
  drawHUD(t);
}

function renderAt(t) {
  update(t);
  renderer.setRenderTarget(null); renderer.autoClear = true;
  composer.render();
  renderer.autoClear = false; renderer.render(hudScene, hudCam);
}
await document.fonts.load('700 40px Fredoka');
window.renderAt = renderAt;
window.frameJPEG = (t, qq = .93) => { renderAt(t); return renderer.domElement.toDataURL('image/jpeg', qq); };
window.READY = true;
renderAt(+params.get('t') || 0);
