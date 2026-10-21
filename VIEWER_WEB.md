# WotM Model Museum: viewer web dos monstros

Site estático para ver os monstros de War of the Monsters (PS2) no navegador: cada monstro e traje, todas as animações, com
wireframe e ossos. Só visualização: nenhuma lógica de jogo. Plano anotado em 2026-10-21; nada implementado ainda.

## Separação do repo da decomp
- **Este repo é separado do `WoTM` de propósito.** Os modelos extraídos são da Sony; sites assim (Models-Resource) vivem de
  tolerância e atendem pedidos de remoção. Um DMCA contra este site não pode atingir a decomp.
- Hospedar fora da conta do GitHub que tem o `WoTM`, ou em outra hospedagem: o GitHub conta as advertências de DMCA por conta.
- **Nada daqui volta para o `WoTM`.** A regra 1 do `CLAUDE.md` de lá continua: nenhum arquivo do jogo naquele repo. O exportador
  mora no `WoTM` (`tools/`) e grava os `.glb` direto aqui.

## Como fica a divisão
| Onde | O quê |
|---|---|
| `WoTM/tools/gltf.py` + `pose.py` + `animcurve.py` | exportador: lê o disco do usuário (`disc/MON/`) e grava `.glb` com malha, texturas, esqueleto e animações |
| `WoTM/docs/passos/MODELOS_3D.md` | referência do formato (travessia, esqueleto, paleta, texturas, misturas do GS, fogo, lens flare) |
| este repo | página (three.js) e os `.glb` exportados |

## Como a animação funciona (e por que amostrar)
- O WotM tem animação por esqueleto de verdade (não é por vértice, como no Crash do PS1). Há uma malha por traje, presa a ossos
  (3 ossos por vértice). Cada animação são curvas por canal (rotação X/Y/Z e translação de cada parte), com chaves e inclinações
  (`animcurve.py`). O `pose.py` já avalia as curvas e monta a matriz de cada osso.
- O glTF não guarda as curvas do jogo do jeito delas:
  - rotação: o jogo anima três ângulos (ordem do `mathfRotMatrixPRH`) e o glTF só aceita quaternion, que interpola diferente;
  - inclinação: o formato próprio do jogo (`slope()`) não corresponde exatamente ao spline do glTF;
  - as matrizes extras antes e depois da rotação, o canal de visibilidade e a regra de só remontar a parte quando o canal muda.
- Por isso o exportador **amostra**: avalia a pose de cada osso a cada quadro (60/s) e grava como chaves do glTF. O resultado
  continua por osso: em cada quadro vai uma rotação e uma posição por osso, nunca a malha. O three.js interpola, mostra o
  esqueleto e liga o wireframe normalmente.
- Alternativa mais fiel, para depois: avaliar as curvas originais no navegador (portar `animcurve.py` + `pose.py` para JS, umas
  500 linhas). Os arquivos ficam menores e o movimento sai idêntico ao do jogo; leva mais alguns dias.

## Plano
| Etapa | Onde | Estimativa |
|---|---|---|
| 1. Esqueleto e animações no `.glb`: ossos do `SKEL_BONE` viram joints, `restPoseInv` vira a matriz inversa de ligação (`inverseBindMatrices`), 3 pesos por vértice; partes rígidas sob `ANIM_XFORM` viram nós; cada animação amostrada a 60/s | `WoTM/tools` | 1–2 dias |
| 2. Tamanho: um `.glb` por traje só com malha e esqueleto; animações em arquivos à parte, carregadas quando o visitante escolhe; apagar chaves onde o movimento é quase linear; compressão (meshopt/quantização) | `WoTM/tools` | meio dia |
| 3. Página three.js: lista de monstros e trajes, lista de animações com play/pause e controle de quadro, câmera orbital | aqui | 1 dia |
| 4. Wireframe (opção do material) e ossos (`SkeletonHelper`) | aqui | ~1 hora |
| 5. Misturas do GS e textura rolando: a aditiva do Kineticlops (`0x48`) e os outros modos em material próprio; deslocamento de UV pelos canais animados | aqui | meio dia |
| 6. (Depois, se valer) fogo do Agamo e lens flare | aqui | — |

Total: 3 a 4 dias para os 11 monstros, todos os trajes e as animações, com wireframe e ossos.

## Monstros
Prefixos em `MON/<PREFIXO><traje>.NGP` (traje 0 a 3): MONKEY Congar, ROBOT Robo-47, LIZARD Togera, SHOGUN Ultra-V, MANTIS Preytor,
ENERGY Kineticlops, LAVA Magmo, DRAGON Raptros, ROCK Agamo, ALIEN Zorgulon, ASSBOSS Goliath Prime. Idle = animação 90.

## Fica de fora
Como no `MODELOS_3D.md`: molas do pelo e da cauda (`BoneSpring`), olhar procedural, camadas de mistura de animação e a luz do jogo.
