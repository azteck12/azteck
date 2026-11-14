// Copito — Episodio 4: "¡Los dulces cobraron vida!"
// Render determinista: window.renderAt(t). Personajes desde ../characters.js (idénticos a episodios anteriores).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, sstep, easeInOut, easeOutBack, pulse, V, rand, SPH, SPHlo, phys, MAT, mesh, CAP, stick, makeCritter, poseCritter, blinkAt, makeMonster, poseMonster } from '../characters.js';

const params = new URLSearchParams(location.search);
const W = +params.get('w') || 540, H = +params.get('h') || 960;
const TL = await (await fetch('../build/ep4_timeline.json')).json();
const R = rand(2024);
const mouthAt = (who, t) => { const a = TL.mouth[who]; if (!a) return 0; const f = t * TL.fps; const i = Math.floor(f); return lerp(a[i] || 0, a[i + 1] || 0, f - i); };
const hop = (t, t0, d = .5) => Math.max(0, Math.sin(clamp((t - t0) / d) * Math.PI));

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, .05, 2000);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .45, .5, .95); composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ cielo de día
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vDir; uniform float uTime;
    float hash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float fbm(vec3 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=.5; } return v; }
    void main(){ vec3 d=normalize(vDir); float h=d.y;
      vec3 col = mix(vec3(.75,.9,1.), vec3(.22,.55,1.), smoothstep(-.05,.6,h));
      vec3 sun = normalize(vec3(-.4,.45,-.8)); float s = max(dot(d,sun),0.);
      col += vec3(1.,.85,.6)*pow(s,8.)*.5 + vec3(1.,.95,.8)*pow(s,200.)*3.;
      vec2 uv = d.xz/(h+.12); float cl = fbm(vec3(uv*1.6 + vec2(uTime*.02,0.), 1.));
      float cm = smoothstep(.5,.75,cl)*smoothstep(.0,.25,h);
      col = mix(col, vec3(1.)*(.92+.08*fbm(vec3(uv*4.,2.))), cm*.9);
      gl_FragColor = vec4(col,1.); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat); scene.add(sky);

// ------------------------------------------------------------------ luces
const hemi = new THREE.HemisphereLight('#bfe3ff', '#5a8a3a', 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d6', 3.0); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: .5, far: 60 });
sun.shadow.bias = -.0004; sun.shadow.radius = 3; scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight('#ffd9f0', 1.4); scene.add(rim, rim.target);
const magicLight = new THREE.PointLight('#ffffff', 0, 25, 1.3); scene.add(magicLight);

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

// ------------------------------------------------------------------ el bosque termina donde empieza el mundo de dulces
const CANDY_X = 21;
{
  const kill = [];
  forest.children.forEach((c) => { if (c.isGroup && c.position.x > CANDY_X) kill.push(c); });
  kill.forEach((c) => forest.remove(c));
  forest.children.forEach((c) => {
    if (!c.isInstancedMesh) return;
    const mm = new THREE.Matrix4(), p = new THREE.Vector3();
    for (let i = 0; i < c.count; i++) { c.getMatrixAt(i, mm); p.setFromMatrixPosition(mm); if (p.x > CANDY_X - .5) { mm.makeScale(0, 0, 0); c.setMatrixAt(i, mm); } }
    c.instanceMatrix.needsUpdate = true;
  });
}
// suelo de dulce (rosa y menta)
const candy = new THREE.Group(); scene.add(candy);
{
  const g = new THREE.PlaneGeometry(90, 90, 180, 180); g.rotateX(-Math.PI / 2); g.translate(CANDY_X + 45, .015, 0);
  const pos = g.attributes.position; const cols = [];
  const pink = new THREE.Color('#ffc2dd'), mint = new THREE.Color('#b8f2dc'), choco = new THREE.Color('#8a5232');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = sstep(CANDY_X, CANDY_X + 3, x);
    const sw = .5 + .5 * Math.sin(x * .35 + Math.sin(z * .3) * 2);
    const choc = (x > 53 && x < 62) ? sstep(1.6, 1.0, Math.abs(z)) : 0;
    const c = pink.clone().lerp(mint, sw * .7).lerp(choco, choc);
    pos.setY(i, Math.abs(z) > 10 ? (Math.sin(x * .2) * Math.cos(z * .15) * 1.5 + 1.2) * sstep(10, 25, Math.abs(z)) : .015);
    cols.push(c.r, c.g, c.b, edge);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, transparent: true }));
  ground.receiveShadow = true; candy.add(ground);
  // chispitas de colores
  const N = 1600; const spr = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.025, .08, 3, 6), new THREE.MeshStandardMaterial({ roughness: .4 }), N);
  const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    const x = CANDY_X + 2 + R() * 60, z = (R() - .5) * 20; ee.set(Math.PI / 2, R() * 6.3, 0); qq.setFromEuler(ee);
    mm.compose(V(x, .03, z), qq, V(1, 1, 1)); spr.setMatrixAt(i, mm); spr.setColorAt(i, new THREE.Color(PALETTE[i % 8]));
  }
  candy.add(spr);
  // montañas de chocolate con glaseado
  const chocM = phys('#6b3a1f', { roughness: .25, clearcoat: 1, clearcoatRoughness: .2 });
  const icing = phys('#fff4f8', { roughness: .4, clearcoat: .6 });
  for (const [x, z, s] of [[30, -9, 4], [37, -12, 6], [46, -10, 5], [52, -13, 6.5], [33, 11, 4.5], [41, 13, 6], [50, 11, 5], [58, 12, 5.5], [72, -12, 7], [76, 8, 6]]) {
    const mt = new THREE.Group(); mt.position.set(x, 0, z); candy.add(mt);
    mt.add(mesh(new THREE.ConeGeometry(s * .8, s * 1.1, 32), chocM, [0, s * .55, 0]));
    mt.add(mesh(SPH, icing, [0, s * 1.0, 0], [s * .28, s * .16, s * .28]));
    for (let k = 0; k < 5; k++) { const a = k * 1.26; mt.add(mesh(SPHlo, icing, [Math.cos(a) * s * .22, s * .92, Math.sin(a) * s * .22], s * .09)); }
  }
  // piruletas gigantes
  const swirl = new THREE.ShaderMaterial({
    uniforms: { c1: { value: new THREE.Color('#ff3b7a') }, c2: { value: new THREE.Color('#fff4f8') } },
    vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vP; uniform vec3 c1,c2; void main(){ float r=length(vP), a=atan(vP.y,vP.x); float s=step(.5,fract(a/6.2832*3.+r*2.2)); gl_FragColor=vec4(mix(c1,c2,s)*.95,1.); }`,
  });
  const pops = [['#ff3b7a', '#fff4f8'], ['#3bb4ff', '#fff4f8'], ['#7bdc4a', '#ffe14d'], ['#a67bff', '#fff4f8'], ['#ffb02e', '#ff5b5b']];
  [[27, -4.2, 3.6], [31, 4.6, 4.4], [36, -5.0, 4.0], [40, 5.2, 4.8], [49, -4.6, 4.2], [55, 7.5, 4.6], [58, -4.4, 3.8], [69, -2.5, 5], [59, 8.0, 4]].forEach(([x, z, h], i) => {
    const lp = new THREE.Group(); lp.position.set(x, 0, z); candy.add(lp);
    lp.add(mesh(new THREE.CylinderGeometry(.09, .09, h, 12).translate(0, h / 2, 0), phys('#ffffff', { roughness: .3 })));
    const m = swirl.clone(); m.uniforms.c1.value = new THREE.Color(pops[i % 5][0]); m.uniforms.c2.value = new THREE.Color(pops[i % 5][1]);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), m); disc.position.y = h + .9; lp.add(disc);
    const back = disc.clone(); back.rotation.y = Math.PI; back.position.z = -.12; lp.add(back);
    lp.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, .12, 48), phys(pops[i % 5][0], { roughness: .2, clearcoat: 1 }), [0, h + .9, -.06], 1, [Math.PI / 2, 0, 0]));
    lp.rotation.y = Math.atan2(-x + 40, 10) * .3;
  });
  // bastones de caramelo
  const stripe = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vP; void main(){ vP=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.); }`,
    fragmentShader: `varying vec3 vP; void main(){ float s=step(.5,fract((vP.y+vP.x*.5+vP.z*.5)*2.2)); gl_FragColor=vec4(mix(vec3(1.,.15,.25),vec3(1.),s),1.); }`,
  });
  for (const [x, z, h, ry] of [[33, -6.5, 3.5, .5], [44, 6.8, 4, -.6], [61, -6.2, 3.8, .9], [26, 6.5, 3, -.2]]) {
    const cc = new THREE.Group(); cc.position.set(x, 0, z); cc.rotation.y = ry; candy.add(cc);
    cc.add(mesh(new THREE.CylinderGeometry(.18, .18, h, 16).translate(0, h / 2, 0), stripe));
    cc.add(mesh(new THREE.TorusGeometry(.5, .18, 12, 24, Math.PI), stripe, [.5, h, 0]));
  }
  // gomitas (gumdrops) decorativas
  const gd = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 10, 0, 6.29, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ roughness: .5, clearcoat: .5 }), 70);
  for (let i = 0; i < 70; i++) {
    const x = CANDY_X + 3 + R() * 55, z = (R() < .5 ? -1 : 1) * (2.2 + R() * 6); const s = .25 + R() * .3;
    mm.compose(V(x, 0, z), qq.identity(), V(s, s * 1.1, s)); gd.setMatrixAt(i, mm); gd.setColorAt(i, new THREE.Color(PALETTE[i % 8]));
  }
  candy.add(gd);
}
// río de gelatina (cruza el camino)
const JELLY_X = 44;
const jelly = mesh(new RoundedBoxGeometry(2.6, .35, 40, 3, .12), new THREE.MeshPhysicalMaterial({ color: '#4dff9a', roughness: .1, transparent: true, opacity: .72, clearcoat: 1, emissive: '#0d8a44', emissiveIntensity: .35 }), [JELLY_X, .12, 0]);
jelly.castShadow = false; scene.add(jelly);
// río de chocolate (tobogán hacia la plaza)
const chocRiver = mesh(new RoundedBoxGeometry(9, .12, 2.6, 3, .05), phys('#5a2e14', { roughness: .12, clearcoat: 1 }), [57.5, .06, 0]);
chocRiver.castShadow = false; scene.add(chocRiver);

