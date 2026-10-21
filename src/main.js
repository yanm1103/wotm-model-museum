import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MONSTERS, STAGES } from "./catalog.js";
import { applyGs, Background, Effects, UvScroll } from "./effects.js";

const BASE = import.meta.env.BASE_URL;

// The game does its color math straight on texture and vertex values, with no color space conversion. Turning off three.js
// color management makes the result match the game port's renderer (color * (0.7 + 0.6 * light)).
THREE.ColorManagement.enabled = false;

// Camera like the game port's save list (native/wotm_model.hpp, Renderer::render): 3/4 view to the right, slightly above
const YAW = THREE.MathUtils.degToRad(35);
const PITCH = THREE.MathUtils.degToRad(8);
const FOVY = 30;

const canvas = document.getElementById("scene");
const selMonster = document.getElementById("monster");
const selAnim = document.getElementById("anim");
const stageGrid = document.getElementById("stage-grid");
const showMesh = document.getElementById("show-mesh");
const showWire = document.getElementById("show-wire");
const showBones = document.getElementById("show-bones");
const selLight = document.getElementById("light");
const logo = document.getElementById("logo");
const stats = document.getElementById("stats");
const status = document.getElementById("status");
const download = document.getElementById("download");
const downloadLabel = document.getElementById("download-label");
const loadingBox = document.getElementById("loader");
const loadingText = document.getElementById("loader-text");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
const background = new Background();

// Lens flares are drawn over everything, in screen pixels (x right, y down)
const overlay = new THREE.Scene();
const overlayCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOVY, 1, 1, 10000);
scene.add(camera);

// Lighting: ambient + one directional light attached to the camera (the game port derives it from the camera yaw too).
// Intensities are the renderer's (color * (ambient + directional * max(0, n.L))); three.js Lambert divides by pi, hence * PI.
const ambient = new THREE.AmbientLight(0xffffff, 0);
const sun = new THREE.DirectionalLight(0xffffff, 0);
scene.add(ambient);
camera.add(sun, sun.target);

// The game port's light direction in camera space, in degrees: direction 0 = coming from behind the camera (lighting the
// monster's front), positive to the right; height 0 = horizontal. It does not depend on the monster.
const GAME_LIGHT = (() => {
  const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), -Math.cos(YAW) * Math.cos(PITCH));
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(dir);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const L = new THREE.Vector3(Math.sin(YAW - 0.7) * 0.6, 0.8, -Math.cos(YAW - 0.7) * 0.6).normalize();
  const local = cam.worldToLocal(dir.clone().add(L));
  return {
    az: Math.round(THREE.MathUtils.radToDeg(Math.atan2(local.x, local.z))),
    el: Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(local.y, -1, 1)))),
  };
})();

const LIGHT_PRESETS = {
  game: { amb: 0.7, dir: 0.6, ...GAME_LIGHT },
  unlit: { amb: 1.5, dir: 0, ...GAME_LIGHT },
  side: { amb: 0.35, dir: 1.2, az: 85, el: 15 },
  top: { amb: 0.45, dir: 1, az: 10, el: 80 },
  back: { amb: 0.4, dir: 1.3, az: 160, el: 25 },
};

function applyLight({ amb, dir, az, el }) {
  ambient.intensity = amb * Math.PI;
  sun.intensity = dir * Math.PI;
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  sun.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  sun.target.position.set(0, 0, 0);
}

// Wireframe: a copy of each mesh bound to the same bones, with a wire material. The solid mesh is pushed back a little
// (polygonOffset) so the lines don't fight with it in "solid + wireframe".
const wireMaterial = new THREE.MeshBasicMaterial({ color: 0xc8ecff, wireframe: true, transparent: true, depthWrite: false });

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

const gltfLoader = new GLTFLoader();
let lastTime = performance.now();
let current = null; // { root, mixer, bones, action, frames, file, idle, anims }
let request = 0;

// ---- visitor preferences (convenience only; the page works without them)
function remember(key, value) {
  try {
    localStorage.setItem("wotm." + key, value);
  } catch {}
}
function recall(key) {
  try {
    return localStorage.getItem("wotm." + key);
  } catch {
    return null;
  }
}

