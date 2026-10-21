import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MONSTROS, FASES } from "./catalogo.js";

const BASE = import.meta.env.BASE_URL;

// As contas de cor do jogo são feitas direto nos valores da textura e do vértice, sem conversão de espaço de cor: desligar a
// gestão de cor do three.js deixa o resultado igual ao do Renderer do nativo (cor * (0,7 + 0,6 * luz)).
THREE.ColorManagement.enabled = false;

// Câmera como a da lista de saves (native/wotm_model.hpp, Renderer::render): 3/4 para a direita, um pouco acima
const YAW = THREE.MathUtils.degToRad(35);
const PITCH = THREE.MathUtils.degToRad(8);
const FOVY = 30;

const canvas = document.getElementById("cena");
const fundo = document.getElementById("fundo");
const selMonstro = document.getElementById("monstro");
const selFase = document.getElementById("fase");
const logo = document.getElementById("logo");
const estado = document.getElementById("estado");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOVY, 1, 1, 10000);
scene.add(camera);

// Luz do Renderer do nativo: ambiente 0,7 + direcional 0,6 * max(0, n.L). O Lambert do three.js divide por pi.
scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
const sol = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
camera.add(sol, sol.target); // a luz acompanha a câmera, como no nativo (calculada a partir do yaw da câmera)

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

const loader = new GLTFLoader();
let antes = performance.now();
let atual = null; // { root, mixer }
let pedido = 0;

// ---- preferências do visitante (só conveniência; funciona sem)
function lembrar(chave, valor) {
  try {
    localStorage.setItem("wotm." + chave, valor);
  } catch {}
}
function lembrado(chave) {
  try {
    return localStorage.getItem("wotm." + chave);
  } catch {
    return null;
  }
}

// ---- selects
for (const m of MONSTROS) {
  for (const t of m.trajes) {
    const op = document.createElement("option");
    op.value = `${m.prefixo}${t}`;
    op.textContent = m.trajes.length > 1 ? `${m.nome} (traje ${t + 1})` : m.nome;
    selMonstro.append(op);
  }
}
for (const f of FASES) {
  const op = document.createElement("option");
  op.value = f.arquivo;
  op.textContent = f.nome;
  selFase.append(op);
}
const semFundo = document.createElement("option");
semFundo.value = "";
semFundo.textContent = "Nenhum";
selFase.append(semFundo);

function monstroDe(arquivo) {
  return MONSTROS.find((m) => arquivo.startsWith(m.prefixo));
}

// ---- fundo
function trocarFundo(arquivo) {
  fundo.style.backgroundImage = arquivo ? `url("${BASE}fundos/${arquivo}.png")` : "none";
  lembrar("fase", arquivo);
}

// ---- monstro
function material(original) {
  // Lambert = ambiente + direcional por fragmento, sobre textura * cor de vértice (o glTF traz PBR sem metal)
  const m = new THREE.MeshLambertMaterial({
    map: original.map,
    vertexColors: original.vertexColors,
    transparent: original.transparent,
    alphaTest: original.alphaTest,
    side: original.side,
    depthWrite: original.depthWrite,
  });
  if (m.map) m.map.colorSpace = THREE.NoColorSpace;
  m.name = original.name;
  original.dispose();
  return m;
}

function descartar(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [o.material].flat()) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

// O enquadramento do nativo é pela altura (tela larga). Em tela estreita (celular em pé) afasta para caber na largura.
let distBase = 0;
function folga() {
  return 1 / Math.min(camera.aspect, 1);
}

function limitesDaCamera(dist) {
  camera.near = dist * 0.05;
  camera.far = dist * 6;
  camera.updateProjectionMatrix();
  controls.minDistance = dist * 0.3;
  controls.maxDistance = dist * 3;
  controls.update();
}