// ------------------------------------------------------------------ fábrica de dulces
const F = V(64, 0, -5.5), P = F.clone().add(V(0, 0, 7.5));
const factory = new THREE.Group(); factory.position.copy(F); scene.add(factory);
const wallM = phys('#ff8fc7', { roughness: .55, sheen: .5, sheenColor: new THREE.Color('#ffffff') });
const factoryMats = [wallM];
{
  factory.add(mesh(new RoundedBoxGeometry(12, 8, 7, 5, .4), wallM, [0, 4, 0]));
  const frost = phys('#fffaf2', { roughness: .45, clearcoat: .5 });
  for (let i = 0; i <= 12; i++) { factory.add(mesh(SPHlo, frost, [-6 + i, 8.05, 3.5], [.55, .4, .3])); factory.add(mesh(SPHlo, frost, [-6 + i, 8.05, -3.5], [.55, .4, .3])); }
  factory.add(mesh(new RoundedBoxGeometry(12.4, .5, 7.4, 3, .2), frost, [0, 8.2, 0]));
  // torres rayadas con techos de cono
  const towerM = phys('#7fd6ff', { roughness: .5 }); factoryMats.push(towerM);
  const roofM = phys('#ff4d6d', { roughness: .35, clearcoat: .6 }); factoryMats.push(roofM);
  for (const s of [-1, 1]) {
    factory.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, 11, 28).translate(0, 5.5, 0), towerM, [s * 6.6, 0, 1]));
    factory.add(mesh(new THREE.ConeGeometry(2.1, 3.2, 28), roofM, [s * 6.6, 12.6, 1]));
    factory.add(mesh(SPH, phys('#ffd23f', { roughness: .3, clearcoat: 1 }), [s * 6.6, 14.4, 1], .35));
    for (let k = 0; k < 4; k++) factory.add(mesh(new THREE.TorusGeometry(1.75, .12, 8, 28), frost, [s * 6.6, 2.5 + k * 2.4, 1], 1, [Math.PI / 2, 0, 0]));
  }
  // ventanas redondas
  const winM = new THREE.MeshStandardMaterial({ color: '#fff0a8', emissive: '#ffcf4d', emissiveIntensity: 1.6 });
  for (const [x, y] of [[-3.6, 5.6], [-1.2, 6.2], [1.2, 6.2], [3.6, 5.6]]) {
    factory.add(mesh(new THREE.CircleGeometry(.6, 28), winM, [x, y, 3.52]));
    factory.add(mesh(new THREE.TorusGeometry(.62, .1, 8, 28), frost, [x, y, 3.55]));
  }
  // chimeneas-piruleta
  for (const [x, z] of [[-3, -1.5], [2.5, -2]]) factory.add(mesh(new THREE.CylinderGeometry(.5, .6, 3, 18).translate(0, 1.5, 0), roofM, [x, 8.3, z]));
  // letrero
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#ffd23f'; c.beginPath(); c.roundRect(10, 10, 1004, 236, 110); c.fill(); c.lineWidth = 16; c.strokeStyle = '#7a2c5a'; c.stroke();
  c.fillStyle = '#7a2c5a'; c.font = '700 120px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DULCES', 512, 136);
  var signTex = new THREE.CanvasTexture(cv); signTex.colorSpace = THREE.SRGBColorSpace;
  factory.add(mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshStandardMaterial({ map: signTex, roughness: .5 }), [0, 7.4, 3.6]));
  // marco de la puerta
  factory.add(mesh(new THREE.TorusGeometry(2.0, .25, 10, 32, Math.PI), frost, [0, 3.2, 3.55]));
  factory.add(mesh(new RoundedBoxGeometry(4.2, 4.8, .2, 2, .08), phys('#3a1a2e'), [0, 2.4, 3.42]));
}
const doors = [-1, 1].map((s) => {
  const pv = new THREE.Group(); pv.position.copy(F).add(V(s * 2.0, 0, 3.6)); scene.add(pv);
  pv.add(mesh(new RoundedBoxGeometry(2.0, 4.6, .18, 2, .06), phys('#c94b8a', { roughness: .4 }), [-s * 1.0, 2.3, 0]));
  pv.add(mesh(SPH, phys('#ffd23f', { metalness: .5, roughness: .3 }), [-s * 1.75, 2.3, .14], .12));
  return { pv, s };
});
// noria de caramelo (aparece con la magia)
const wheel = new THREE.Group(); wheel.position.copy(F).add(V(11, 0, 1)); scene.add(wheel);
const wheelSpin = new THREE.Group(); wheelSpin.position.y = 6; wheel.add(wheelSpin);
{
  wheel.add(stick(V(-1.2, 0, 0), V(0, 6, 0), .15, phys('#ffffff')), stick(V(1.2, 0, 0), V(0, 6, 0), .15, phys('#ffffff')));
  wheelSpin.add(mesh(new THREE.TorusGeometry(4, .16, 10, 64), phys('#ff4d6d', { roughness: .3, clearcoat: 1 })));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 6.283; wheelSpin.add(stick(V(0, 0, 0), V(Math.cos(a) * 4, Math.sin(a) * 4, 0), .06, phys('#ffd23f')));
    const cab = mesh(SPH, phys(PALETTE[i], { roughness: .3, clearcoat: 1 }), [Math.cos(a) * 4, Math.sin(a) * 4 - .5, 0], [.45, .4, .45]); cab.userData.a = a; wheelSpin.add(cab);
  }
}
// globos de fiesta
const partyBalloons = [];
for (let i = 0; i < 14; i++) {
  const b = new THREE.Group(); const x = F.x - 7 + (i % 7) * 2.3, z = F.z + 4 + Math.floor(i / 7) * 5.5;
  b.position.set(x, 0, z); const h = 3 + (i % 3);
  b.add(stick(V(0, 0, 0), V(0, h, 0), .01, new THREE.MeshStandardMaterial({ color: '#dddddd' })));
  b.add(mesh(SPH, phys(PALETTE[i % 8], { roughness: .15, clearcoat: 1 }), [0, h + .35, 0], [.35, .42, .35]));
  scene.add(b); partyBalloons.push(b);
}