// ---- selects: monster, then its costume (hidden when the monster has only one)
const selCostume = document.getElementById("costume");
const costumeRow = document.getElementById("costume-row");
const filesOf = (m) => m.costumes.map((c) => `${m.prefix}${c}`);

MONSTERS.forEach((m, i) => {
  const op = document.createElement("option");
  op.value = i;
  op.textContent = m.name;
  selMonster.append(op);
});

// fills the costume select for the picked monster and selects `file` (or the first costume)
function fillCostumes(m, file) {
  selCostume.replaceChildren();
  m.costumes.forEach((c, i) => {
    const op = document.createElement("option");
    op.value = `${m.prefix}${c}`;
    op.textContent = m.labels?.[i] ?? `Costume ${c + 1}`;
    selCostume.append(op);
  });
  costumeRow.hidden = m.costumes.length < 2;
  selCostume.value = filesOf(m).includes(file) ? file : filesOf(m)[0];
}

function pickMonster(file) {
  const m = monsterOf(file) ?? MONSTERS[0];
  selMonster.value = MONSTERS.indexOf(m);
  fillCostumes(m, file);
  setMonster(selCostume.value);
}
// Background picker: one radio per stage, drawn as a thumbnail (small picture from stages/thumbs/, name below), plus a
// "Custom" tile for a plain color of the visitor's choice
const CUSTOM = "custom";
const DEFAULT_COLOR = "#2b2f3a";
const colorRow = document.getElementById("color-row");
const colorInput = document.getElementById("bg-color");
let customSwatch = null;

for (const s of [...STAGES, { file: CUSTOM, name: "Custom" }]) {
  const tile = document.createElement("label");
  tile.className = "thumb";
  tile.title = s.name;
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "stage";
  radio.value = s.file;
  let pic;
  if (s.file === CUSTOM) {
    pic = document.createElement("div");
    pic.className = "swatch";
    customSwatch = pic;
    // clicking the tile (even when already picked) opens the color picker
    tile.addEventListener("click", () => {
      try {
        colorInput.showPicker?.();
      } catch {}
    });
  } else {
    pic = document.createElement("img");
    pic.src = `${BASE}stages/thumbs/${s.file}.png`;
    pic.alt = "";
    pic.loading = "lazy";
    pic.width = 128;
    pic.height = 64;
  }
  const name = document.createElement("span");
  name.textContent = s.name;
  tile.append(radio, pic, name);
  stageGrid.append(tile);
}

function monsterOf(file) {
  return MONSTERS.find((m) => filesOf(m).includes(file));
}

// ---- background
let stage = STAGES[0].file;

function setStage(file) {
  stage = file;
  const custom = file === CUSTOM;
  background.setPicture(custom ? null : `${BASE}stages/${file}.png`).catch((e) => console.error(e));
  colorRow.hidden = !custom;
  const radio = stageGrid.querySelector(`input[value="${file}"]`);
  if (radio) radio.checked = true;
  remember("stage", file);
}

function setColor(hex) {
  colorInput.value = hex;
  customSwatch.style.background = hex;
  background.setColor(hex);
  remember("bgcolor", hex);
}
colorInput.addEventListener("input", () => setColor(colorInput.value));

function kb(bytes) {
  return `${Math.round(bytes / 1024).toLocaleString("en-US")} KB`;
}

// ---- monster
// Every solid sits a little behind (polygonOffset) so the wireframe lines win over it. The skinned body sits further back
// than the rigid parts: a part laid exactly on the body (the red eye of Goliath Prime's early version) wins the tie, as it
// does in the game, instead of fighting with the body (skinned on the GPU vs rigid: the two depths round differently).
function makeMaterial(original, skinned) {
  // Lambert = ambient + directional per fragment, over texture * vertex color (the glTF carries non-metallic PBR)
  const m = new THREE.MeshLambertMaterial({
    map: original.map,
    vertexColors: original.vertexColors,
    transparent: original.transparent,
    alphaTest: original.alphaTest,
    side: original.side,
    depthWrite: original.depthWrite,
    opacity: original.opacity,
    polygonOffset: true,
    polygonOffsetFactor: skinned ? 2 : 1,
    polygonOffsetUnits: skinned ? 2 : 1,
    flatShading: true, // hard shading: one normal per triangle (the game's own normals are smoothed)
  });
  if (m.map) m.map.colorSpace = THREE.NoColorSpace;
  applyGs(m, original.userData.gs); // the PS2 blend mode and alpha test (extras.gs from the exporter)
  m.name = original.name;
  original.dispose();
  return m;
}