// Caixa fixa do idle inteiro (Model::computeFraming): sem isso a câmera "dança" com a animação
function enquadrar(root, mixer, clip, zoom) {
  const caixa = new THREE.Box3();
  const amostras = 24;
  for (let s = 0; s < amostras; s++) {
    mixer.setTime((clip.duration * s) / amostras);
    root.updateMatrixWorld(true);
    caixa.expandByObject(root, true);
  }
  mixer.setTime(0);
  const centro = caixa.getCenter(new THREE.Vector3());
  const lado = Math.max(...caixa.getSize(new THREE.Vector3()).toArray(), 1e-3);
  distBase = (lado * 0.62) / Math.tan(THREE.MathUtils.degToRad(FOVY / 2)) / zoom;
  const dist = distBase * folga();

  // jogo: câmera em c + (sen yaw cos pitch, cos yaw cos pitch, sen pitch) * dist, Z para cima; aqui Y para cima (x, z, -y)
  const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), -Math.cos(YAW) * Math.cos(PITCH));
  camera.position.copy(centro).addScaledVector(dir, dist);
  controls.target.copy(centro);
  limitesDaCamera(dist);

  // luz "de cima, da frente-esquerda da câmera", guardada no espaço da câmera para acompanhá-la
  const L = new THREE.Vector3(Math.sin(YAW - 0.7) * 0.6, 0.8, -Math.cos(YAW - 0.7) * 0.6).normalize();
  camera.updateMatrixWorld(true);
  sol.position.copy(camera.worldToLocal(camera.position.clone().add(L)));
  sol.target.position.set(0, 0, 0);
}

async function trocarMonstro(arquivo) {
  const meu = ++pedido;
  const mon = monstroDe(arquivo);
  estado.textContent = `Carregando ${mon?.nome ?? arquivo}…`;
  logo.hidden = true;
  if (mon) {
    logo.src = `${BASE}fundos/logo_${mon.prefixo.toLowerCase()}.png`;
    logo.alt = mon.nome;
    logo.onload = () => (logo.hidden = false);
  }
  lembrar("monstro", arquivo);

  let gltf;
  try {
    gltf = await loader.loadAsync(`${BASE}modelos/${arquivo}.glb`);
  } catch (e) {
    if (meu === pedido) estado.textContent = `Não consegui carregar ${arquivo}.glb`;
    console.error(e);
    return;
  }
  if (meu !== pedido) {
    descartar(gltf.scene);
    return;
  }

  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = material(o.material);
      o.frustumCulled = false; // a caixa da malha skinned é a da pose de base
    }
  });

  const mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find((a) => a.name === "idle") ?? gltf.animations[0];
  if (clip) {
    mixer.clipAction(clip).play();
    enquadrar(root, mixer, clip, mon?.zoom ?? 1);
  }

  if (atual) {
    scene.remove(atual.root);
    atual.mixer.stopAllAction();
    descartar(atual.root);
  }
  scene.add(root);
  atual = { root, mixer };
  estado.textContent = "";
}

selMonstro.addEventListener("change", () => trocarMonstro(selMonstro.value));
selFase.addEventListener("change", () => trocarFundo(selFase.value));

// ---- laço
function redimensionar() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    const folgaAntes = folga();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (distBase) {
      // mantém a órbita do visitante e só reajusta a distância à nova proporção
      const ajuste = folga() / folgaAntes;
      camera.position.sub(controls.target).multiplyScalar(ajuste).add(controls.target);
      limitesDaCamera(distBase * folga());
    }
  }
}

renderer.setAnimationLoop(() => {
  redimensionar();
  const agora = performance.now();
  atual?.mixer.update(Math.min((agora - antes) / 1000, 0.1)); // aba em segundo plano: não pular a animação inteira
  antes = agora;
  controls.update();
  renderer.render(scene, camera);
});

// ---- início
const faseSalva = lembrado("fase");
selFase.value = faseSalva !== null && [...selFase.options].some((o) => o.value === faseSalva) ? faseSalva : FASES[0].arquivo;
trocarFundo(selFase.value);

const monstroSalvo = lembrado("monstro");
if ([...selMonstro.options].some((o) => o.value === monstroSalvo)) selMonstro.value = monstroSalvo;
trocarMonstro(selMonstro.value);