// ------------------------------------------------------------------ personajes
const copito = makeCritter({ kind: 'bunny', fur: MAT.fur, inner: MAT.pink, iris: MAT.irisBlue, brow: MAT.browBunny, overall: true });
scene.add(copito.g);
const monster = makeMonster(); scene.add(monster.g);
{ const P_ = monster.P; P_.bodyPurple.visible = false; P_.bodyRainbow.visible = true; P_.dots.forEach((d) => (d.visible = true)); P_.spots.forEach((s) => (s.visible = false)); P_.swirlMat.uniforms.uFill.value = .55; }

// Rey Caramelo
function makeKing() {
  const g = new THREE.Group(); const P = { eyes: [], arms: [], legs: [], brows: [], tears: [] };
  const root = new THREE.Group(); g.add(root); P.root = root;
  const bodyGeo = new THREE.SphereGeometry(1, 48, 32); const cols = []; const pa = bodyGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const sp = Math.sin((Math.atan2(z, x) * 3 + y * 6)); const c = new THREE.Color('#ffae3b').lerp(new THREE.Color('#fff1c9'), sp > .55 ? .85 : 0); cols.push(c.r, c.g, c.b); }
  bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const caramel = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .2, clearcoat: 1, clearcoatRoughness: .1, sheen: .3 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * .35, .22, 0); root.add(leg); P.legs.push(leg);
    leg.add(mesh(SPH, phys('#c9712a', { roughness: .4 }), [0, -.1, .1], [.2, .13, .28]));
  }
  const body = new THREE.Group(); root.add(body); P.body = body;
  body.add(mesh(bodyGeo, caramel, [0, 1.05, 0], [.9, .85, .8]));
  // envoltura retorcida a los lados
  const wrapM = new THREE.MeshPhysicalMaterial({ color: '#ff4d6d', roughness: .2, transparent: true, opacity: .85, clearcoat: 1, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    body.add(mesh(new THREE.ConeGeometry(.45, .7, 12, 1, true), wrapM, [s * 1.15, 1.05, 0], 1, [0, 0, s * Math.PI / 2]));
    body.add(mesh(new THREE.TorusGeometry(.1, .05, 8, 16), wrapM, [s * .86, 1.05, 0], 1, [0, Math.PI / 2, 0]));
  }
  // capa real
  body.add(mesh(new THREE.SphereGeometry(1, 32, 16, Math.PI * 1.15, Math.PI * .7, .3, 1.6), phys('#b5179e', { roughness: .6, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color('#ff9de2') }), [0, 1.15, -.05], [1.0, 1.05, .95]));
  // corona gigante
  const crown = new THREE.Group(); crown.position.set(0, 1.85, 0); body.add(crown); P.crown = crown;
  const gold = phys('#ffd23f', { metalness: .8, roughness: .2, clearcoat: 1 });
  crown.add(mesh(new THREE.CylinderGeometry(.55, .5, .35, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffd23f', metalness: .8, roughness: .2, side: THREE.DoubleSide })));
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * 6.283; crown.add(mesh(new THREE.ConeGeometry(.12, .42, 10), gold, [Math.sin(a) * .52, .36, Math.cos(a) * .52]));
    crown.add(mesh(SPH, phys(PALETTE[i], { roughness: .1, clearcoat: 1, emissive: PALETTE[i], emissiveIntensity: .3 }), [Math.sin(a) * .54, .05, Math.cos(a) * .54], .07));
    crown.add(mesh(SPH, gold, [Math.sin(a) * .52, .6, Math.cos(a) * .52], .06));
  }
  // ojos grandes
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * .3, 1.32, .66); eg.rotation.y = s * .3; body.add(eg);
    eg.add(mesh(SPH, MAT.sclera, [0, 0, 0], [.2, .24, .12]));
    const ig = new THREE.Group(); ig.position.z = .07; eg.add(ig);
    ig.add(mesh(SPH, phys('#6b3a1f', { roughness: .15, clearcoat: 1 }), [0, 0, .03], [.14, .16, .06]));
    ig.add(mesh(SPH, MAT.pupil, [0, 0, .06], [.08, .09, .04]));
    const h1 = new THREE.Mesh(SPH, MAT.hl); h1.position.set(.05, .06, .1); h1.scale.setScalar(.045); ig.add(h1);
    const lid = mesh(new THREE.SphereGeometry(1, 24, 12, 0, 6.29, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#ffae3b', roughness: .2, clearcoat: 1 }), [0, 0, 0], [.21, .25, .13]);
    lid.rotation.x = -1.75; eg.add(lid);
    P.eyes.push({ eg, ig, lid });
    const br = mesh(CAP, phys('#5a2e14'), [s * .3, 1.62, .7], [.04, .11, .04], [0, 0, Math.PI / 2]); body.add(br); P.brows.push(br);
  }
  // bigote y boca
  for (const s of [-1, 1]) body.add(mesh(SPH, phys('#5a2e14', { roughness: .4 }), [s * .14, 1.0, .82], [.16, .06, .06], [0, 0, -s * .3]));
  P.mouth = mesh(SPH, MAT.mouth, [0, .86, .76], [.18, .05, .06]); body.add(P.mouth);
  P.smile = mesh(new THREE.TorusGeometry(.14, .025, 8, 24, Math.PI), MAT.line, [0, .9, .78], 1, [-.2, 0, Math.PI]); body.add(P.smile);
  for (const s of [-1, 1]) {
    const ag = new THREE.Group(); ag.position.set(s * .82, 1.0, .1); body.add(ag); P.arms.push(ag);
    ag.add(mesh(CAP, phys('#e08a2e', { roughness: .3, clearcoat: .6 }), [0, -.25, 0], [.11, .17, .11]));
    ag.add(mesh(SPH, phys('#ffffff', { roughness: .6 }), [0, -.52, 0], .14));
  }
  const tearMat = new THREE.MeshPhysicalMaterial({ color: '#8fd8ff', roughness: .05, transparent: true, opacity: .9, emissive: '#3aa0ff', emissiveIntensity: .5 });
  for (let i = 0; i < 6; i++) { const tm = mesh(SPH, tearMat, [0, 0, 0], .04); body.add(tm); P.tears.push(tm); }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { g, P };
}
function poseKing(k, t, p) {
  const P = k.P; const br = Math.sin(t * 2.2) * .015;
  P.root.scale.set(1 + (p.squash || 0) * .15, 1 - (p.squash || 0) * .2 + br, 1 + (p.squash || 0) * .15);
  P.body.rotation.set(p.bodyX || 0, p.bodyY || 0, p.bodyZ || 0);
  const [al, ar] = [p.armL || [0, 0], p.armR || [0, 0]];
  P.arms[0].rotation.set(al[1], 0, -.3 - al[0]); P.arms[1].rotation.set(ar[1], 0, .3 + ar[0]);
  P.legs[0].rotation.x = p.legL || 0; P.legs[1].rotation.x = p.legR || 0;
  const [lx, ly] = p.look || [0, 0];
  P.eyes.forEach((e, i) => { e.ig.position.x = lx * .04; e.ig.position.y = ly * .05; e.lid.rotation.x = lerp(-1.75, -.05, 1 - (p.blink ?? 1)) + (p.sad || 0) * .5 + (p.angry || 0) * .45; e.lid.rotation.z = (i ? 1 : -1) * ((p.sad || 0) * .4 - (p.angry || 0) * .4); e.eg.scale.setScalar(1 + (p.eyeBig || 0) * .25); });
  P.brows.forEach((b, i) => { const s = i ? 1 : -1; b.rotation.z = Math.PI / 2 - s * (p.sad || 0) * .5 + s * (p.angry || 0) * .5; b.position.y = 1.62 + (p.raise || 0) * .1; });
  const m = Math.max(p.mouth || 0, p.oMouth || 0);
  P.mouth.visible = m > .03; P.mouth.scale.set(.16 + m * .04, .03 + m * .12, .06);
  const smile = p.smile ?? 1; P.smile.scale.set(1, -smile + .001, 1); P.smile.visible = !P.mouth.visible || m < .3;
  P.crown.rotation.z = Math.sin(t * 3) * .04 * (p.crownWobble || 1);
  P.tears.forEach((tm, i) => { const e = P.eyes[i % 2]; const ph = (t * 1.1 + i * .33) % 1; tm.visible = (p.cry || 0) > .2; tm.position.set(e.eg.position.x + (i % 2 ? .1 : -.1), e.eg.position.y - .22 - ph * .55, e.eg.position.z + .08); tm.scale.set(.04 * (p.cry || 0), .055 * (p.cry || 0), .04 * (p.cry || 0)); });
}
const king = makeKing(); king.g.scale.setScalar(1.25); scene.add(king.g);
const KING = P.clone().add(V(0, 0, .3));

// ejército de dulces (instanciado: gomitas, chocolates y caramelos)
const MIN_N = 120;
const gummyGeo = mergeGeometries([
  new THREE.SphereGeometry(1, 16, 12).scale(.22, .26, .19).translate(0, .3, 0), new THREE.SphereGeometry(1, 16, 12).scale(.17, .16, .15).translate(0, .64, 0),
  new THREE.SphereGeometry(1, 10, 8).scale(.06, .06, .05).translate(.11, .78, 0), new THREE.SphereGeometry(1, 10, 8).scale(.06, .06, .05).translate(-.11, .78, 0),
  new THREE.SphereGeometry(1, 10, 8).scale(.07, .09, .07).translate(.2, .38, .05), new THREE.SphereGeometry(1, 10, 8).scale(.07, .09, .07).translate(-.2, .38, .05),
  new THREE.SphereGeometry(1, 10, 8).scale(.08, .07, .09).translate(.1, .06, .03), new THREE.SphereGeometry(1, 10, 8).scale(.08, .07, .09).translate(-.1, .06, .03),
]);
const chocoGeo = mergeGeometries([new RoundedBoxGeometry(.46, .5, .26, 3, .08).translate(0, .33, 0), new THREE.BoxGeometry(.3, .03, .2).translate(0, .52, .04)].map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }));
const caramelGeo = mergeGeometries([new THREE.SphereGeometry(.24, 16, 12).translate(0, .32, 0), new THREE.ConeGeometry(.12, .2, 10).rotateZ(Math.PI / 2).translate(.33, .32, 0), new THREE.ConeGeometry(.12, .2, 10).rotateZ(-Math.PI / 2).translate(-.33, .32, 0)].map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }));
const MTYPES = [
  { geo: gummyGeo, mat: new THREE.MeshPhysicalMaterial({ roughness: .15, clearcoat: 1, transparent: true, opacity: .88, sheen: .4 }), cols: ['#ff3b5c', '#ffb02e', '#7bdc4a', '#3bb4ff', '#ffe14d'], eyeY: .66, eyeZ: .14, eyeX: .065 },
  { geo: chocoGeo, mat: phys('#6b3a1f', { roughness: .25, clearcoat: 1 }), cols: ['#6b3a1f', '#8a5232', '#4a2412', '#f3e6d8'], eyeY: .42, eyeZ: .14, eyeX: .09 },
  { geo: caramelGeo, mat: phys('#ffffff', { roughness: .15, clearcoat: 1 }), cols: ['#ff5fa2', '#a67bff', '#2fd0c9', '#ffd23f', '#ff7a3d'], eyeY: .36, eyeZ: .22, eyeX: .075 },
];
const minionMeshes = MTYPES.map((ty) => { const im = new THREE.InstancedMesh(ty.geo, ty.mat, MIN_N / 3); im.castShadow = true; im.frustumCulled = false; scene.add(im); for (let i = 0; i < MIN_N / 3; i++) im.setColorAt(i, new THREE.Color(ty.cols[i % ty.cols.length])); return im; });
const eyeWhite = new THREE.InstancedMesh(SPHlo, MAT.sclera, MIN_N * 2), eyePupil = new THREE.InstancedMesh(SPHlo, MAT.pupil, MIN_N * 2);
eyeWhite.frustumCulled = eyePupil.frustumCulled = false; scene.add(eyeWhite, eyePupil);
const MSEED = Array.from({ length: MIN_N }, () => [R(), R(), R(), R()]);