function dispose(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [o.material].flat()) {
      if (m === wireMaterial) continue; // shared between monsters
      m.map?.dispose();
      m.dispose();
    }
  });
}

function solidMeshes(root) {
  const list = [];
  root.traverse((o) => o.isMesh && !o.userData.wire && list.push(o));
  return list;
}

function addWireframe(root) {
  for (const o of solidMeshes(root)) {
    let w;
    if (o.isSkinnedMesh) {
      w = new THREE.SkinnedMesh(o.geometry, wireMaterial);
      w.bind(o.skeleton, o.bindMatrix);
    } else {
      w = new THREE.Mesh(o.geometry, wireMaterial);
    }
    w.frustumCulled = false;
    w.userData.wire = true;
    o.add(w); // child with identity matrix: same place as the solid mesh
  }
}

// Bones: a line from each joint to its parent (SkeletonHelper) plus a dot on every joint, drawn over the mesh
const BONE_COLOR = new THREE.Color(0xf0a32a);
const BONE_TIP = new THREE.Color(0xfff1c9);
const jointTexture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
})();

function makeBones(root) {
  const lines = new THREE.SkeletonHelper(root);
  const col = lines.geometry.getAttribute("color");
  for (let i = 0; i < col.count; i += 2) {
    BONE_COLOR.toArray(col.array, i * 3); // parent end
    BONE_TIP.toArray(col.array, i * 3 + 3); // child end
  }
  Object.assign(lines.material, { depthTest: false, depthWrite: false, transparent: true });
  lines.renderOrder = 10;

  const positions = new Float32Array(lines.bones.length * 3);
  const joints = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
    new THREE.PointsMaterial({
      color: BONE_COLOR,
      size: 7,
      sizeAttenuation: false,
      map: jointTexture,
      alphaTest: 0.5,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  joints.frustumCulled = false;
  joints.renderOrder = 11;

  const group = new THREE.Group();
  group.add(lines, joints);
  group.userData = { lines, joints };
  return group;
}

const tmp = new THREE.Vector3();
function updateJoints(bones) {
  const { lines, joints } = bones.userData;
  const pos = joints.geometry.getAttribute("position");
  lines.bones.forEach((b, i) => b.getWorldPosition(tmp).toArray(pos.array, i * 3));
  pos.needsUpdate = true;
}

function disposeBones(bones) {
  for (const o of bones.children) {
    o.geometry.dispose();
    o.material.dispose();
  }
}

function layers() {
  return { mesh: showMesh.checked, wire: showWire.checked, bones: showBones.checked };
}

function applyLayers() {
  const l = layers();
  wireMaterial.opacity = l.mesh ? 0.45 : 0.9;
  if (!current) return;
  current.root.traverse((o) => {
    if (!o.isMesh) return;
    // material.visible (not o.visible) hides the solid mesh without hiding the wireframe, which is its child
    if (o.userData.wire) o.visible = l.wire;
    else o.material.visible = l.mesh;
  });
  current.bones.visible = l.bones && current.root.visible;
  current.effects.visible = l.mesh && current.root.visible; // fire and flares go with the solid mesh
}


function countTriangles(root) {
  let n = 0;
  for (const o of solidMeshes(root)) {
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  return n;
}

// The game port frames by height (wide screen). On narrow screens (phone in portrait) back off to fit the width.
let baseDist = 0;
function slack() {
  return 1 / Math.min(camera.aspect, 1);
}

function cameraLimits(dist) {
  camera.near = dist * 0.05;
  camera.far = dist * 6;
  camera.updateProjectionMatrix();
  controls.minDistance = dist * 0.3;
  controls.maxDistance = dist * 3;
  controls.update();
}

// Fixed box over the whole idle (Model::computeFraming): without it the camera "dances" with the animation
function frame(root, mixer, clip, zoom, effects) {
  const box = new THREE.Box3();
  const samples = 24;
  for (let s = 0; s < samples; s++) {
    mixer.setTime((clip.duration * s) / samples);
    root.updateMatrixWorld(true);
    box.expandByObject(root, true);
    effects.expandBox(box);
  }
  mixer.setTime(0);
  const center = box.getCenter(new THREE.Vector3());
  const side = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1e-3);
  baseDist = (side * 0.62) / Math.tan(THREE.MathUtils.degToRad(FOVY / 2)) / zoom;
  const dist = baseDist * slack();

  // game: camera at c + (sin yaw cos pitch, cos yaw cos pitch, sin pitch) * dist, Z up; here Y up (x, z, -y)
  const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), -Math.cos(YAW) * Math.cos(PITCH));
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.target.copy(center);
  cameraLimits(dist);
}

