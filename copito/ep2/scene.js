// Copito — Episodio 2: "¡El monstruo que se robaba los colores!"
// Render determinista: window.renderAt(t). Copito viene de ../characters.js (idéntico al episodio 1).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, sstep, easeInOut, easeOutBack, pulse, V, rand, SPH, SPHlo, phys, MAT, mesh, CAP, stick, makeCritter, poseCritter, blinkAt } from '../characters.js';

const params = new URLSearchParams(location.search);
const W = +params.get('w') || 540, H = +params.get('h') || 960;
const TL = await (await fetch('../build/ep2_timeline.json')).json();
const R = rand(2024);
const mouthAt = (who, t) => { const a = TL.mouth[who]; if (!a) return 0; const f = t * TL.fps; const i = Math.floor(f); return lerp(a[i] || 0, a[i + 1] || 0, f - i); };
const hop = (t, t0, d = .5) => Math.max(0, Math.sin(clamp((t - t0) / d) * Math.PI));

// ------------------------------------------------------------------ renderer + post
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, .05, 2000);
const maskRT = new THREE.WebGLRenderTarget(Math.round(W / 2), Math.round(H / 2));
const maskMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

const DrainShader = {
  uniforms: {
    tDiffuse: { value: null }, tMask: { value: maskRT.texture }, uAspect: { value: W / H },
    uC: { value: new THREE.Vector2(2, .5) }, uR: { value: 0 }, uEdge: { value: 0 },
    uRC: { value: new THREE.Vector2(.5, .5) }, uRR: { value: 0 }, uBoost: { value: 0 }, uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tMask; uniform vec2 uC, uRC; uniform float uR, uRR, uAspect, uEdge, uBoost, uTime; varying vec2 vUv;
    vec3 hue(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv); float m = texture2D(tMask, vUv).r;
      vec2 d = vUv-uC; d.x *= uAspect; float dist = length(d);
      float drain = smoothstep(uR, uR-.12, dist);
      vec2 d2 = vUv-uRC; d2.x *= uAspect; float dist2 = length(d2);
      float rest = smoothstep(uRR, uRR-.18, dist2);
      drain *= (1.-rest) * (1.-m);
      float l = dot(c.rgb, vec3(.299,.587,.114));
      vec3 col = mix(c.rgb, vec3(l)*vec3(.96,.98,1.04), drain);
      // borde de la ola gris (destello lila) y borde arcoíris de la ola de color
      col += vec3(.7,.6,1.)*exp(-pow((dist-uR)/.025,2.))*uEdge*.8;
      float ang = atan(d2.y, d2.x);
      col += hue(ang/6.2832 + uTime*.3)*exp(-pow((dist2-uRR)/.04,2.))*step(.01,uRR)*step(uRR,2.5)*1.4;
      float l2 = dot(col, vec3(.299,.587,.114));
      col = mix(vec3(l2), col, 1. + uBoost*rest*(1.-m));
      gl_FragColor = vec4(col, c.a);
    }`,
};
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const drainPass = new ShaderPass(DrainShader); composer.addPass(drainPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .45, .5, .95); composer.addPass(bloom);
composer.addPass(new OutputPass());
const DU = drainPass.uniforms; DU.tMask.value = maskRT.texture;

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
// troncos y piedras de la persecución
const LOGS = [14.2, 23.8], ROCK = 18.4, RAINBOW_X = 32.5;
for (const x of LOGS) {
  const lg = new THREE.Group(); lg.position.set(x, .22, 0); forest.add(lg);
  lg.add(mesh(new THREE.CylinderGeometry(.22, .24, 3.2, 18), phys('#9a6236', { roughness: .95 }), [0, 0, 0], 1, [Math.PI / 2, 0, 0]));
  for (const s of [-1, 1]) lg.add(mesh(new THREE.CircleGeometry(.21, 18), phys('#e2b27a'), [0, 0, s * 1.61], 1, [0, s > 0 ? 0 : Math.PI, 0]));
  lg.add(mesh(SPHlo, phys('#5fbf4a'), [0, .2, .6], [.15, .08, .2]));
}
forest.add(mesh(new THREE.DodecahedronGeometry(.45, 1), phys('#9aa3b5', { roughness: .9 }), [ROCK, .3, 0], [1, .75, .9]));
forest.add(mesh(new THREE.DodecahedronGeometry(.25, 1), phys('#8a93a5', { roughness: .9 }), [ROCK + .5, .15, .5], 1));

// arcoíris (shader propio; fuera de la máscara gris para controlarlo a mano)
const rainbowMat = (r0, r1) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uFade: { value: 1 }, uSat: { value: 1 }, uR0: { value: r0 }, uR1: { value: r1 }, uGrow: { value: 1 } },
  vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vP; uniform float uFade,uSat,uR0,uR1,uGrow;
    void main(){ float r=(length(vP.xy)-uR0)/(uR1-uR0); float a=atan(vP.y,vP.x)/3.14159;
      vec3 bands[7]; bands[0]=vec3(1.,.25,.3); bands[1]=vec3(1.,.55,.15); bands[2]=vec3(1.,.9,.2); bands[3]=vec3(.35,.9,.35); bands[4]=vec3(.25,.7,1.); bands[5]=vec3(.4,.4,1.); bands[6]=vec3(.75,.4,1.);
      int i=int(clamp(r*7.,0.,6.99)); vec3 c=bands[6-i];
      float l=dot(c,vec3(.3,.59,.11)); c=mix(vec3(l),c,uSat);
      float edge=smoothstep(0.,.06,r)*smoothstep(1.,.94,r);
      float grow = step(1.-uGrow, 1.-a);
      gl_FragColor=vec4(c*1.25, .82*edge*uFade*grow); }`,
});
const rainbow = new THREE.Mesh(new THREE.RingGeometry(2.3, 3.3, 96, 1, 0, Math.PI), rainbowMat(2.3, 3.3));
rainbow.position.set(RAINBOW_X, 0, 0); rainbow.rotation.y = Math.PI / 2; scene.add(rainbow);
const bigRainbow = new THREE.Mesh(new THREE.RingGeometry(7, 9.2, 128, 1, 0, Math.PI), rainbowMat(7, 9.2));
bigRainbow.position.copy(M).add(V(.5, -1, -7)); scene.add(bigRainbow);
rainbow.layers.enable(1); bigRainbow.layers.enable(1);