// dragón de chocolate (solo su silueta al final)
const dragon = new THREE.Group(); dragon.position.copy(F).add(V(.5, -10, -6)); scene.add(dragon);
const dragonEyes = [];
{
  const dc = phys('#3a1d0e', { roughness: .35, clearcoat: .7, clearcoatRoughness: .3 });
  dragon.add(mesh(new THREE.CylinderGeometry(2.0, 2.8, 10, 24).translate(0, -3, 0), dc));
  dragon.add(mesh(SPH, dc, [0, 3, 0], [3.2, 2.7, 2.8]));
  dragon.add(mesh(SPH, dc, [0, 2.2, 2.6], [2.0, 1.4, 1.9]));
  for (const s of [-1, 1]) {
    dragon.add(mesh(new THREE.ConeGeometry(.55, 2.6, 14), phys('#f3e6d8', { roughness: .4 }), [s * 1.9, 5.5, -.4], 1, [-.4, 0, -s * .5]));
    const e = mesh(SPH, new THREE.MeshStandardMaterial({ color: '#ffb02e', emissive: '#ff6a00', emissiveIntensity: 3 }), [s * 1.15, 3.7, 2.62], [.55, .34, .3]);
    e.rotation.z = s * .3; dragon.add(e); dragonEyes.push(e);
    dragon.add(mesh(SPHlo, MAT.pupil, [s * .55, 2.5, 4.4], [.18, .12, .1]));
    dragon.add(mesh(CAP, dc, [s * 1.15, 4.3, 2.55], [.14, .6, .14], [0, 0, Math.PI / 2 + s * .4]));
  }
  for (let i = 0; i < 5; i++) dragon.add(mesh(new THREE.ConeGeometry(.35, .9, 10), phys('#6b3a1f'), [0, 5.3 - i * .1, -1.2 - i * .8], 1, [-.5, 0, 0]));
}
const shadowMat = new THREE.MeshBasicMaterial({ color: '#1a0a14', transparent: true, opacity: 0, depthWrite: false });
const bigShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), shadowMat); bigShadow.rotation.x = -Math.PI / 2; scene.add(bigShadow);

// caramelo volador del principio
const flyer = new THREE.Group(); scene.add(flyer);
flyer.add(mesh(new THREE.SphereGeometry(.9, 32, 20), phys('#ff3b7a', { roughness: .15, clearcoat: 1 })));
for (const s of [-1, 1]) flyer.add(mesh(new THREE.ConeGeometry(.55, .9, 14, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffd23f', roughness: .2, clearcoat: 1, side: THREE.DoubleSide, transparent: true, opacity: .9 }), [s * 1.2, 0, 0], 1, [0, 0, s * Math.PI / 2]));
flyer.add(mesh(new THREE.TorusGeometry(.9, .1, 8, 32), phys('#ffffff'), [0, 0, 0], 1, [0, Math.PI / 2, 0]));

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
const CONF_N = 400;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(.08, .12), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .5, emissive: '#222' }), CONF_N);
for (let i = 0; i < CONF_N; i++) confetti.setColorAt(i, new THREE.Color(PALETTE[i % 8]));
confetti.frustumCulled = false; scene.add(confetti);
// dulces lanzados al aire por el rey
const TOSS_N = 60;
const tossed = new THREE.InstancedMesh(caramelGeo, phys('#ffffff', { roughness: .15, clearcoat: 1 }), TOSS_N);
for (let i = 0; i < TOSS_N; i++) tossed.setColorAt(i, new THREE.Color(PALETTE[i % 8]));
tossed.frustumCulled = false; scene.add(tossed);

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
  const endA = sstep(34.35, 34.6, t);
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
    const rows = [['¡LOS', 'DULCES'], ['COBRARON'], ['VIDA!']];
    const sizes = [120, 116, 150];
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
    const base = { monster: ['#d6b3ff', '#b6ff8a', '#ffd84d'], king: ['#ffcf6e', '#ffe9a8', '#ffcf6e'], dragon: ['#ff8a4a', '#ffb07a', '#ff8a4a'], gummy: ['#ff9ad5', '#ffc2e6', '#ff9ad5'] }[line.who] || ['#ffffff', '#ffffff', '#ffffff'];
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
    hc.save(); hc.globalAlpha = endA; const s = .8 + .2 * easeOutBack(clamp((t - 34.35) / .3));
    hc.translate(W / 2, H * .2); hc.scale(s, s); hc.textAlign = 'center';
    outlined('COPITO', -60 * u, 0, Math.round(150 * u), '#ffffff', .2);
    hc.font = `700 ${Math.round(150 * u)}px Fredoka`; const cw2 = hc.measureText('COPITO').width;
    const bx = -60 * u + cw2 / 2 + 22 * u; hc.save(); hc.translate(bx + 70 * u, 0); hc.rotate(-.06);
    hc.beginPath(); hc.roundRect(-70 * u, -58 * u, 140 * u, 116 * u, 28 * u); hc.fillStyle = '#ffd84d'; hc.fill(); hc.lineWidth = 10 * u; hc.strokeStyle = INK; hc.stroke();
    hc.fillStyle = INK; hc.font = `700 ${Math.round(90 * u)}px Fredoka`; hc.fillText('TV', 0, 6 * u); hc.restore();
    hc.beginPath(); hc.roundRect(-300 * u, 105 * u, 600 * u, 110 * u, 55 * u); hc.fillStyle = '#ff2d4a'; hc.fill(); hc.lineWidth = 9 * u; hc.strokeStyle = '#ffffff'; hc.stroke();
    hc.fillStyle = '#ffffff'; hc.font = `700 ${Math.round(66 * u)}px Fredoka`; hc.fillText('¡CONTINUARÁ!', 0, 162 * u);
    for (const [x, y, r] of [[-360, -40, 34], [380, -60, 28]]) { starPath(x * u, y * u, r * u); hc.fillStyle = '#ffd84d'; hc.lineWidth = 7 * u; hc.strokeStyle = INK; hc.stroke(); hc.fill(); }
    hc.restore();
  }
  hudTex.needsUpdate = true;
}



