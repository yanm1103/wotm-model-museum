import * as THREE from "three";

// Effects the glTF can't describe on its own, ported from the game port's renderer (native/wotm_model.hpp in WoTM):
// the PS2 blend modes, scrolling textures, the fire on Agamo's head (and Magmo's costume 4) and the lens flares.

const BASE = import.meta.env.BASE_URL;

// ---------------------------------------------------------------- PS2 blend modes
//
// The exporter writes the GS state of each material in extras.gs: { blend (ALPHA_1 register, null = opaque), aref (alpha
// test threshold, -1 = none), zmsk (no depth write) }. Like the game port, the shader outputs premultiplied color and the
// blend factors reproduce the GS formula:
//   0x48 additive: (C·a, 0), ONE + ONE
//   0x42 subtractive: (C·a, 0), dst - src
//   0x46 darken: (0, a), ONE + (1 - a): darkens what is behind by the alpha
//   0x81 "negative" (Kineticlops costume 3): (C·a, a), dst·a - src, so the background shows inverted through it
//   anything else (0x44): (C·a, a), ONE + (1 - a), plain alpha blending
const MODE_OUT = [
  "gl_FragColor = vec4(gl_FragColor.rgb * gl_FragColor.a, gl_FragColor.a);",
  "gl_FragColor = vec4(gl_FragColor.rgb * gl_FragColor.a, 0.0);",
  "gl_FragColor = vec4(0.0, 0.0, 0.0, gl_FragColor.a);",
];