async function setMonster(file) {
  const mine = ++request;
  const mon = monsterOf(file);
  const label = mon?.name ?? file;
  const url = `${BASE}models/${file}.glb`;
  status.textContent = "";
  logo.hidden = true;
  if (mon) {
    logo.src = `${BASE}logos/${mon.prefix.toLowerCase()}.png`;
    logo.alt = mon.name;
    logo.onload = () => (logo.hidden = false);
  }
  remember("monster", file);

  // the spinner takes the monster's place until the new one is ready (shown after a moment, so a cached file doesn't flash)
  if (current) current.root.visible = current.bones.visible = current.effects.visible = false;
  player.hidden = true;
  selAnim.disabled = true;
  download.hidden = true;
  snapshot.hidden = snapshotAlpha.hidden = true;
  stats.textContent = "";
  loadingText.textContent = `Loading ${label}…`;
  const spinnerTimer = setTimeout(() => (loadingBox.hidden = false), 150);
  let bytes = 0;

  let gltf;
  try {
    gltf = await gltfLoader.loadAsync(url, (e) => {
      if (mine !== request) return;
      bytes = e.total || e.loaded;
      loadingText.textContent = e.total
        ? `Loading ${label}… ${Math.floor((100 * e.loaded) / e.total)}% (${kb(e.loaded)} of ${kb(e.total)})`
        : `Loading ${label}… ${kb(e.loaded)}`;
    });
  } catch (e) {
    if (mine === request) {
      clearTimeout(spinnerTimer);
      loadingBox.hidden = true;
      if (current) current.root.visible = true;
      applyLayers();
      status.textContent = `Could not load ${file}.glb`;
    }
    console.error(e);
    return;
  }
  if (mine !== request) {
    dispose(gltf.scene);
    return;
  }
  clearTimeout(spinnerTimer);
  loadingBox.hidden = true;

  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = makeMaterial(o.material, o.isSkinnedMesh);
      o.frustumCulled = false; // the skinned mesh's bounding box is the rest pose's
    }
  });
  addWireframe(root);

  const mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find((a) => a.name === "idle") ?? gltf.animations[0];
  const action = clip ? mixer.clipAction(clip).play() : null;
  const effects = new Effects(root);
  if (clip) {
    frame(root, mixer, clip, mon?.zoom ?? 1, effects);
    clip.uvTracks = animExtras(gltf, 0)?.uv;
  }

  if (current) {
    scene.remove(current.root, current.bones, ...current.effects.sceneObjects);
    for (const o of current.effects.overlayObjects) overlay.remove(o);
    current.mixer.stopAllAction();
    dispose(current.root);
    disposeBones(current.bones);
    current.effects.dispose();
  }
  // The skeleton is the "boneN" joints. The exporter also makes copies ("boneN@obj", under an "off_obj" node) for meshes the
  // game moves or hides after skinning (Agamo, Zorgulon), plus helper joints ("static_", "off_"): skinning uses them,
  // the bones overlay and the counter don't.
  root.traverse((o) => {
    if (o.isBone && !/^bone[^@]*$/.test(o.name)) o.isBone = false;
  });
  const bones = makeBones(root);
  scene.add(root, bones, ...effects.sceneObjects);
  for (const o of effects.overlayObjects) overlay.add(o);
  const uv = new UvScroll(root);
  current = { root, mixer, bones, action, frames: clip ? Math.round(clip.duration * FPS) : 0, file, idle: clip, effects, uv };
  applyLayers();
  setupPlayer();
  fillAnims(root.userData.animations ?? []);
  syncAnimNav();
  const n = (x) => `<strong>${x.toLocaleString("en-US")}</strong>`;
  stats.innerHTML = `${n(countTriangles(root))} triangles · ${n(bones.userData.lines.bones.length)} bones`;
  download.href = url;
  download.download = `${label.replace(/[^\w-]+/g, "_")}_${file}.glb`;
  downloadLabel.textContent = bytes ? `Download model (.glb) ${kb(bytes)}` : "Download model (.glb)";
  download.hidden = false;
  snapshot.hidden = snapshotAlpha.hidden = false;
}