// ------------------------------------------------------------------ mariposas
const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.bezierCurveTo(.15, .25, .45, .25, .4, .02); wingShape.bezierCurveTo(.42, -.18, .15, -.2, 0, 0);
const wingGeo = new THREE.ShapeGeometry(wingShape);
const butterflies = [];
for (let i = 0; i < 16; i++) {
  const b = new THREE.Group(); const col = PALETTE[i % PALETTE.length];
  const wm = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, emissive: col, emissiveIntensity: .25, roughness: .5 });
  const wl = new THREE.Mesh(wingGeo, wm), wr = new THREE.Mesh(wingGeo, wm); wr.scale.x = -1;
  const pl = new THREE.Group(), pr = new THREE.Group(); pl.add(wl); pr.add(wr); b.add(pl, pr);
  b.add(mesh(CAP, phys('#3a2a4a'), [0, 0, 0], [.025, .08, .025], [0, 0, Math.PI / 2]));
  b.scale.setScalar(.55); b.userData = { pl, pr, r: [R(), R(), R(), R()] }; scene.add(b); butterflies.push(b);
}

// ------------------------------------------------------------------ personajes
const copito = makeCritter({ kind: 'bunny', fur: MAT.fur, inner: MAT.pink, iris: MAT.irisBlue, brow: MAT.browBunny, overall: true });
scene.add(copito.g);
const bear = makeCritter({ kind: 'bear', fur: MAT.bear, inner: MAT.bearTan, iris: MAT.irisBrown, brow: MAT.browBear, belly: MAT.bearTan, bowtie: true, eyeScale: .9 });
bear.g.scale.setScalar(.72); scene.add(bear.g);

function makeMonster() {
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
const monster = makeMonster(); scene.add(monster.g);
for (const c of [copito.g, monster.g, bear.g]) c.traverse((m) => { if (m.isMesh) m.layers.enable(1); });

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

// ------------------------------------------------------------------ partículas
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
const SPARK_N = 3000;
const sparkGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(SPARK_N * 3), sCol = new Float32Array(SPARK_N * 3), sSize = new Float32Array(SPARK_N), sSeed = new Float32Array(SPARK_N);
for (const [k, a, n] of [['position', sPos, 3], ['color', sCol, 3], ['size', sSize, 1], ['seed', sSeed, 1]]) sparkGeo.setAttribute(k, new THREE.BufferAttribute(a, n));
const sparkMat = pointMat(); const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);

const RND = Array.from({ length: 5000 }, () => [R(), R(), R(), R(), R()]);
const hex2rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const RAIN = PALETTE.map(hex2rgb);