// ------------------------------------------------------------------ trayectorias
const copX = (t) => 26 + 8.0 * (t - 11.8);              // persecución
const LAND = P.clone().add(V(-.3, 0, 2.6));               // donde cae Copito frente al rey
const MON_PLAZA = P.clone().add(V(1.9, 0, 3.4));
function minionState(i, t) {
  // devuelve posición, rotación y salto de cada dulce
  const [r0, r1, r2, r3] = MSEED[i];
  const door = F.clone().add(V((r0 - .5) * 2.5, 0, 3.8));
  const ringA = -Math.PI * (.08 + .84 * ((i * .618) % 1)); const ringR = 3.6 + r1 * 3.2;
  const slot = P.clone().add(V(Math.cos(ringA) * ringR * 1.25, 0, Math.sin(ringA) * ringR * .55 + .4));
  const te = 5.5 + (i / MIN_N) * 3.0;
  let p, yaw = 0, jump = 0, scale = 1;
  if (t < te) { p = door.clone().add(V(0, 0, -2)); scale = 0; }
  else if (t < 11.6 || (i % 2 === 1 && t < 15.2)) { const k = clamp((t - te) / 1.2); p = door.clone().lerp(slot, easeInOut(k)); yaw = k < 1 ? Math.atan2(slot.x - door.x, slot.z - door.z) : 0; jump = Math.abs(Math.sin((t + r2) * 9)) * .15 * (k < 1 ? 1 : .3); }
  else if (t < 15.2) { // la mitad persigue a Copito
    const x = copX(t) - 2.6 - (i % 20) * .32 - r1 * .5; p = V(x, 0, (r2 - .5) * 3.2); yaw = Math.PI / 2; jump = Math.abs(Math.sin((t + r3) * 12)) * .25;
    if (Math.abs(x - JELLY_X) < 1.4) jump += .6;
  } else { // rodean la plaza
    const k = clamp((t - 15.2) / 1.0); const from = i % 2 ? slot : V(copX(15.2) - 3 - (i % 20) * .3, 0, (r2 - .5) * 3);
    p = from.clone().lerp(slot, easeInOut(k)); yaw = Math.atan2(LAND.x - p.x, LAND.z - p.z);
    if (t > 26.2 && t < 30.3) { const beat = (t - 26.2) / .5; jump = Math.abs(Math.sin(beat * Math.PI + r0 * .6)) * .45; yaw += Math.sin(beat * Math.PI) * .4; }
    if (t > 30.3) { jump = Math.abs(Math.sin(t * 40 + i)) * .03; yaw = Math.atan2(F.x - p.x, F.z - p.z) * .4 + yaw * .6; }
  }
  return { p, yaw, jump, scale };
}