// ---- save the picture the visitor composed: background (stage picture or color) + the 3D view, at screen resolution
const snapshot = document.getElementById("snapshot");
const snapshotAlpha = document.getElementById("snapshot-alpha");

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Transparent picture. The additive parts (Kineticlops' body, fire, flares) add light without writing alpha, so the canvas
// alpha alone would drop them. Instead the scene is drawn over black and over white: a pixel that lets a fraction
// (1 - a) of the background through differs by (1 - a) between the two, and additive light (which saturates over white)
// keeps its brightness as alpha. Color = the black render divided by alpha.
const BLACK = new THREE.Color(0, 0, 0);
const WHITE = new THREE.Color(1, 1, 1);
// Alpha at or below this (of 255) is treated as empty. Some browsers return black and white a step or two off (display
// color profiles, fingerprinting noise), which made every pixel slightly opaque and the crop keep the whole frame.
const MATTE_FLOOR = 6;

function grab(w, h, solid) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(solid);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(canvas, 0, 0);
  return g.getImageData(0, 0, w, h);
}

// The matted picture cropped to the box of every pixel with alpha > 0 (no fully transparent margins). The box comes from
// the alpha computed here, not from reading the picture back, which can add noise in some browsers.
function matte(w, h) {
  const b = grab(w, h, BLACK);
  const wt = grab(w, h, WHITE).data;
  const px = b.data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < px.length; i += 4) {
    let a = 0;
    for (let c = 0; c < 3; c++) a = Math.max(a, 255 - wt[i + c] + px[i + c]);
    a = Math.min(255, a);
    if (a <= MATTE_FLOOR) a = 0; // readback noise (color management, anti-fingerprinting) must not count as content
    for (let c = 0; c < 3; c++) px[i + c] = a ? Math.min(255, Math.round((px[i + c] * 255) / a)) : 0;
    px[i + 3] = a;
    if (a) {
      const x = (i >> 2) % w;
      const y = Math.floor((i >> 2) / w);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, w - 1, h - 1]; // nothing drawn: keep the full frame
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d").putImageData(b, -x0, -y0);
  return out;
}