export function applyGs(material, gs) {
  if (!gs) return;
  // GS alpha test: discard when As * 128 <= aref (As = texture alpha * vertex alpha, 0x80 = 1.0)
  if (gs.aref >= 0) material.alphaTest = (gs.aref + 0.5) / 128;
  if (gs.blend == null) return; // opaque: three.js already forces alpha to 1
  material.depthWrite = !gs.zmsk;
  material.transparent = true;
  material.blending = THREE.CustomBlending;
  material.premultipliedAlpha = false;
  let mode = 0;
  const b = gs.blend;
  Object.assign(material, {
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    blendSrcAlpha: null,
    blendDstAlpha: null,
    blendEquationAlpha: null,
  });
  if (b === 0x48) {
    mode = 1;
    material.blendDst = THREE.OneFactor;
  } else if (b === 0x42) {
    mode = 1;
    material.blendDst = THREE.OneFactor;
    material.blendEquation = THREE.ReverseSubtractEquation;
  } else if (b === 0x46) {
    mode = 2;
  } else if (b === 0x81) {
    Object.assign(material, {
      blendDst: THREE.SrcAlphaFactor,
      blendEquation: THREE.ReverseSubtractEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
    });
  }
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>\n${MODE_OUT[mode]}`,
    );
  };
  material.customProgramCacheKey = () => `gs${mode}`;
}

// ---------------------------------------------------------------- scrolling textures
//
// Objects with the uvScroll flag move their texture coordinates through animation channels. Kineticlops and Agamo have a
// separate "layer" animation that only drives those channels and loops over whatever animation is playing (scene extras
// uvLayer); otherwise the uv keys come with each animation (animation extras uv). Each track: { node, t: [s], uv: [[u, v]] }.

function sampleUv(tr, t, out) {
  const ts = tr.t;
  const n = ts.length;
  if (t <= ts[0] || n === 1) return out.set(tr.uv[0][0], tr.uv[0][1]);
  if (t >= ts[n - 1]) return out.set(tr.uv[n - 1][0], tr.uv[n - 1][1]);
  let i = 1;
  while (ts[i] < t) i++;
  const k = (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
  const a = tr.uv[i - 1];
  const b = tr.uv[i];
  return out.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k);
}

export class UvScroll {
  constructor(root) {
    this.root = root;
    this.maps = new Map(); // node name -> [textures]
    this.layer = root.userData.uvLayer ?? null;
    this.tmp = new THREE.Vector2();
  }

  // the textures of a node's meshes, cloned so other meshes using the same picture don't move with it
  mapsOf(name) {
    let list = this.maps.get(name);
    if (list) return list;
    list = [];
    this.root.getObjectByName(name)?.traverse((o) => {
      if (!o.isMesh || o.userData.wire || !o.material.map) return;
      const t = o.material.map.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      o.material.map = t;
      list.push(t);
    });
    this.maps.set(name, list);
    return list;
  }

  update(time, clipTracks) {
    const done = new Set();
    if (this.layer) {
      const d = this.layer.duration;
      const t = d > 0 ? time % d : 0;
      for (const tr of this.layer.tracks) {
        this.apply(tr, t);
        done.add(tr.node);
      }
    }
    for (const tr of clipTracks ?? []) if (!done.has(tr.node)) this.apply(tr, time);
  }

  apply(tr, t) {
    sampleUv(tr, t, this.tmp);
    for (const map of this.mapsOf(tr.node)) map.offset.copy(this.tmp);
  }
}

// ---------------------------------------------------------------- particle textures (from LVL/CENTRAL.TEX, public/fx)

const fxTextures = {};
function fxTexture(name) {
  if (!fxTextures[name]) {
    const t = new THREE.TextureLoader().load(`${BASE}fx/${name}.png`);
    t.colorSpace = THREE.NoColorSpace;
    t.flipY = false; // v = 0 is the picture's first row, like the game port
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    fxTextures[name] = t;
  }
  return fxTextures[name];
}

// Additive sprite: texture * vertex color, with the GS's MODULATE gain (vertex color 0x80 = 1.0), output (rgb·a, 0)
function spriteMaterial(map, depthTest) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: `
      attribute vec4 color;
      varying vec2 vUv;
      varying vec4 vColor;
      void main() {
        vUv = uv;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec4 vColor;
      void main() {
        vec4 c = texture2D(map, vUv) * vColor;
        c.rgb *= 255.0 / 128.0;
        gl_FragColor = vec4(c.rgb * c.a, 0.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
  });
}

// Quads drawn as two triangles; arrays grow as needed
class QuadBatch {
  constructor(map, depthTest) {
    this.cap = 0;
    this.n = 0;
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, spriteMaterial(map, depthTest));
    this.mesh.frustumCulled = false;
  }

  begin() {
    this.n = 0;
  }

  reserve(quads) {
    if (quads <= this.cap) return;
    this.cap = Math.max(quads, this.cap * 2, 64);
    this.pos = new Float32Array(this.cap * 12);
    this.uv = new Float32Array(this.cap * 8);
    this.col = new Float32Array(this.cap * 16);
    const idx = new Uint32Array(this.cap * 6);
    for (let q = 0; q < this.cap; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  }

  // corners: 4 x [x, y, z, u, v]; color: [r, g, b, a] in 0..1
  quad(corners, color) {
    this.reserve(this.n + 1);
    const q = this.n++;
    corners.forEach((c, i) => {
      this.pos.set([c[0], c[1], c[2]], (q * 4 + i) * 3);
      this.uv.set([c[3], c[4]], (q * 4 + i) * 2);
      this.col.set(color, (q * 4 + i) * 4);
    });
  }

  end() {
    if (!this.cap) this.reserve(1);
    for (const name of ["position", "uv", "color"]) this.geometry.getAttribute(name).needsUpdate = true;
    this.geometry.setDrawRange(0, this.n * 6);
    this.mesh.visible = this.n > 0;
  }

  dispose() {
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ---------------------------------------------------------------- fire (preset 141 IdolHeadFlame)
//
// Simulated per game field like particleEmit/particleMove (docs/investigacoes/2026-10-21/fogo_agamo.md in WoTM): wind
// (0, 0, 3.2) added to the position, particles born with -wind (so they start still and speed up), air drag 0.0390625,
// life 20 fields, 2 per field when still. Everything in game space (Z up), inside the model's root node.

const WIND = [0, 0, 3.2];
const AIR = 0.0390625;
// color by age (R, G, B, A bytes, 0x80 = 1.0), indexed by age * 3072 / 4096
const FIRE_COLORS = [
  0x00808080, 0x28808080, 0x4b808080, 0x66808080, 0x80808080, 0x80808080, 0x7d808080, 0x72808080, 0x64808080, 0x54838180,
  0x457d7f80, 0x37687580, 0x284b6880, 0x19355f80, 0x0c21537d, 0x01124276,
];

let seed = 0x2545f491;
function rnd() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed >>> 8) / 16777216;
}

class Flame {
  constructor() {
    this.parts = [];
    this.prev = null;
    this.acc = 0;
  }

  // em: { e: [x, y, z], r0, r2 } (emitter position and basis, game space) or null when the emitter is hidden this frame
  step(em) {
    const parts = this.parts;
    for (let i = 0; i < parts.length; ) {
      const q = parts[i];
      q.age += 1;
      if (q.age >= 20) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      const vl = Math.hypot(q.v[0], q.v[1], q.v[2]);
      const den = Math.min(1 + AIR * vl, 2);
      const sc = Math.trunc(q.age) < 5 ? 1 - 0.2 * q.age + (0.2 * q.age) / den : 1 / den;
      for (let c = 0; c < 3; c++) {
        q.v[c] *= sc;
        q.p[c] += WIND[c] + q.v[c];
      }
      q.size += 1 - 1.5 * Math.min(q.age / 10, 1);
      i++;
    }
    if (!em) return;
    if (!this.prev) this.prev = [...em.e];
    const disp = [0, 1, 2].map((c) => em.e[c] - this.prev[c]);
    const rel = [0, 1, 2].map((c) => disp[c] * 0.8 - WIND[c]);
    this.acc += Math.max(2, (Math.hypot(...disp) * 4) / 15);
    const n = Math.floor(this.acc);
    this.acc -= n;
    for (let k = 1; k <= n && parts.length < 256; k++) {
      const frac = k / n;
      const remain = 1 - frac;
      const y = rnd();
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = 6.2831853 * rnd();
      const q = { p: [0, 0, 0], v: [0, 0, 0], size: 0, age: 0, sel: 0 };
      for (let c = 0; c < 3; c++) {
        const u = r * (Math.cos(th) * em.r0[c] + Math.sin(th) * em.r2[c]);
        q.v[c] = rel[c] - u;
        q.p[c] = this.prev[c] + 5 * u + disp[c] * frac - u * remain;
      }
      q.size = 7 + 8 * rnd();
      q.age = Math.floor(10 * rnd());
      q.sel = (seed >>> 13) & 3;
      parts.push(q);
    }
    this.prev = [...em.e];
  }
}

// ---------------------------------------------------------------- lens flare
//
// particleLensFlareRender: 18 constant sprites along the line from the screen center to the light, additive, without a depth
// test. Each row: texture (15..19), position t on the line, half size in GS pixels, rgb, strength.
const FLARE_ROWS = [
  [17, 1, 100, [255, 255, 255], 8],
  [15, 0.15, 6, [192, 192, 255], 1.4],
  [19, 0.125, 6, [255, 192, 224], 1],
  [17, -0.775, 30, [255, 224, 192], 0.9],
  [17, -0.125, 20, [192, 255, 224], 0.8],
  [17, 0.175, 20, [255, 192, 224], 0.75],
  [19, -0.1, 8, [224, 192, 255], 0.7],
  [17, -0.625, 40, [224, 192, 255], 0.7],
  [18, 1.125, 150, [255, 255, 255], 0.7],
  [15, 0.25, 10, [192, 255, 192], 0.7],
  [19, -0.15, 12, [192, 224, 255], 0.6],
  [19, -0.7, 32, [192, 255, 224], 0.5],
  [19, 0.35, 14, [255, 224, 192], 0.5],
  [15, -0.3, 20, [255, 255, 192], 0.5],
  [15, 0.4, 16, [255, 192, 192], 0.4],
  [18, -0.575, 30, [128, 255, 192], 0.2],
  [15, -0.075, 30, [255, 192, 255], 0.125],
  [18, -1.125, 120, [64, 255, 128], 0.125],
];
const FLARE_SIZE = { 15: 32, 17: 64, 18: 64, 19: 32 };

// ---------------------------------------------------------------- per-model effects

const m4 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const fw = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();

export class Effects {
  // root: the glTF scene; the effect nodes are "fx_*" children of the "WotM" node (game space), with extras.fx
  constructor(root) {
    this.game = root.getObjectByName("WotM");
    this.fires = [];
    this.lights = [];
    this.game?.traverse((o) => {
      const fx = o.userData.fx;
      if (fx?.type === "fire") this.fires.push({ node: o, flame: new Flame() });
      else if (fx?.type === "flare") this.lights.push({ node: o, fx });
    });
    this.fireBatch = this.fires.length ? new QuadBatch(fxTexture("fireball"), true) : null;
    this.flareBatches = {};
    if (this.lights.length) for (const t of [15, 17, 18, 19]) this.flareBatches[t] = new QuadBatch(fxTexture(`flare${t}`), false);
    this.simFrame = null;
    this.visible = true;
  }

  get empty() {
    return !this.fires.length && !this.lights.length;
  }

  // the objects to add: fire sprites go in the 3D scene, flares in the screen overlay
  get sceneObjects() {
    return this.fireBatch ? [this.fireBatch.mesh] : [];
  }

  get overlayObjects() {
    return Object.values(this.flareBatches).map((b) => b.mesh);
  }

  // node matrix in game space (the fx node is a direct child of "WotM"); null when hidden (scale 0)
  static local(node) {
    node.updateMatrix();
    const e = node.matrix.elements;
    if (Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) + Math.abs(e[4]) + Math.abs(e[5]) + Math.abs(e[6]) < 1e-6) return null;
    return e;
  }

  // Top of the fire for framing: it rises ~3.2 a field for 20 fields (like Model::computeFraming)
  expandBox(box) {
    for (const f of this.fires) {
      if (!Effects.local(f.node)) continue;
      f.node.getWorldPosition(v3);
      box.expandByPoint(v3);
      box.expandByPoint(v3.add(new THREE.Vector3(0, 55, 0)));
    }
  }

  // frame: the animation's current frame (60 a second); the fire moves by whole fields since the last call, so pausing
  // freezes it and a new model starts warmed up, like the game already running
  update(frame, camera) {
    if (!this.fireBatch) return;
    let steps = Math.floor(frame) - Math.floor(this.simFrame ?? frame);
    if (steps < 0 || steps > 8) steps = 1;
    this.simFrame = frame;
    for (const f of this.fires) {
      const e = Effects.local(f.node);
      const em = e && { e: [e[12], e[13], e[14]], r0: [e[0], e[1], e[2]], r2: [e[8], e[9], e[10]] };
      const n = f.flame.prev ? steps : em ? 30 : 0;
      for (let k = 0; k < n; k++) f.flame.step(em);
    }
    // camera axes in game space for sprites that face the screen
    const toGame = m4.copy(this.game.matrixWorld).invert();
    camera.getWorldDirection(fw).transformDirection(toGame);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion).transformDirection(toGame);
    right.crossVectors(fw, up).normalize();
    up.crossVectors(right, fw).normalize();
    const batch = this.fireBatch;
    batch.begin();
    batch.mesh.matrixAutoUpdate = false;
    batch.mesh.matrix.copy(this.game.matrixWorld);
    for (const f of this.fires)
      for (const q of f.flame.parts) {
        const t = (q.age * 3072) / 4096;
        const i0 = Math.min(15, Math.trunc(t));
        const i1 = Math.min(15, i0 + 1);
        const fr = t - Math.trunc(t);
        const c = [0, 1, 2, 3].map((b) => {
          const a = (FIRE_COLORS[i0] >>> (8 * b)) & 0xff;
          const z = (FIRE_COLORS[i1] >>> (8 * b)) & 0xff;
          return Math.min(255, Math.max(0, Math.trunc(a + (z - a) * fr)));
        });
        const color = [c[0] / 255, c[1] / 255, c[2] / 255, Math.min(255, c[3] * 2) / 255];
        const h = Math.max(q.size, 0);
        // UV by the 2 random bits (spritePacketInit): 3 normal, 1 mirrors U, 2 mirrors V, 0 both
        const u0 = q.sel & 2 ? 0 : 1;
        const u1 = 1 - u0;
        const v0 = q.sel & 1 ? 0 : 1;
        const v1 = 1 - v0;
        const vx = (sx, sy, u, v) => [
          q.p[0] + h * (sx * right.x + sy * up.x),
          q.p[1] + h * (sx * right.y + sy * up.y),
          q.p[2] + h * (sx * right.z + sy * up.z),
          u,
          v,
        ];
        batch.quad([vx(-1, 1, u0, v0), vx(-1, -1, u0, v1), vx(1, -1, u1, v1), vx(1, 1, u1, v0)], color);
      }
    batch.end();
    batch.mesh.visible &&= this.visible;
  }

  // Flares in screen pixels (overlay camera: x right, y down, w x h CSS pixels)
  updateFlares(camera, w, h) {
    if (!this.lights.length) return;
    for (const b of Object.values(this.flareBatches)) b.begin();
    camera.getWorldDirection(fw);
    const foc = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const p = new THREE.Vector3();
    const d = new THREE.Vector3();
    const rel = new THREE.Vector3();
    for (const l of this.lights) {
      if (!this.visible || !Effects.local(l.node)) continue;
      const mw = l.node.matrixWorld.elements;
      p.set(mw[12], mw[13], mw[14]);
      d.set(mw[4], mw[5], mw[6]).normalize(); // the beam is the node's Y axis
      rel.subVectors(p, camera.position);
      const W = rel.dot(fw);
      if (W < 1) continue;
      const s = p.clone().project(camera);
      const sx = (s.x * 0.5 + 0.5) * w;
      const sy = (0.5 - s.y * 0.5) * h;
      const { intensity, beamWidth, flags, rgb } = l.fx;
      let bright = intensity / (W * W);
      let size = Math.sqrt(Math.max(intensity, 0)) / W;
      if (flags & 8) {
        // directional: cosine between the beam and the light -> eye direction
        const dot = -d.dot(rel) / rel.length();
        const k = (flags & 0x10 ? Math.abs(dot) : Math.max(dot, 0)) + beamWidth - 1;
        if (!(bright * k > 0) || beamWidth === 0) continue;
        bright *= k / beamWidth;
        size *= k / beamWidth;
      }
      for (let k = 0; k < FLARE_ROWS.length; k++) {
        const [tex, t, half, rowRgb, a] = FLARE_ROWS[k];
        const col = rowRgb.map((c, j) => c * rgb[j]);
        let hg;
        if (k === 0) hg = half * size * a;
        else {
          hg = half;
          for (let j = 0; j < 3; j++) col[j] *= a * bright;
        }
        // all three below 1: this light's remaining sprites are dropped
        if (col[0] < 1 && col[1] < 1 && col[2] < 1) break;
        const cap = k === 0 ? 255 : 32;
        const px = cx + t * (sx - cx);
        const py = cy + t * (sy - cy);
        const hw = (hg * foc) / 384;
        const hh = (hg * foc) / 360.96;
        const tw = FLARE_SIZE[tex];
        const u0 = 0.5 / tw;
        const u1 = (tw - 0.5) / tw;
        const color = [...col.map((c) => Math.trunc(Math.min(Math.max(c, 0), cap)) / 255), 1];
        this.flareBatches[tex].quad(
          [
            [px - hw, py - hh, 0, u0, u0],
            [px - hw, py + hh, 0, u0, u1],
            [px + hw, py + hh, 0, u1, u1],
            [px + hw, py - hh, 0, u1, u0],
          ],
          color,
        );
      }
    }
    for (const b of Object.values(this.flareBatches)) b.end();
  }

  dispose() {
    this.fireBatch?.dispose();
    for (const b of Object.values(this.flareBatches)) b.dispose();
  }
}