// ------------------------------------------------------------------ cámara (planos)
const shots = [
  [0, 1.6, () => ({ a: [V(13.2, .95, 1.5), V(9.2, 1.4, .3), 44], b: [V(12.8, .9, 1.4), V(9.6, 1.5, .3), 44] })],
  [1.6, 4.0, () => ({ a: [V(12.4, 1.25, 1.9), V(9.8, 1.2, .35), 40], b: [V(12.0, 1.3, 1.7), V(9.8, 1.25, .35), 38] })],
  [4.0, 6.0, () => ({ a: [V(20.8, 1.3, 1.9), V(34, 2.2, -1.5), 46], b: [V(20.2, 4.2, 3.0), V(56, 4.5, -4), 44] })],
  [6.0, 7.3, () => ({ a: [P.clone().add(V(0, 2.4, 14)), F.clone().add(V(0, 3.4, 0)), 42], b: [P.clone().add(V(0, 2.2, 12.5)), F.clone().add(V(0, 3.0, 0)), 42] })],
  [7.3, 9.0, () => ({ a: [P.clone().add(V(.4, 2.0, 11.5)), KING.clone().add(V(0, 1.7, 0)), 40], b: [P.clone().add(V(.3, 1.9, 10.0)), KING.clone().add(V(0, 1.8, 0)), 40] })],
  [9.0, 11.4, () => ({ a: [KING.clone().add(V(.5, 1.7, 7.4)), KING.clone().add(V(0, 1.9, 0)), 40], b: [KING.clone().add(V(.3, 1.6, 6.4)), KING.clone().add(V(0, 1.9, 0)), 38] })],
  [11.4, 12.4, () => ({ a: [KING.clone().add(V(-1.8, .7, 5.6)), KING.clone().add(V(0, 2.1, 0)), 46], b: [KING.clone().add(V(-2.0, .6, 5.2)), KING.clone().add(V(0, 2.2, 0)), 48] })],
  [12.4, 13.6, (t) => ({ a: [V(copX(t) + 1.8, 1.8, 10.5), V(copX(t) + 1.0, .9, 0), 44], b: [V(copX(t) + 1.8, 1.8, 10.5), V(copX(t) + 1.0, .9, 0), 44] })],
  [13.6, 14.7, (t) => ({ a: [V(copX(t) + 6.5, .8, 2.2), V(copX(t) - 1, 1.0, 0), 46], b: [V(copX(t) + 5.5, .8, 2.0), V(copX(t) - 1, 1.0, 0), 46] })],
  [14.7, 16.4, (t) => { const x = Math.min(t < 15.2 ? copX(t) : lerp(copX(15.2), LAND.x, easeInOut(clamp((t - 15.2) / 1.1))), 64); return { a: [V(x + .6, 2.4, 6.4), V(x + .4, .3, .5), 44], b: [V(x + .6, 2.4, 6.4), V(x + .4, .3, .5), 44] }; }],
  [16.4, 17.5, () => ({ a: [LAND.clone().add(V(.9, .6, 3.6)), KING.clone().add(V(0, 1.8, 0)), 46], b: [LAND.clone().add(V(.8, .55, 3.2)), KING.clone().add(V(0, 1.9, 0)), 46] })],
  [17.5, 20.2, () => ({ a: [KING.clone().add(V(-2.2, 1.7, 5.4)), KING.clone().add(V(0, 1.7, 0)), 38], b: [KING.clone().add(V(-1.9, 1.6, 4.8)), KING.clone().add(V(0, 1.7, 0)), 36] })],
  [20.2, 24.0, () => ({ a: [LAND.clone().add(V(2.9, 1.3, -1.2)), LAND.clone().add(V(0, 1.2, 0)), 38], b: [LAND.clone().add(V(2.5, 1.3, -1.0)), LAND.clone().add(V(0, 1.25, 0)), 36] })],
  [24.0, 25.4, () => { const m = LAND.clone().lerp(KING, .5); return { a: [m.clone().add(V(5.2, 1.6, .8)), m.clone().add(V(0, 1.3, 0)), 42], b: [m.clone().add(V(4.6, 1.5, .8)), m.clone().add(V(0, 1.35, 0)), 42] }; }],
  [25.4, 26.2, () => ({ a: [KING.clone().add(V(1.6, 1.4, 4.6)), KING.clone().add(V(0, 2.0, 0)), 42], b: [KING.clone().add(V(1.5, 1.3, 4.2)), KING.clone().add(V(0, 2.2, 0)), 44] })],
  [26.2, 27.8, () => ({ a: [P.clone().add(V(0, 2.6, 11)), F.clone().add(V(0, 3.6, 0)), 46], b: [P.clone().add(V(1.5, 5.5, 22)), F.clone().add(V(2, 5, 0)), 48] })],
  [27.8, 30.3, () => ({ a: [P.clone().add(V(-.4, 1.7, 9.5)), P.clone().add(V(0, 1.2, 1.5)), 44], b: [P.clone().add(V(-.2, 1.6, 8.6)), P.clone().add(V(0, 1.2, 1.5)), 44] })],
  [30.3, 32.6, () => ({ a: [LAND.clone().add(V(.2, .7, 4.2)), LAND.clone().add(V(0, 3.4, -4)), 52], b: [LAND.clone().add(V(.2, .6, 4.8)), LAND.clone().add(V(0, 5.2, -4)), 56] })],
  [32.6, 33.3, () => ({ a: [LAND.clone().add(V(.1, 1.35, 2.6)), LAND.clone().add(V(0, 1.4, 0)), 38], b: [LAND.clone().add(V(.1, 1.35, 2.3)), LAND.clone().add(V(0, 1.4, 0)), 36] })],
  [33.3, 35.01, () => ({ a: [LAND.clone().add(V(.1, 1.3, 3.0)), LAND.clone().add(V(0, 1.6, 0)), 42], b: [LAND.clone().add(V(.2, 1.2, 6.4)), LAND.clone().add(V(0, 5.0, -4)), 56] })],
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
function update(t) {
  const cam = cameraAt(t);
  const shake = pulse(t, 1.5, 1.9, .04) * .05 + pulse(t, 16.25, 16.6, .03) * .04 + pulse(t, 26.2, 26.7, .05) * .04 + (t > 30.3 ? .045 * (1 - sstep(32.4, 33.0, t)) + pulse(t, 32.6, 33.4, .1) * .05 : 0);
  cam.pos.x += Math.sin(t * 63) * shake; cam.pos.y += Math.sin(t * 49 + 2) * shake;
  camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.fov = cam.fov; camera.updateProjectionMatrix();
  sky.position.copy(camera.position); skyMat.uniforms.uTime.value = t; sparkMat.uniforms.uTime.value = t;
  const focus = cam.look.clone(); focus.y = 0;
  const dark = sstep(30.3, 31.2, t);
  sun.position.copy(focus).add(V(-8, 14, 9)); sun.target.position.copy(focus); sun.intensity = 3.0 * (1 - dark * .65);
  rim.position.copy(focus).add(V(4, 5, -8)); rim.target.position.copy(focus); rim.color.set(dark > .5 ? '#ff7a3a' : '#ffd9f0'); rim.intensity = 1.4 + dark * 1.5;
  hemi.intensity = 1.25 * (1 - dark * .55);
  magicLight.position.copy(P).add(V(0, 2, 2)); magicLight.intensity = pulse(t, 26.2, 27.4, .1) * 8;
  bloom.strength = .45 + pulse(t, 26.2, 27.0, .1) * .2 + dark * .2;

  // ---------- caramelo volador
  flyer.visible = t > .7 && t < 1.75; flyer.scale.setScalar(1.3);
  if (flyer.visible) { const k = (t - .7) / 1.05; const from = V(-4, 2.4, .2), to = V(14.5, 1.3, 1.7); flyer.position.copy(from.lerp(to, k * k * (3 - 2 * k))); flyer.rotation.set(t * 9, 0, t * 4); }

  // ---------- puertas y fábrica
  const open = sstep(5.0, 5.8, t);
  doors.forEach(({ pv, s }) => { pv.rotation.y = s * open * 1.7; });
  const party = sstep(26.2, 27.4, t);
  wallM.color.set('#ff8fc7').lerp(new THREE.Color().setHSL((t * .15) % 1, .75, .72), party * .7);
  wheel.visible = t > 26.2; wheel.scale.setScalar(easeOutBack(clamp((t - 26.3) / 1.0))); wheelSpin.rotation.z = t * .5;
  wheelSpin.children.forEach((c) => { if (c.userData.a !== undefined) c.rotation.z = -t * .5; });
  partyBalloons.forEach((b, i) => { b.visible = t > 26.3 && t < 32; b.scale.setScalar(easeOutBack(clamp((t - 26.3 - i * .04) / .6))); b.rotation.z = Math.sin(t * 1.5 + i) * .08; b.position.y = t > 30.3 ? (t - 30.3) * (t - 30.3) * 6 : 0; });
  jelly.scale.y = 1 + Math.sin(t * 6) * .08;

  // ---------- Copito
  {
    const g = copito.g; let pose = { blink: blinkAt(t, 1), mouth: mouthAt('copito', t) * 1.15, smile: 1, earWobble: .3, blush: .5 };
    if (t < 4.0) {
      const x = 8.2 + t * .45; const duck = pulse(t, 1.1, 1.75, .12);
      g.position.set(x, 0, .1); g.rotation.set(0, Math.PI / 2 - (t > 1.9 ? sstep(1.9, 2.3, t) * .9 : 0), 0);
      const c = Math.sin(t * 7);
      Object.assign(pose, { legL: c * .45 * (1 - duck), legR: -c * .45 * (1 - duck), armL: [.3, -c * .4], armR: [.3, c * .4], look: [.2, 0], oMouth: .1 });
      if (duck > 0) Object.assign(pose, { squash: duck * .5, armL: [2.6 * duck, -.6], armR: [2.6 * duck, -.6], eyeBig: 1 + duck * .2, oMouth: .7 * duck, earBack: duck * 1.2 });
      if (t > 1.9) Object.assign(pose, { eyeBig: 1.22, raise: 1, oMouth: .7, armL: [1.8, -.7], armR: [1.8, -.7], earSpread: -.2, look: [.4, .2] });
    } else if (t < 11.8) {
      g.position.set(24.2, 0, .2); g.rotation.set(0, Math.PI / 2, 0);
      Object.assign(pose, { eyeBig: 1.12, oMouth: .45, look: [0, .25], armL: [.5, -.3], armR: [.5, -.3], earWobble: .6 });
      if (t > 11.4) Object.assign(pose, { eyeBig: 1.25, raise: 1, oMouth: .8 });
    } else if (t < 15.2) {
      const x = copX(t); let y = Math.abs(Math.sin(t * 15)) * .12 + (Math.abs(x - JELLY_X) < 1.6 ? Math.sin(clamp((x - JELLY_X + 1.6) / 3.2) * Math.PI) * 1.4 : 0);
      g.position.set(x, y, Math.sin(t * 2) * .3); g.rotation.set(0, Math.PI / 2, 0);
      const c = Math.sin(t * 15); const air = y > .5 ? 1 : 0;
      Object.assign(pose, { legL: c * .95 * (1 - air), legR: -c * .95 * (1 - air), armL: [.3 + air * 2, -c * .9], armR: [.3 + air * 2, c * .9], bodyX: .28, earBack: .9, earWobble: 1.5, oMouth: .4 + air * .4, eyeBig: 1.1, look: [-.6, 0] });
    } else {
      // resbalón por el río de chocolate y caída frente al rey
      const k = clamp((t - 15.2) / 1.1);
      if (k < 1) {
        g.position.set(lerp(copX(15.2), LAND.x, easeInOut(k)), .12 + Math.sin(k * Math.PI) * .25, lerp(0, LAND.z, sstep(.5, 1, k))); g.rotation.set(-1.2 + k * .2, Math.PI / 2 - k * .3, Math.sin(t * 20) * .1, 'YXZ');
        Object.assign(pose, { legL: -1.4, legR: -1.0, armL: [2.4, -.4], armR: [2.6, -.4], eyeBig: 1.25, oMouth: .9, earBack: 1.4, earWobble: 2 });
      } else {
        g.position.copy(LAND); g.rotation.set(0, Math.PI, 0, 'YXZ');
        if (t < 17.4) Object.assign(pose, { squash: hop(t, 16.3, .3) * .4, eyeBig: 1.25, raise: 1, oMouth: .6, look: [0, .8], headX: -.4, armL: [.6, -.4], armR: [.6, -.4], earSpread: -.2, sad: .3 });
        else if (t < 21.8) { const c2 = sstep(17.6, 18.3, t); Object.assign(pose, { headX: -.3, look: [0, .6], sad: c2 * .8, smile: lerp(1, -.4, c2), earSpread: c2 * .5, armL: [.4, -.4], armR: [.4, -.4] }); }
        else if (t < 26.2) { const off = sstep(23.0, 23.6, t); Object.assign(pose, { headX: -.25, look: [0, .5], smile: 1, blush: .8, armL: [.4, -.4], armR: [lerp(.4, 1.25, off), lerp(-.4, -1.4, off)], eyeBig: 1.05 }); }
        else if (t < 30.3) {
          const beat = (t - 26.2) / .5; const ph = beat % 1; const h = Math.sin(ph * Math.PI); const side = Math.floor(beat) % 2 ? 1 : -1;
          g.position.y = h * .3; g.rotation.y = Math.PI + side * .4 * h + (t > 27.5 ? Math.PI * .9 : 0) * sstep(27.5, 28.0, t);
          Object.assign(pose, { legL: side > 0 ? h * .5 : 0, legR: side < 0 ? h * .5 : 0, armL: [1.4 + side * .9 * h, -.2], armR: [1.4 - side * .9 * h, -.2], squash: -h * .3, earWobble: 1.3, blush: 1, oMouth: .5, headZ: side * .15 });
        } else {
          // se congela: la sombra crece detrás
          g.rotation.y = 0;
          const shiver = Math.sin(t * 50) * .02;
          g.position.x += shiver;
          Object.assign(pose, { eyeBig: 1.15 + sstep(32.9, 33.4, t) * .25, raise: 1, oMouth: t > 33.3 ? .9 : .2, smile: -.3, armL: [.3, -.3], armR: [.3, -.3], earSpread: -.25, earBack: 0, sad: .2, look: [t > 32.8 && t < 33.3 ? .9 : 0, .3], headY: sstep(32.6, 33.0, t) * (1 - sstep(33.15, 33.4, t)) * 1.3 });
          if (t > 33.3) Object.assign(pose, { armL: [2.6, -.5], armR: [2.6, -.5], squash: -hop(t, 33.3, .4) * .4 });
          g.position.y = hop(t, 33.35, .45) * .45;
        }
      }
    }
    poseCritter(copito, t, pose);
  }
  // ---------- Monstruo
  {
    const g = monster.g; let mp = { blink: blinkAt(t, 4), mouth: mouthAt('monster', t) * 1.1, look: [0, 0], oMouth: .2 };
    monster.P.swirlMat.uniforms.uTime.value = t;
    if (t < 4.0) {
      const x = 8.0 + t * .45; const duck = pulse(t, 1.15, 1.8, .12);
      g.position.set(x, 0, 1.0); g.rotation.set(0, Math.PI / 2 - (t > 1.9 ? .8 : 0), 0);
      Object.assign(mp, { legL: Math.sin(t * 7) * .4, legR: -Math.sin(t * 7) * .4, squash: duck * .5, armL: [.6 + duck * 2, 0], armR: [.6 + duck * 2, 0], eyeBig: duck * .4 + (t > 1.9 ? .5 : 0), oMouth: t > 1.9 ? .8 : .2 });
    } else if (t < 11.8) { g.position.set(24.1, 0, 1.2); g.rotation.set(0, Math.PI / 2 - .2, 0); Object.assign(mp, { eyeBig: .4, oMouth: .4, look: [0, .3], armL: [1.0, 0], armR: [1.6, -.6] }); }
    else if (t < 15.2) { const x = copX(t) - 1.0; let y = Math.abs(Math.sin(t * 17)) * .1 + (Math.abs(x - JELLY_X) < 1.6 ? Math.sin(clamp((x - JELLY_X + 1.6) / 3.2) * Math.PI) * 1.3 : 0); g.position.set(x, y, 1.1); g.rotation.set(0, Math.PI / 2, Math.sin(t * 9) * .12); const c = Math.sin(t * 17); Object.assign(mp, { legL: c * .9, legR: -c * .9, armL: [.9, c * .8], armR: [.9, -c * .8], bodyX: .15, eyeBig: .3, oMouth: .5 }); }
    else if (t < 26.2) { g.position.copy(MON_PLAZA); g.rotation.set(0, Math.atan2(KING.x - MON_PLAZA.x, KING.z - MON_PLAZA.z), 0); Object.assign(mp, { sad: t > 17.6 && t < 22 ? .6 : 0, look: [-.3, .3] }); }
    else if (t < 30.3) { const beat = (t - 26.2) / .5; const ph = beat % 1; const h = Math.sin(ph * Math.PI); const side = Math.floor(beat) % 2 ? -1 : 1; g.position.copy(MON_PLAZA); g.position.y = h * .35; g.rotation.set(0, side * .3 * h, side * .1 * h); Object.assign(mp, { eyeBig: .3, oMouth: .7, armL: [1.4 + side * h, 0], armR: [1.4 - side * h, 0], squash: -h * .3 }); }
    else { g.position.copy(MON_PLAZA); g.rotation.set(0, Math.PI * .85, 0); Object.assign(mp, { eyeBig: .7, oMouth: .8, look: [0, 1], armL: [.4, 0], armR: [.4, 0], squash: Math.sin(t * 45) * .03 }); }
    poseMonster(monster, t, mp);
  }
  // ---------- Rey Caramelo
  {
    const g = king.g; let kp = { blink: blinkAt(t, 5), mouth: mouthAt('king', t) * 1.2, look: [0, 0], smile: 1 };
    const out = clamp((t - 7.2) / 1.0);
    g.visible = t > 7.0;
    g.position.copy(F.clone().add(V(0, 0, 3)).lerp(KING, easeInOut(out))); g.rotation.set(0, 0, 0);
    if (t < 9.0) { const step2 = Math.abs(Math.sin(t * 6)) * .1 * (out < 1 ? 1 : 0); g.position.y = step2; Object.assign(kp, { armL: [.4, 0], armR: [2.6, 0], look: [0, -.1], smile: 1, oMouth: .2, angry: .3, crownWobble: 2 }); }
    else if (t < 11.4) Object.assign(kp, { angry: .9, armL: [2.4 + Math.sin(t * 7) * .2, 0], armR: [2.4 + Math.cos(t * 7) * .2, 0], squash: Math.abs(Math.sin(t * 8)) * .1, smile: 1, look: [0, -.2] });
    else if (t < 15.2) Object.assign(kp, { angry: .8, armR: [1.5, -1.5], armL: [.4, 0], bodyY: -.5, look: [-1, 0] });
    else if (t < 17.4) { Object.assign(kp, { angry: 1, armL: [2.2, -.3], armR: [2.2, -.3], look: [0, -.8], squash: -hop(t, 16.4, .5) * .3, oMouth: .4 }); g.position.y = hop(t, 16.4, .5) * .3; }
    else if (t < 22.2) { const cry = sstep(17.2, 17.8, t); const sob = Math.max(0, Math.sin(t * 9)) * cry; Object.assign(kp, { sad: cry, cry, smile: -1, squash: -sob * .1, armL: [.3 + cry * 1.2, -.6], armR: [.3 + cry * 1.2, -.6], look: [0, -.4], blink: Math.min(kp.blink, 1 - cry * .2) }); }
    else if (t < 24.2) Object.assign(kp, { sad: .7 - sstep(23.0, 24.0, t) * .7, cry: .7 * (1 - sstep(22.6, 23.6, t)), smile: lerp(-1, 0, sstep(23, 24, t)), eyeBig: sstep(23.5, 24.0, t) * .4, look: [0, -.4], armL: [.3, -.3], armR: [.3, -.3] });
    else if (t < 26.2) { const th = sstep(25.3, 25.8, t); Object.assign(kp, { smile: 1, eyeBig: .3, oMouth: .5, armL: [lerp(.6, 2.8, th), 0], armR: [lerp(.6, 2.8, th), 0], squash: -hop(t, 25.4, .5) * .3, look: [0, .3] }); g.position.y = hop(t, 25.4, .5) * .4; }
    else if (t < 30.3) { const beat = (t - 26.2) / .5; const ph = beat % 1; const h = Math.sin(ph * Math.PI); const side = Math.floor(beat) % 2 ? 1 : -1; g.position.y = h * .3; g.rotation.y = side * .3 * h; Object.assign(kp, { smile: 1, oMouth: .6, armL: [1.6 + side * h, 0], armR: [1.6 - side * h, 0], squash: -h * .3, crownWobble: 3 }); }
    else { g.rotation.y = Math.PI * .95 * sstep(30.4, 31.0, t); Object.assign(kp, { eyeBig: .6, oMouth: .8, armL: [.4, 0], armR: [.4, 0], look: [0, 1], squash: Math.sin(t * 45) * .03 }); }
    poseKing(king, t, kp);
  }
  // ---------- ejército de dulces
  {
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), cnt = [0, 0, 0];
    let ei = 0;
    for (let i = 0; i < MIN_N; i++) {
      const ty = i % 3; const st = minionState(i, t); const ty_ = MTYPES[ty];
      ee.set(0, st.yaw, 0); qq.setFromEuler(ee);
      const pos = st.p.clone(); pos.y += st.jump;
      const sc = st.scale * (1 + (MSEED[i][3] - .5) * .3);
      mm.compose(pos, qq, V(sc, sc * (1 - st.jump * .3), sc)); minionMeshes[ty].setMatrixAt(cnt[ty]++, mm);
      for (const s of [-1, 1]) {
        const off = V(s * ty_.eyeX, ty_.eyeY, ty_.eyeZ).multiplyScalar(sc).applyQuaternion(qq);
        const ep = pos.clone().add(off);
        mm.compose(ep, qq, V(.055 * sc, .065 * sc, .04 * sc)); eyeWhite.setMatrixAt(ei, mm);
        mm.compose(ep.clone().add(V(0, 0, .03 * sc).applyQuaternion(qq)), qq, V(.032 * sc, .04 * sc, .02 * sc)); eyePupil.setMatrixAt(ei, mm); ei++;
      }
    }
    minionMeshes.forEach((m) => (m.instanceMatrix.needsUpdate = true)); eyeWhite.instanceMatrix.needsUpdate = true; eyePupil.instanceMatrix.needsUpdate = true;
  }
  // ---------- dragón
  {
    const rise = easeInOut(clamp((t - 30.5) / 1.5));
    dragon.visible = t > 30.3; dragon.position.y = lerp(-6, 14.8, rise); dragon.rotation.set(Math.sin(t * .8) * .05, Math.sin(t * .6) * .1, 0);
    dragonEyes.forEach((e) => { e.material.emissiveIntensity = 1 + 3 * sstep(31.5, 32.2, t) * (blinkAt(t, 7) > .5 ? 1 : .1); });
    bigShadow.position.copy(LAND).add(V(0, .03, -1.5)); const sh = sstep(30.3, 31.8, t); bigShadow.scale.set(1 + sh * 9, 1 + sh * 7, 1); shadowMat.opacity = sh * .55;
  }
  // ---------- dulces lanzados al aire
  {
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
    for (let i = 0; i < TOSS_N; i++) {
      const r = RND[5000 + i]; const age = t - 25.6 - r[0] * .5;
      if (age < 0 || age > 4) { mm.makeScale(0, 0, 0); tossed.setMatrixAt(i, mm); continue; }
      const a = r[1] * 6.28; const sp = 1.5 + r[2] * 3;
      const p = KING.clone().add(V(Math.cos(a) * sp * age * .7, 2.6 + age * (5 + r[3] * 3) - age * age * 4.2, Math.sin(a) * sp * age * .5 + .5));
      if (p.y < .3) p.y = .3;
      ee.set(t * 5 + i, t * 3, 0); qq.setFromEuler(ee); mm.compose(p, qq, V(.9, .9, .9)); tossed.setMatrixAt(i, mm);
    }
    tossed.instanceMatrix.needsUpdate = true;
  }
  // ---------- chispas
  let n = 0;
  const emit = (p, col, size) => { if (n >= SPARK_N) return; sPos[n * 3] = p.x; sPos[n * 3 + 1] = p.y; sPos[n * 3 + 2] = p.z; sCol.set(col, n * 3); sSize[n] = size; sSeed[n] = (n * .618) % 1; n++; };
  if (flyer.visible) for (let i = 0; i < 120; i++) { const r = RND[i]; const age = r[0] * .3; const tt = t - age; if (tt < .7) continue; const k = (tt - .7) / 1.05; const p = V(-4, 2.4, .2).lerp(V(14.5, 1.3, 1.7), k * k * (3 - 2 * k)); emit(p.add(V((r[1] - .5) * .4, (r[2] - .5) * .4, (r[3] - .5) * .4)), RAIN[i % 8], 6 * (1 - age / .3)); }
  // humo de colores de las chimeneas
  for (let i = 0; i < 120; i++) { const r = RND[200 + i]; const ph = (t * .3 + r[0]) % 1; const cx = i % 2 ? F.x - 3 : F.x + 2.5; const cz = i % 2 ? F.z - 1.5 : F.z - 2; emit(V(cx + (r[1] - .5) * (.4 + ph * 2), 11.4 + ph * 5, cz + (r[2] - .5) * (.4 + ph * 2)), RAIN[i % 8], (8 + r[3] * 6) * Math.sin(ph * Math.PI)); }
  // brillo de la corona
  if (t > 7.0 && t < 30.3) { const cp = king.P.crown.getWorldPosition(new THREE.Vector3()); for (let i = 0; i < 12; i++) { const r = RND[400 + i]; const ph = (t * .8 + r[0]) % 1; emit(cp.clone().add(V((r[1] - .5) * 1.4, ph * .8, (r[2] - .5) * 1.4)), [1, .9, .4], 6 * Math.sin(ph * Math.PI)); } }
  // explosión mágica de colores
  if (t > 26.2 && t < 29.5) for (let i = 0; i < 500; i++) {
    const r = RND[600 + i]; const age = t - 26.2 - r[4] * .2; if (age < 0) continue; const a = r[0] * 6.28, e = (r[1] - .3) * 1.6;
    const spd = (3 + r[2] * 9) * (1 - Math.exp(-age * 2.2)) / 2.2 * 2;
    emit(KING.clone().add(V(0, 1.8, 0)).add(V(Math.cos(a) * Math.cos(e) * spd, Math.sin(e) * spd - age * age * .5, Math.sin(a) * Math.cos(e) * spd * .7)), RAIN[i % 8], (6 + r[3] * 7) * (1 - sstep(1.6, 3.2, age)));
  }
  // humo de la nariz del dragón
  if (t > 31.6) for (let i = 0; i < 80; i++) { const r = RND[1200 + i]; const ph = (t * .7 + r[0]) % 1; const s = i % 2 ? 1 : -1; const np = dragon.localToWorld(V(s * .55, 2.5, 4.5)); emit(np.add(V((r[1] - .5) * ph, ph * 1.8, ph * 1.2)), [.45, .4, .42], (10 + r[2] * 8) * Math.sin(ph * Math.PI) * .6); }
  sparkGeo.setDrawRange(0, n);
  for (const k of ['position', 'color', 'size', 'seed']) sparkGeo.attributes[k].needsUpdate = true;
  // confeti
  confetti.visible = t > 26.2 && t < 30.6;
  if (confetti.visible) {
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
    for (let i = 0; i < CONF_N; i++) { const r = RND[2000 + i]; const age = t - 26.2 - r[4] * 1.2; const ph = ((age * .35 + r[1]) % 1 + 1) % 1; const p = P.clone().add(V((r[0] - .5) * 12, 6 - ph * 6.5, -2 + r[2] * 7)); ee.set(t * (3 + r[3] * 5) + i, t * (2 + r[0] * 4), i); qq.setFromEuler(ee); mm.compose(p, qq, V(1, 1, 1)); confetti.setMatrixAt(i, mm); }
    confetti.instanceMatrix.needsUpdate = true;
  }
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