async function saveImage(transparent) {
  const w = canvas.width;
  const h = canvas.height;
  const who = slug(monsterOf(selCostume.value)?.name ?? "monster"); // named when clicked, not when the file is ready
  let bgName = "custom";
  if (transparent) bgName = "transparent"; // nothing behind the monster: the PNG keeps the 3D view's alpha
  else if (stage !== CUSTOM) bgName = STAGES.find((s) => s.file === stage)?.name ?? stage;
  // the WebGL canvas is only readable right after a render, in the same task: render, then copy at once
  let out;
  if (transparent) {
    out = matte(w, h);
  } else {
    out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    draw();
    out.getContext("2d").drawImage(canvas, 0, 0);
  }
  const blob = await new Promise((r) => out.toBlob(r, "image/png"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${who}_${slug(bgName)}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

for (const [button, transparent] of [
  [snapshot, false],
  [snapshotAlpha, true],
]) {
  button.addEventListener("click", () => {
    saveImage(transparent).catch((e) => {
      status.textContent = "Could not save the image";
      console.error(e);
    });
  });
}

// a new monster keeps the costume position when it has one (third costume of Congar -> third of Togera)
selMonster.addEventListener("change", () => {
  const m = MONSTERS[Number(selMonster.value)];
  const old = monsterOf(selCostume.value);
  const i = old ? filesOf(old).indexOf(selCostume.value) : 0;
  pickMonster(filesOf(m)[i] ?? filesOf(m)[0]);
});
selCostume.addEventListener("change", () => setMonster(selCostume.value));
stageGrid.addEventListener("change", (e) => setStage(e.target.value));
for (const box of [showMesh, showWire, showBones]) {
  box.addEventListener("change", () => {
    applyLayers();
    remember("layers", JSON.stringify(layers()));
  });
}

// ---- drawer
const drawer = document.getElementById("drawer");
const drawerToggle = document.getElementById("drawer-toggle");
const panel = document.getElementById("panel");

function setDrawer(open) {
  drawer.classList.toggle("closed", !open);
  drawerToggle.setAttribute("aria-expanded", String(open));
  drawerToggle.setAttribute("aria-label", open ? "Hide controls" : "Show controls");
  panel.inert = !open;
}
drawerToggle.addEventListener("click", () => {
  const open = drawer.classList.contains("closed");
  setDrawer(open);
  remember("drawer", open ? "open" : "closed");
});
// on touch screens the open panel covers most of the view: a tap anywhere outside it closes it
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" || drawer.classList.contains("closed") || drawer.contains(e.target)) return;
  setDrawer(false);
  remember("drawer", "closed");
});

// ---- lighting controls
const sliders = {
  amb: { input: document.getElementById("amb"), out: document.getElementById("v-amb"), fmt: (v) => v.toFixed(2) },
  dir: { input: document.getElementById("dir"), out: document.getElementById("v-dir"), fmt: (v) => v.toFixed(2) },
  az: { input: document.getElementById("az"), out: document.getElementById("v-az"), fmt: (v) => `${v}°` },
  el: { input: document.getElementById("el"), out: document.getElementById("v-el"), fmt: (v) => `${v}°` },
};
const customOption = selLight.querySelector('option[value="custom"]');

function lightFromSliders() {
  return Object.fromEntries(Object.entries(sliders).map(([k, s]) => [k, Number(s.input.value)]));
}

function showLight(light, preset) {
  for (const [k, s] of Object.entries(sliders)) {
    s.input.value = light[k];
    s.out.textContent = s.fmt(light[k]);
  }
  customOption.hidden = preset !== "custom";
  selLight.value = preset;
  applyLight(light);
  remember("light", JSON.stringify({ preset, ...light }));
}

selLight.addEventListener("change", () => showLight(LIGHT_PRESETS[selLight.value], selLight.value));
for (const s of Object.values(sliders)) s.input.addEventListener("input", () => showLight(lightFromSliders(), "custom"));

// ---- animation list. The model file carries the idle and the list ({ k, id, frames, file }); each other animation is its own
// small .glb (only node names and the keys), downloaded when picked and played on the model, which finds each node by name.
// k is the index in the game's table: ids repeat (Togera has two animation 0s), k does not.
const IDLE_ID = 90;
const clipCache = new Map(); // url -> AnimationClip
let animRequest = 0;

// Bosses made of pieces (the plant) list each piece's animations: a.part is "Head", "Base"... (the other pieces keep
// their resting animation). a.first marks the animation the model file starts in (bosses have no idle 90).
function animLabel(a, list) {
  if (a.id === IDLE_ID && !a.part) return `Idle (${a.frames - 1} frames)`;
  const same = list.filter((b) => b.id === a.id && b.part === a.part);
  const n = same.length > 1 ? ` #${same.indexOf(a) + 1}` : "";
  const part = a.part ? `${a.part}: ` : "";
  return `${part}Animation ${a.id}${n} (${a.frames - 1} frames)`;
}

// boss animation keys are 100 * piece + index
const piece = (a) => (a.part ? Math.floor(a.k / 100) : 0);

function isIdle(a, list) {
  return list.some((b) => b.id === IDLE_ID && !b.part) ? a.id === IDLE_ID && !a.part : !!a.first;
}

function fillAnims(list) {
  current.anims = list;
  selAnim.replaceChildren();
  // idle first, then by piece (in file order) and game id
  const sorted = [...list].sort(
    (a, b) => isIdle(b, list) - isIdle(a, list) || piece(a) - piece(b) || a.id - b.id || a.k - b.k,
  );
  for (const a of sorted) {
    const op = document.createElement("option");
    op.value = a.k;
    op.textContent = animLabel(a, list);
    selAnim.append(op);
  }
  if (!list.length) {
    const op = document.createElement("option");
    op.textContent = current.idle ? "Idle" : "None";
    selAnim.append(op);
    return;
  }
  selAnim.disabled = false;
  const idle = list.find((a) => isIdle(a, list)) ?? list[0];
  selAnim.value = idle.k;
  // keep the visitor's animation when changing costume (all costumes share the list)
  const wanted = list.find((a) => String(a.k) === recall("anim"));
  if (wanted && wanted !== idle) {
    selAnim.value = wanted.k;
    setAnim(wanted);
  }
}

async function setAnim(a) {
  const mine = ++animRequest;
  const owner = current;
  remember("anim", a.k);
  let clip = isIdle(a, owner.anims) && owner.idle ? owner.idle : clipCache.get(`${BASE}models/${a.file}`);
  if (!clip) {
    status.textContent = `Loading ${animLabel(a, owner.anims)}…`;
    const url = `${BASE}models/${a.file}`;
    try {
      const g = await gltfLoader.loadAsync(url);
      clip = g.animations[0];
      clip.uvTracks = animExtras(g, 0)?.uv;
      clipCache.set(url, clip);
    } catch (e) {
      console.error(e);
      if (mine === animRequest) status.textContent = `Could not load ${a.file}`;
      return;
    }
    if (mine === animRequest) status.textContent = "";
  }
  if (mine !== animRequest || owner !== current) return;
  const action = owner.mixer.clipAction(clip);
  if (owner.action !== action) {
    owner.action?.stop();
    action.reset().play();
  }
  owner.action = action;
  owner.frames = Math.round(clip.duration * FPS);
  setupPlayer();
}

selAnim.addEventListener("change", () => {
  const a = current?.anims?.find((x) => String(x.k) === selAnim.value);
  if (a) setAnim(a);
});

// GLTFLoader doesn't keep animation extras: the scrolling texture keys (extras.uv) are read from the file's JSON
function animExtras(gltf, i) {
  return gltf.parser?.json?.animations?.[i]?.extras;
}

// ---- animation player. The exporter samples every animation at 60 frames per second, so frame n is at time n / 60.
const FPS = 60;
const player = document.getElementById("player");
const playButton = document.getElementById("play");
const prevFrame = document.getElementById("prev-frame");
const nextFrame = document.getElementById("next-frame");
const frameSlider = document.getElementById("frame");
const frameLabel = document.getElementById("frame-label");
const prevAnim = document.getElementById("prev-anim");
const nextAnim = document.getElementById("next-anim");
const animName = document.getElementById("anim-name");
let playing = true;
let shownFrame = -1;

function currentFrame() {
  return Math.min(Math.round(current.action.time * FPS), current.frames);
}

function showFrame() {
  if (!current?.action) return;
  const f = currentFrame();
  if (f === shownFrame) return;
  shownFrame = f;
  frameSlider.value = f;
  frameLabel.innerHTML = `<strong>${f}</strong> / ${current.frames}`;
}

function setPlaying(on) {
  playing = on;
  player.classList.toggle("paused", !on);
  playButton.setAttribute("aria-label", on ? "Pause" : "Play");
  playButton.title = on ? "Pause (space)" : "Play (space)";
}

function seek(f) {
  if (!current?.action) return;
  const n = current.frames + 1; // frames 0..frames, wrapping around
  f = ((f % n) + n) % n;
  current.action.time = f / FPS;
  current.mixer.update(0); // apply the pose without moving time
  showFrame();
}

function setupPlayer() {
  shownFrame = -1;
  syncAnimNav();
  if (!current.action || current.frames < 1) return;
  frameSlider.max = current.frames;
  seek(0);
  player.hidden = false;
}

function step(delta) {
  setPlaying(false);
  seek(currentFrame() + delta);
}

// the animation's name between the previous / next buttons (they're off when there is nothing to switch to)
function syncAnimNav() {
  animName.textContent = selAnim.selectedOptions[0]?.textContent ?? "";
  prevAnim.disabled = nextAnim.disabled = selAnim.disabled || selAnim.options.length < 2;
}

// previous / next animation in the list (wrapping around), as if picked in the select
function stepAnim(delta) {
  const n = selAnim.options.length;
  if (selAnim.disabled || n < 2) return;
  selAnim.selectedIndex = (selAnim.selectedIndex + delta + n) % n;
  selAnim.dispatchEvent(new Event("change"));
}
prevAnim.addEventListener("click", () => stepAnim(-1));
nextAnim.addEventListener("click", () => stepAnim(1));

playButton.addEventListener("click", () => setPlaying(!playing));
prevFrame.addEventListener("click", () => step(-1));
nextFrame.addEventListener("click", () => step(1));
// dragging the slider pauses on the picked frame
frameSlider.addEventListener("input", () => {
  setPlaying(false);
  seek(Number(frameSlider.value));
});

// keyboard: space = play/pause, arrows = one frame (when no form control has focus, so they keep their own keys)
window.addEventListener("keydown", (e) => {
  if (player.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, select, textarea, button, summary, a")) return;
  if (e.key === " ") setPlaying(!playing);
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
  else return;
  e.preventDefault();
});

// ---- loop
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    const slackBefore = slack();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (baseDist) {
      // keep the visitor's orbit and only adjust the distance to the new aspect
      const k = slack() / slackBefore;
      camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
      cameraLimits(baseDist * slack());
    }
  }
}