// ---------------------------------------------------------------- background
//
// Drawn in WebGL instead of behind a transparent canvas: the subtractive and "negative" blend modes need the stage picture
// in the color buffer to act on it. A full-screen quad with the picture cropped like CSS "background-size: cover".
export class Background {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, scale: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `
        varying vec2 vUv;
        uniform vec2 scale;
        void main() {
          vUv = (uv - 0.5) * scale + 0.5;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }`,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.Camera();
    this.texture = null;
    this.color = new THREE.Color(0x16131b);
    this.request = 0;
  }

  // file: picture URL, or null for a plain color
  setPicture(url) {
    const mine = ++this.request;
    if (!url) {
      this.texture?.dispose();
      this.texture = null;
      return Promise.resolve();
    }
    return new THREE.TextureLoader().loadAsync(url).then((t) => {
      if (mine !== this.request) return t.dispose();
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture?.dispose();
      this.texture = t;
      this.material.uniforms.map.value = t;
    });
  }

  setColor(hex) {
    this.color.set(hex);
  }

  // clears and draws the background; solid = a plain THREE.Color instead of the picture or the visitor's color
  draw(renderer, w, h, solid = null) {
    renderer.setClearColor(solid ?? this.color, 1);
    renderer.clear();
    if (solid || !this.texture) return;
    const img = this.texture.image;
    const k = Math.max(w / img.width, h / img.height);
    this.material.uniforms.scale.value.set(w / (img.width * k), h / (img.height * k));
    renderer.render(this.scene, this.camera);
  }
}