// confeti (instanciado)
const CONF_N = 420;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(.07, .11), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .5, emissive: '#222' }), CONF_N);
for (let i = 0; i < CONF_N; i++) confetti.setColorAt(i, new THREE.Color(PALETTE[i % 8]));
confetti.frustumCulled = false; scene.add(confetti); confetti.layers.enable(1);
// polvo (revolcón)
const DUST_N = 40;
const dust = new THREE.InstancedMesh(SPHlo, new THREE.MeshStandardMaterial({ color: '#e8dccb', roughness: 1, transparent: true, opacity: .6 }), DUST_N);
dust.frustumCulled = false; scene.add(dust);
// burbuja arcoíris del hipo
const bubble = mesh(SPH, new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0, transmission: 0, transparent: true, opacity: .35, iridescence: 1, iridescenceIOR: 1.3, clearcoat: 1, emissive: '#ff9de2', emissiveIntensity: .15 }), [0, 0, 0], .2);
bubble.castShadow = false; scene.add(bubble); bubble.layers.enable(1);
// onda expansiva de la explosión
const ringMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv; uniform float uA; vec3 hue(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
    void main(){ vec2 c=vUv-.5; float d=length(c)*2.; float r=smoothstep(.7,.9,d)*smoothstep(1.,.9,d); gl_FragColor=vec4(hue(atan(c.y,c.x)/6.283)*r*uA*2.,r*uA);} `,
});
const shock = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat); shock.frustumCulled = false; scene.add(shock); shock.layers.enable(1);
const flash = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
scene.add(flash); flash.layers.enable(1);

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
  const titleGray = sstep(1.5, 1.62, t);
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
    const rows = [['¡EL', 'MONSTRUO'], ['QUE', 'SE', 'ROBABA'], ['LOS', 'COLORES!']];
    const sizes = [118, 92, 128];
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
    const base = line.who === 'monster' ? ['#d6b3ff', '#b6ff8a', '#ffd84d'] : ['#ffffff', '#ffffff', '#ffffff'];
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

// ------------------------------------------------------------------ trayectorias
const copX = (t) => 8.5 + 6.0 * (t - 9);          // persecución
const monX = (t) => Math.min(12.5 + 5.6 * Math.max(0, t - 9) + (t > 8.6 && t < 9 ? 0 : 0), 46.3);
const JUMPS_C = [9.85, 11.45], JUMPS_M = [9.12, 10.84];
const runCycle = (t, speed = 14) => Math.sin(t * speed);
const COP_SIT = V(45.75, 0, .15), MON_SIT = V(46.95, 0, 0);

// ------------------------------------------------------------------ cámara (planos)
const shots = [
  [0, 1.5, () => ({ a: [V(.8, 1.0, 4.2), V(0, 1.0, 0), 44], b: [V(.4, 1.4, 5.6), V(0, 1.1, 0), 40] })],
  [1.5, 4.0, () => ({ a: [V(.15, 1.4, 4.0), V(0, 1.45, 0), 38], b: [V(.1, 1.5, 3.2), V(0, 1.5, 0), 36] })],
  [4.0, 5.1, () => ({ a: [V(2, 1.6, 8.0), V(10, 1.2, 0), 50], b: [V(12.8, 1.3, 4.6), V(12.5, 1.2, 0), 40] })],
  [5.1, 8.4, () => ({ a: [V(13.4, 1.2, 4.6), V(12.6, 1.2, 0), 40], b: [V(14.6, 1.8, 5.0), V(12.6, 1.3, 0), 42] })],
  [8.4, 9.0, () => ({ a: [V(3.4, 1.5, 1.7), V(9.2, 1.0, 0), 44], b: [V(3.8, 1.45, 1.6), V(9.4, 1.0, 0), 42] })],
  [9.0, 12.0, (t) => ({ a: [V(copX(t) + 1.8, 1.7, 11), V(copX(t) + 1.9, .9, 0), 44], b: [V(copX(t) + 1.8, 1.7, 11), V(copX(t) + 1.9, .9, 0), 44] })],
  [12.0, 13.6, (t) => ({ a: [V(copX(t) + 5.5, 1.3, 5.0), V(copX(t) + 1.2, 1.0, 0), 44], b: [V(copX(t) + 5.0, 1.2, 4.6), V(copX(t) + 1.2, 1.0, 0), 44] })],
  [13.6, 16.2, (t) => { const x = Math.min(copX(Math.min(t, 15.0)), 45.6); return { a: [V(x + 1.3, 1.7, 10.5), V(x + 1.6, .8, 0), 44], b: [V(x + .8, 1.5, 9.0), V(x + .9, .7, 0), 42] }; }],
  [16.2, 19.2, () => ({ a: [MON_SIT.clone().add(V(-2.0, 1.1, 3.8)), MON_SIT.clone().add(V(0, .8, 0)), 38], b: [MON_SIT.clone().add(V(-1.7, 1.0, 3.2)), MON_SIT.clone().add(V(0, .85, 0)), 36] })],
  [19.2, 22.0, () => ({ a: [COP_SIT.clone().add(V(2.2, 1.1, 3.6)), COP_SIT.clone().add(V(0, 1.1, 0)), 38], b: [COP_SIT.clone().add(V(1.9, 1.15, 3.0)), COP_SIT.clone().add(V(0, 1.2, 0)), 36] })],
  [22.0, 24.4, () => ({ a: [COP_SIT.clone().add(V(1.6, 1.25, 3.8)), COP_SIT.clone().add(V(0, 1.3, 0)), 38], b: [COP_SIT.clone().add(V(1.4, 1.3, 3.2)), COP_SIT.clone().add(V(.1, 1.35, 0)), 36] })],
  [24.4, 25.6, () => ({ a: [M.clone().add(V(-.1, .6, 5.2)), M.clone().add(V(-.2, .9, 0)), 40], b: [M.clone().add(V(-.1, .65, 4.5)), M.clone().add(V(-.2, .95, 0)), 38] })],
  [25.6, 27.1, () => ({ a: [M.clone().add(V(-.1, 1.0, 5.2)), M.clone().add(V(-.2, 1.2, 0)), 42], b: [M.clone().add(V(-.3, 2.4, 12)), M.clone().add(V(0, 2.4, 0)), 48] })],
  [27.1, 29.0, () => ({ a: [MON_SIT.clone().add(V(-.8, 1.1, 4.2)), MON_SIT.clone().add(V(0, 1.2, 0)), 40], b: [MON_SIT.clone().add(V(-.6, 1.0, 3.7)), MON_SIT.clone().add(V(0, 1.15, 0)), 40] })],
  [29.0, 30.6, () => ({ a: [MON_SIT.clone().add(V(-.4, 1.2, 4.6)), MON_SIT.clone().add(V(0, 1.0, 0)), 42], b: [MON_SIT.clone().add(V(-.8, 1.0, 5.2)), MON_SIT.clone().add(V(0, 1.0, 0)), 44] })],
  [30.6, 31.6, (t) => { const a = (t - 30.6) * .5; return { a: [M.clone().add(V(Math.sin(a) * 6.5, 1.8, Math.cos(a) * 6.5)), M.clone().add(V(0, .9, 0)), 44], b: [M.clone().add(V(Math.sin(a) * 6.5, 1.8, Math.cos(a) * 6.5)), M.clone().add(V(0, .9, 0)), 44] }; }],
  [31.6, 33.5, () => ({ a: [COP_SIT.clone().add(V(-.1, 1.35, 3.9)), COP_SIT.clone().add(V(0, 1.35, 0)), 38], b: [COP_SIT.clone().add(V(-.1, 1.4, 3.2)), COP_SIT.clone().add(V(0, 1.4, 0)), 36] })],
  [33.5, 35.01, () => ({ a: [M.clone().add(V(-.3, 1.6, 6.0)), M.clone().add(V(-.3, 1.5, 0)), 44], b: [M.clone().add(V(-.3, 1.9, 8.2)), M.clone().add(V(-.3, 2.1, 0)), 46] })],
];
function cameraAt(t) {
  const [a, b, f] = shots.find(([s0, s1]) => t >= s0 && t < s1) || shots[shots.length - 1];
  const k = easeInOut(clamp((t - a) / (b - a)));
  const { a: A, b: B } = f(t);
  const pos = A[0].clone().lerp(B[0], k), look = A[1].clone().lerp(B[1], k);
  pos.x += Math.sin(t * .8) * .025; pos.y += Math.sin(t * 1.1 + 1) * .02;
  return { pos, look, fov: lerp(A[2], B[2], k) };
}
const toUV = (p) => { const v = p.clone().project(camera); return new THREE.Vector2((v.x + 1) / 2, (v.y + 1) / 2); };

// ------------------------------------------------------------------ animación
function update(t) {
  // ---------- cámara
  const cam = cameraAt(t);
  let shake = pulse(t, 1.5, 2.1, .05) * .06 + pulse(t, 15.15, 15.6, .05) * .05 + pulse(t, 25.6, 26.3, .05) * .07;
  cam.pos.x += Math.sin(t * 63) * shake; cam.pos.y += Math.sin(t * 49 + 2) * shake;
  camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.fov = cam.fov; camera.updateProjectionMatrix();
  sky.position.copy(camera.position); skyMat.uniforms.uTime.value = t;
  const focus = cam.look.clone(); focus.y = 0;
  sun.position.copy(focus).add(V(-8, 14, 9)); sun.target.position.copy(focus);
  rim.position.copy(focus).add(V(4, 5, -8)); rim.target.position.copy(focus);
  sparkMat.uniforms.uTime.value = t; DU.uTime.value = t;

  // ---------- Copito
  const cp = copito.g; let pose = { blink: blinkAt(t, 1), mouth: mouthAt('copito', t) * 1.15, smile: 1, earWobble: .3, blush: .5 };
  cp.visible = true;
  if (t < 4.0) {
    cp.position.set(0, 0, 0);
    const pum = sstep(1.48, 1.6, t);
    if (t < 1.5) {
      // juega feliz: salta y gira atrapando mariposas
      const h = hop(t, 0.05, .55) + hop(t, .8, .55);
      cp.position.y = h * .45; cp.rotation.set(0, Math.sin(t * 3) * .5, 0);
      Object.assign(pose, { armL: [1.2 + h * 1.2, -.2], armR: [1.4 + h * 1.2, -.2], squash: -h * .4, earWobble: 1.2, headX: -.15, look: [.3, .4], oMouth: .5, blush: .7 });
    } else {
      // ¡PUM! se congela: ojos enormes, orejas tiesas
      const jolt = hop(t, 1.5, .35);
      cp.position.y = jolt * .3; cp.rotation.set(0, lerp(Math.sin(1.5 * 3) * .5, .25, sstep(1.5, 2.0, t)), 0);
      Object.assign(pose, {
        armL: [lerp(.4, 2.2, pum), -.6], armR: [lerp(.4, 2.2, pum), -.6], squash: -jolt * .5, earWobble: .2, earSpread: -.15 * pum,
        eyeBig: 1 + pum * .22, raise: pum, oMouth: pum * .7, smile: lerp(1, -.2, pum), look: [lerp(0, .9, sstep(2.7, 3.2, t)), .1],
        headY: lerp(0, .5, sstep(2.7, 3.3, t)), sad: 0, blush: .3,
      });
      if (t > 1.6 && t < 2.8) pose.blink = 1;
    }
  } else if (t < 8.5) {
    cp.visible = false;
  } else if (t < 15.2) {
    // persecución
    let x = t < 9 ? lerp(5.5, copX(9), sstep(8.5, 9, t)) : copX(t);
    let y = 0, z = 0, dive = 0;
    for (const tj of JUMPS_C) y += hop(t, tj, .5) * .9;
    z = pulse(t, 10.35, 10.95, .2) * .85;
    const c = runCycle(t, 15);
    y += Math.abs(c) * .12;
    if (t > 14.7) { dive = clamp((t - 14.7) / .5); x = lerp(copX(14.7), 45.9, dive); y = Math.sin(dive * Math.PI) * .7 + .1 * dive; }
    cp.position.set(x, y, z); cp.rotation.set(0, Math.PI / 2 - z * .4, -c * .05);
    const air = JUMPS_C.reduce((s, tj) => s + hop(t, tj, .5), 0);
    Object.assign(pose, {
      legL: c * .9 * (1 - air), legR: -c * .9 * (1 - air), armL: [.3 + air * 1.6, -c * .9], armR: [.3 + air * 1.6, c * .9], bodyX: .25,
      earBack: .9, earWobble: 1.4, look: [0, .1], smile: t < 12 ? .3 : 1, angry: t < 12 ? .3 : 0, oMouth: .3 + air * .4,
    });
    if (dive > 0) Object.assign(pose, { bodyX: 1.2 * Math.sin(dive * Math.PI), armL: [2.6, -1.0], armR: [2.6, -1.0], legL: .9, legR: .9, oMouth: .8, eyeBig: 1.15 });
  } else {
    // en el claro: revolcón, sentado, consuela, explosión y baile
    const tumble = clamp((t - 15.2) / .8);
    cp.position.copy(COP_SIT); cp.rotation.set(0, Math.PI / 2 - .35, 0);
    if (tumble < 1) { cp.position.x = lerp(45.9, COP_SIT.x, tumble); cp.position.y = Math.sin(tumble * Math.PI) * .5; cp.rotation.y += easeInOut(tumble) * Math.PI * 2; cp.rotation.z = Math.sin(tumble * Math.PI) * .4; }
    Object.assign(pose, { legL: -1.2, legR: -1.1, look: [.5, 0] });
    if (t < 17) Object.assign(pose, { armL: [2.0, -1.0], armR: [2.0, -1.0], oMouth: .5, eyeBig: 1.1, smile: 1 });
    else if (t < 22.0) {
      const concern = sstep(17.2, 18.0, t);
      Object.assign(pose, { armL: [.4, -.6], armR: [.4, -.6], sad: concern * .85, smile: lerp(1, -.5, concern), earSpread: concern * .55, earBack: concern * .3, headZ: -.15 * concern, look: [.7, -.1] });
    } else if (t < 25.6) {
      const smileK = sstep(21.9, 22.4, t); const offer = sstep(24.3, 24.9, t);
      Object.assign(pose, { smile: 1, sad: lerp(.6, 0, smileK), blush: .8, armL: [.4, -.5], armR: [lerp(.4, 1.25, offer), lerp(-.5, -1.35, offer)], headZ: .12, look: [.6, 0], eyeBig: 1.05 });
    } else if (t < 29.0) {
      const wow = sstep(25.6, 25.8, t) * (1 - sstep(26.8, 27.4, t));
      const h = hop(t, 27.3, .5) + hop(t, 27.9, .5) + hop(t, 28.5, .5);
      cp.position.y = h * .3 + (t > 27 ? 0 : 0);
      Object.assign(pose, { legL: lerp(-1.2, 0, sstep(26.8, 27.2, t)), legR: lerp(-1.1, 0, sstep(26.8, 27.2, t)), eyeBig: 1 + wow * .2, oMouth: .6, armL: [1.6 + h, -.3], armR: [1.6 + h, -.3], earWobble: 1.5, blush: 1, look: [.3, .5] });
      if (t < 27) cp.position.y = 0;
    } else {
      // baile a 120 bpm (0.5 s por paso)
      const beat = (t - 29) / .5; const ph = beat % 1; const h = Math.sin(ph * Math.PI);
      const side = Math.floor(beat) % 2 ? 1 : -1;
      const toCam = sstep(31.4, 31.9, t) * (1 - sstep(33.6, 34.2, t));
      cp.position.set(COP_SIT.x - .2, h * .28, COP_SIT.z + .2);
      cp.rotation.set(0, lerp(Math.PI / 2 - .7 + side * .25, .15, toCam), side * .1 * h);
      Object.assign(pose, {
        legL: side > 0 ? h * .5 : 0, legR: side < 0 ? h * .5 : 0, armL: [1.4 + side * .9 * h, -.2], armR: [1.4 - side * .9 * h, -.2],
        squash: -h * .3 + (ph < .1 ? .3 : 0), earWobble: 1.3, blush: 1, look: [0, 0], oMouth: .45 * (1 - toCam), headZ: side * .15,
      });
      if (toCam > 0) { pose.armR = [lerp(pose.armR[0], 1.35, toCam), lerp(-.2, -1.45, toCam)]; pose.look = [0, 0]; }
    }
  }
  poseCritter(copito, t, pose);

  // ---------- Monstruo
  const mo = monster.g; const MP = monster.P;
  let mp = { blink: blinkAt(t, 4), mouth: mouthAt('monster', t) * 1.1, look: [0, 0] };
  MP.pack.visible = t < 25.62;
  MP.swirlMat.uniforms.uTime.value = t;
  MP.swirlMat.uniforms.uFill.value = lerp(.05, .55, sstep(4.4, 8.4, t));
  MP.bulbs.forEach((b, i) => { b.material.emissiveIntensity = 1 + 2 * (Math.sin(t * 8 + i * 2) > 0 ? 1 : 0); });
  const transformK = sstep(29.0, 29.9, t);
  MP.bodyPurple.visible = t < 29.5; MP.bodyRainbow.visible = t >= 29.5; MP.dots.forEach((d) => (d.visible = t >= 29.5)); MP.spots.forEach((s) => (s.visible = t < 29.5));
  if (t < 4.0) { mo.visible = false; }
  else if (t < 9.0) {
    mo.visible = true; mo.position.set(12.5, 0, 0);
    const suck = sstep(4.4, 4.8, t) * (1 - sstep(8.2, 8.5, t));
    const giggle = Math.sin(t * 16) * .04 * suck;
    mo.rotation.set(0, Math.sin(t * 1.5) * .35 * suck + (t > 8.3 ? lerp(0, -1.3, sstep(8.3, 8.6, t)) : 0), 0);
    Object.assign(mp, { armL: [.6 + Math.sin(t * 5) * .3, -.3], armR: [.8, -.7], squash: giggle * 3 + Math.abs(Math.sin(t * 4)) * .1 * suck, look: [Math.sin(t * 1.3) * .6, .2], oMouth: .25 });
    if (t > 7.85 && t < 8.3) { mp.eyeBig = .4; mp.oMouth = .9; mp.squash = -.4 * hop(t, 7.85, .3); }
    if (t > 8.3) { mp.eyeBig = .6; mp.look = [-1, 0]; mp.oMouth = .7; }
    mo.position.y = (t > 7.85 && t < 8.3) ? hop(t, 7.85, .35) * .25 : 0;
  } else if (t < 15.2) {
    mo.visible = true;
    let y = 0, z = 0;
    for (const tj of JUMPS_M) y += hop(t, tj, .45) * .8;
    z = -pulse(t, 9.8, 10.35, .2) * .8;
    const c = runCycle(t, 17);
    y += Math.abs(c) * .1;
    mo.position.set(monX(t), y, z); mo.rotation.set(0, Math.PI / 2 + z * .4, Math.sin(t * 9) * .12);
    const lookBack = pulse(t, 10.9, 11.7, .2) + pulse(t, 13.0, 13.8, .2);
    Object.assign(mp, { legL: c * .9, legR: -c * .9, armL: [.9, c * .8], armR: [.9, -c * .8], bodyX: .15, bodyY: -lookBack * .9, look: [lookBack, 0], oMouth: .3 + lookBack * .3, eyeBig: .1 });
    if (t > 14.9) { const k = clamp((t - 14.9) / .3); mp.eyeBig = .6 * k; mp.oMouth = .9; }
  } else {
    mo.visible = true;
    const tumble = clamp((t - 15.2) / .8);
    mo.position.copy(MON_SIT); mo.rotation.set(0, -Math.PI / 2 + .45, 0);
    if (tumble < 1) { mo.position.x = lerp(46.3, MON_SIT.x, tumble); mo.position.y = Math.sin(tumble * Math.PI) * .4; mo.rotation.y -= easeInOut(tumble) * Math.PI * 2; mo.rotation.z = -Math.sin(tumble * Math.PI) * .4; }
    if (t < 22.0) {
      const cry = sstep(16.0, 16.6, t) * (1 - sstep(23.2, 24.2, t));
      const sob = Math.max(0, Math.sin(t * 9)) * cry;
      Object.assign(mp, { sad: cry, cry, squash: -sob * .12, armL: [.2 + cry * 1.5, -.8 * cry], armR: [.2 + cry * 1.5, -.8 * cry], legL: -1.0, legR: -1.0, look: [-.4, -.3], blink: Math.min(mp.blink, 1 - cry * .15) });
      if (t > 17 && t < 20.9) { mp.armL = [.5, -.3]; mp.armR = [.5, -.3]; mp.look = [-.7, .2]; }
    } else if (t < 25.6) {
      const cry = 1 - sstep(23.2, 24.4, t); const hope = sstep(24.3, 25.0, t); const reach = sstep(24.9, 25.45, t);
      Object.assign(mp, { sad: cry * .8 + (1 - hope) * .1, cry: cry * .8, legL: -1.0, legR: -1.0, look: [-.8, lerp(0, -.3, hope)], eyeBig: hope * .25, armL: [.4, -.3], armR: [lerp(.4, 1.2, reach), lerp(-.3, -1.3, reach)], oMouth: hope * .3 });
    } else if (t < 29.0) {
      const h = hop(t, 27.2, .5) + hop(t, 27.75, .5) + hop(t, 28.3, .5);
      mo.position.y = h * .45;
      Object.assign(mp, { eyeBig: .35, oMouth: .6, armL: [2.4, 0], armR: [2.4, 0], squash: -h * .4, legL: lerp(-1, 0, sstep(25.8, 26.4, t)), legR: lerp(-1, 0, sstep(25.8, 26.4, t)), look: [-.5, .3] });
    } else {
      // transformación y baile
      const spin = sstep(29.0, 29.9, t) * Math.PI * 4;
      const beat = (t - 29) / .5; const ph = beat % 1; const h = t > 29.9 ? Math.sin(ph * Math.PI) : 0; const side = Math.floor(beat) % 2 ? -1 : 1;
      mo.position.set(MON_SIT.x + .1, h * .32 + Math.sin(transformK * Math.PI) * .6, MON_SIT.z + .2);
      mo.rotation.set(0, -Math.PI / 2 + .7 + spin + (t > 29.9 ? side * .3 : 0) - sstep(31.4, 31.9, t) * .4, side * .12 * h);
      Object.assign(mp, { eyeBig: .3, oMouth: .7, armL: [1.4 + side * 1.0 * h, 0], armR: [1.4 - side * 1.0 * h, 0], squash: -h * .35, look: [0, .2], legL: side > 0 ? h * .6 : 0, legR: side < 0 ? h * .6 : 0 });
    }
  }
  poseMonster(monster, t, mp);

  // ---------- Osito (cameo en el baile)
  if (t > 29.3) {
    bear.g.visible = true;
    const enter = sstep(29.3, 30.4, t);
    const beat = (t - 29) / .5; const ph = beat % 1; const h = Math.sin(ph * Math.PI); const side = Math.floor(beat) % 2 ? 1 : -1;
    bear.g.position.set(lerp(41.5, 45.0, enter), h * .25, lerp(-.5, -1.1, enter)); bear.g.rotation.set(0, lerp(1.4, .55, enter), side * .1 * h);
    poseCritter(bear, t, { blink: blinkAt(t, 2), smile: 1, oMouth: .5, armL: [1.5 + side * h, -.2], armR: [1.5 - side * h, -.2], squash: -h * .3, legL: side > 0 ? h * .5 : 0, legR: side < 0 ? h * .5 : 0, look: [.3, .2] });
  } else bear.g.visible = false;

  // ---------- mariposas
  butterflies.forEach((b, i) => {
    const [r0, r1, r2, r3] = b.userData.r; const flap = Math.sin(t * (18 + r0 * 6) + i) * .9;
    b.userData.pl.rotation.y = flap; b.userData.pr.rotation.y = -flap;
    let c;
    if (t < 4.0) c = V(Math.cos(t * (.8 + r1) + i) * (1.2 + r2 * 2), .8 + r3 * 1.4 + Math.sin(t * 2 + i) * .2, Math.sin(t * (.8 + r1) + i) * (1.2 + r2 * 2) - .5);
    else if (t > 25.9) { const rr = 1.8 + r2 * 2.5; const a = t * (.6 + r1 * .5) + i; c = M.clone().add(V(Math.cos(a) * rr, .9 + r3 * 1.8 + Math.sin(t * 2 + i) * .25, Math.sin(a) * rr * .35 - 1.6)); }
    else c = V(0, -50, 0);
    // al llegar el gris las mariposas huyen hacia arriba
    if (t > 1.5 && t < 4.0) c.y += (t - 1.5) * (1.5 + r0 * 2);
    b.position.copy(c); b.rotation.set(.3, t * .6 + i, 0);
  });

  // ---------- arcoíris
  rainbow.material.uniforms.uFade.value = 1 - sstep(12.9, 13.7, t);
  rainbow.material.uniforms.uSat.value = 1 - sstep(12.4, 13.3, t);
  rainbow.visible = t > 8 && t < 14.5;
  bigRainbow.visible = t > 25.7;
  bigRainbow.material.uniforms.uGrow.value = sstep(25.7, 27.0, t);

  // ---------- gris / color
  if (t < 4.0) {
    DU.uC.value.set(1.35, .62); DU.uR.value = lerp(0, 2.6, sstep(1.5, 3.2, t)); DU.uEdge.value = 1;
    DU.uRR.value = 0; DU.uBoost.value = 0;
  } else if (t < 8.6) {
    const f = MP.funnel.getWorldPosition(new THREE.Vector3());
    DU.uC.value.copy(toUV(f)); DU.uR.value = lerp(.12, 2.4, sstep(4.6, 8.4, t)); DU.uEdge.value = 1; DU.uRR.value = 0;
    if (t < 5.1) DU.uR.value = .0;
  } else if (t < 25.6) {
    DU.uR.value = 9; DU.uEdge.value = 0; DU.uRR.value = 0;
  } else {
    const hands = COP_SIT.clone().lerp(MON_SIT, .5).add(V(0, .75, .3));
    DU.uRC.value.copy(toUV(hands)); DU.uRR.value = lerp(0, 3.2, sstep(25.6, 26.9, t)); DU.uBoost.value = lerp(.6, .18, sstep(26, 28, t));
    if (t > 27.1) { DU.uRR.value = 9; }
  }

  // ---------- luz mágica y destello
  const boomK = clamp((t - 25.6) / 1.2);
  magicLight.position.copy(M).add(V(0, 1.2, .8));
  magicLight.intensity = (t > 25.6 ? (1 - boomK) * 6 : 0);
  flash.visible = false;
  if (flash.visible) {
    const k = t < 27 ? clamp((t - 25.55) / .85) : clamp((t - 29.3) / .5);
    const c = t < 27 ? COP_SIT.clone().lerp(MON_SIT, .5).add(V(0, .8, .3)) : MON_SIT.clone().add(V(0, .7, .3));
    flash.position.copy(c); flash.scale.setScalar(.2 + k * (t < 27 ? 3 : 1.4)); flash.material.opacity = (1 - k) * .18;
  }
  shock.visible = t > 25.6 && t < 27.0;
  if (shock.visible) { const k = (t - 25.6) / 1.4; shock.position.copy(M).add(V(-.6, .8, .4)); shock.lookAt(camera.position); shock.scale.setScalar(1 + k * 22); ringMat.uniforms.uA.value = (1 - k) * .6; }
  bloom.strength = .45 + pulse(t, 25.6, 26.6, .1) * .2;

  // ---------- burbuja del hipo
  bubble.visible = t > 7.9 && t < 8.17;
  if (bubble.visible) { const k = (t - 7.9) / .27; bubble.position.set(12.5, .8 + k * .9, .7); bubble.scale.setScalar(.12 + k * .25); }

  // ---------- chispas
  let n = 0;
  const emit = (p, col, size) => { if (n >= SPARK_N) return; sPos[n * 3] = p.x; sPos[n * 3 + 1] = p.y; sPos[n * 3 + 2] = p.z; sCol.set(col, n * 3); sSize[n] = size; sSeed[n] = (n * .618) % 1; n++; };
  if (t < 1.6) for (let i = 0; i < 120; i++) { // brillos del bosque feliz
    const r = RND[i]; const ph = (t * .5 + r[0]) % 1;
    emit(V(-3 + r[1] * 6, .2 + ph * 2.5, -2.5 + r[2] * 4), RAIN[i % 8], 4 + 4 * Math.sin(ph * Math.PI));
  }
  if (t > 4.4 && t < 8.6) { // corrientes de color hacia el embudo
    const f = MP.funnel.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 900; i++) {
      const r = RND[200 + i]; const stream = i % 12; const life = 1.1; const tb = 4.4 + (i / 900) * 4.2; let age = t - tb;
      age = ((age % life) + life) % life; if (t < tb) continue;
      const a = stream / 12 * 6.28 + r[0] * .4; const rad = 2.2 + r[1] * 2.2;
      const src = V(12.5 + Math.cos(a) * rad, .2 + r[2] * .4, Math.sin(a) * rad * .8);
      const k = age / life; const kk = k * k;
      const p = src.clone().lerp(f, kk); p.y += Math.sin(k * Math.PI) * (.8 + r[3]);
      const sw = (1 - k) * .3; p.x += Math.sin(k * 12 + i) * sw; p.z += Math.cos(k * 12 + i) * sw;
      emit(p, RAIN[stream % 8], (6 + r[4] * 6) * (1 - kk * .6));
    }
  }
  if (t > 13.0 && t < 14.0) for (let i = 0; i < 120; i++) { // el arcoíris se deshace en chispas
    const r = RND[1200 + i]; const age = t - 13.0; const a = r[0] * Math.PI;
    const p = V(RAINBOW_X + (r[1] - .5) * .5, Math.sin(a) * 2.8 - age * age * 2, Math.cos(a) * 2.8);
    emit(p, [.8, .8, .85], (5 + r[2] * 5) * (1 - age));
  }
  if (t > 25.6 && t < 29) { // explosión de color
    const c = COP_SIT.clone().lerp(MON_SIT, .5).add(V(0, .8, .3));
    for (let i = 0; i < 420; i++) {
      const r = RND[1500 + i]; const age = t - 25.6 - r[4] * .3; if (age < 0) continue;
      const a = r[0] * 6.28, e = (r[1] - .3) * 1.6; const sp = (2 + r[2] * 7) * (1 - Math.exp(-age * 2.2)) / 2.2 * 2;
      const p = c.clone().add(V(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + .2 - age * age * .6, Math.sin(a) * Math.cos(e) * sp * .7));
      emit(p, RAIN[i % 8], (5 + r[3] * 6) * (1 - sstep(1.6, 3.2, age)));
    }
  }
  if (t > 29.0 && t < 30.2) { // remolino de transformación
    for (let i = 0; i < 140; i++) {
      const r = RND[2500 + i]; const k = (t - 29.0) / 1.2; const a = r[0] * 6.28 + k * 14; const rad = (1 - k) * 1.4 + .3;
      emit(MON_SIT.clone().add(V(Math.cos(a) * rad, r[1] * 1.6 + k * .5, Math.sin(a) * rad + .2)), RAIN[i % 8], 4 + r[2] * 4);
    }
  }
  if (t > 30) for (let i = 0; i < 220; i++) { // magia de fiesta
    const r = RND[3000 + i]; const ph = (t * .3 + r[0]) % 1;
    emit(M.clone().add(V((r[1] - .5) * 9, ph * 4, (r[2] - .5) * 5 - .5)), RAIN[i % 8], 4 + 4 * Math.sin(ph * Math.PI));
  }
  sparkGeo.setDrawRange(0, n);
  for (const k of ['position', 'color', 'size', 'seed']) sparkGeo.attributes[k].needsUpdate = true;

  // ---------- confeti
  const confOn = (t < 1.5) || t > 25.6;
  confetti.visible = confOn;
  if (confOn) {
    const center = t < 1.5 ? V(0, 0, 0) : M;
    const t0 = t < 1.5 ? 0 : 25.6;
    for (let i = 0; i < CONF_N; i++) {
      const r = RND[4000 + (i % 900)]; const age = t - t0 - r[4] * (t < 1.5 ? .3 : 1.5);
      let p;
      if (t < 1.5) p = center.clone().add(V((r[0] - .5) * 5, 3.2 - ((age + r[1] * 3) % 3.4), -2 + r[2] * 2.4));
      else { const ph = ((age * .35 + r[1]) % 1); p = center.clone().add(V((r[0] - .5) * 10, 5.5 - ph * 6, -3 + r[2] * 4.5)); }
      eul.set(t * (3 + r[3] * 5) + i, t * (2 + r[0] * 4), i); q.setFromEuler(eul);
      m4.compose(p, q, V(1, 1, 1)); confetti.setMatrixAt(i, m4);
    }
    confetti.instanceMatrix.needsUpdate = true;
  }
  // ---------- polvo del revolcón
  for (let i = 0; i < DUST_N; i++) {
    const r = RND[4900 + (i % 90)]; const age = t - 15.15 - r[0] * .3;
    if (age < 0 || age > 1.6) { m4.makeScale(0, 0, 0); dust.setMatrixAt(i, m4); continue; }
    const a = r[1] * 6.28; const sp = .6 + r[2] * 1.2;
    const p = V(46.2 + Math.cos(a) * sp * Math.sqrt(age), .1 + age * .3, Math.sin(a) * sp * Math.sqrt(age) * .6);
    const s = (.06 + r[3] * .06) * (1 + age) * (1 - sstep(.8, 1.4, age));
    m4.compose(p, q.identity(), V(s, s * .8, s)); dust.setMatrixAt(i, m4);
  }
  dust.instanceMatrix.needsUpdate = true;
  drawHUD(t);
}

function renderAt(t) {
  update(t);
  // máscara: los personajes conservan su color dentro de la zona gris
  renderer.shadowMap.autoUpdate = false;
  const prevBg = scene.background; scene.overrideMaterial = maskMat; camera.layers.set(1);
  sparks.visible = sparks.visible; const confVis = confetti.visible;
  renderer.setRenderTarget(maskRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
  scene.overrideMaterial = null; camera.layers.set(0); scene.background = prevBg; confetti.visible = confVis;
  renderer.shadowMap.autoUpdate = true; renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(null); renderer.autoClear = true;
  composer.render();
  renderer.autoClear = false; renderer.render(hudScene, hudCam);
}
await document.fonts.load('700 40px Fredoka');
window.renderAt = renderAt;
window.frameJPEG = (t, qq = .93) => { renderAt(t); return renderer.domElement.toDataURL('image/jpeg', qq); };
window.READY = true;
renderAt(+params.get('t') || 0);