// background, then the 3D scene, then the lens flares on top
function draw(solid = null) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  background.draw(renderer, canvas.width, canvas.height, solid);
  if (current) {
    current.root.updateMatrixWorld();
    current.effects.updateFlares(camera, w, h);
  }
  renderer.render(scene, camera);
  overlayCamera.right = w;
  overlayCamera.bottom = h;
  overlayCamera.updateProjectionMatrix();
  renderer.render(overlay, overlayCamera);
}

renderer.setAnimationLoop(() => {
  resize();
  const now = performance.now();
  if (playing && current) {
    current.mixer.update(Math.min((now - lastTime) / 1000, 0.1)); // background tab: don't skip the whole animation
    showFrame();
  }
  lastTime = now;
  controls.update();
  if (current) {
    const t = current.action?.time ?? 0;
    current.uv.update(t, current.action?.getClip().uvTracks);
    current.root.updateMatrixWorld();
    current.effects.update(t * FPS, camera);
    if (current.bones.visible) updateJoints(current.bones);
  }
  draw();
});

// ---- start
// layers: { mesh, wire, bones }; older visits stored one "mesh" mode (solid / wire / both)
let savedLayers = null;
try {
  savedLayers = JSON.parse(recall("layers"));
} catch {}
const oldMode = recall("mesh");
if (!savedLayers && oldMode) savedLayers = { mesh: oldMode !== "wire", wire: oldMode !== "solid", bones: false };
if (savedLayers) {
  showMesh.checked = !!savedLayers.mesh;
  showWire.checked = !!savedLayers.wire;
  showBones.checked = !!savedLayers.bones;
}
// starts closed on narrow screens (the open panel would cover the monster); the visitor's last choice wins
const savedDrawer = recall("drawer");
drawer.style.transition = "none"; // no slide on page load
setDrawer(savedDrawer ? savedDrawer === "open" : window.innerWidth >= 700);
requestAnimationFrame(() => requestAnimationFrame(() => (drawer.style.transition = "")));

let savedLight = null;
try {
  savedLight = JSON.parse(recall("light"));
} catch {}
if (savedLight && savedLight.preset in LIGHT_PRESETS) showLight(LIGHT_PRESETS[savedLight.preset], savedLight.preset);
else if (savedLight?.preset === "custom" && ["amb", "dir", "az", "el"].every((k) => Number.isFinite(savedLight[k])))
  showLight(savedLight, "custom");
else showLight(LIGHT_PRESETS.game, "game");

const savedColor = recall("bgcolor");
setColor(/^#[0-9a-f]{6}$/i.test(savedColor ?? "") ? savedColor : DEFAULT_COLOR);
let savedStage = recall("stage");
if (savedStage === "") savedStage = CUSTOM; // earlier "None" option
setStage(savedStage === CUSTOM || STAGES.some((s) => s.file === savedStage) ? savedStage : STAGES[0].file);

pickMonster(recall("monster") ?? "");
