# WotM Model Museum: web viewer for the monsters

Static site to view the monsters of War of the Monsters (PS2) in the browser: every monster and costume, every animation, with
wireframe and bones. Viewing only: no game logic. Plan written on 2026-10-21.

## Status (2026-10-21)
- **Done:** step 1 for one monster (Togera, costume 0, idle only) and part of steps 3 and 4: a page with monster and background
  selects (each stage's wide picture, the same one the game port's save list shows), orbit camera, framing like the save list
  (3/4 view, yaw 35°, pitch 8°, fixed box over the whole idle), triangle counter, wireframe (solid / wireframe / both),
  lighting presets with sliders (ambient, directional, direction, height) and hard (flat) shading. The "Game" preset is the
  game port renderer's light (ambient 0.7 + directional 0.6, attached to the camera). The controls live in a drawer on the
  left that collapses to a small arrow button (starts closed on phones; state remembered per visitor). Backgrounds are picked
  from a thumbnail grid (128x64 thumbnails in `stages/thumbs/`, 24 KB each); the last tile, "Custom", is a solid color from
  a color picker. A button downloads the current `.glb`, and "Save image (.png)" saves what is on screen (background +
  monster, at the canvas size). While a model downloads, a spinner with progress takes its place (shown from the first
  paint, before the script arrives).
- **Slow networks** (production build, emulated in Edge): Slow 3G, spinner at 4.6 s and Togera at 24 s; 2G (250 kbit/s,
  800 ms), spinner at 2.3 s and Togera at 31 s. Screenshots in `docs/screenshots/2026-10-21/`: 01-04 per network (first
  paint, loading at 30% with the `.glb` still downloading, zoom, loaded), 05-06 Custom color, 07 the images Save image wrote.
- **Checked:** the `.glb` passes the official glTF validator (0 errors, 0 warnings) and, evaluated as glTF specifies, matches
  `pose.py` vertex by vertex at frames 0, 37 and 100 (max difference 0.008 units, from rounding residue in the encoded weights).
- **Size:** `LIZARD0.glb` is 316 KB: mesh 135 KB, texture 81 KB, idle animation 77 KB (161 frames), JSON 21 KB. Togera has 153
  animations (8,149 frames), about 4 MB per costume at this rate: step 2 matters.
- **Front end:** Vite + plain JavaScript + three.js (no UI framework). `npm install`, `npm run dev` (development),
  `npm run build` (writes `dist/`, static, with relative paths for any host).
- **Generating the files** (from `WoTM`, with the user's own disc in `disc/`):
  - `python tools/monglb.py disc/MON/LIZARD0.NGP ../wotm-model-museum/public/models/LIZARD0.glb` (`--anims 90,0` for more
    animations); then one line in `src/catalog.js`.
  - `python tools/shellpics.py disc/SHELL ../wotm-model-museum/public` (11 stage pictures in `stages/` and 10 logos in
    `logos/`, from `SHELL.TEX/.RTX`).
- **Next:** the other monsters and costumes; animation select with play/pause (step 3); bones (step 4).

## Keeping this repo apart from the decomp
- **This repo is separate from `WoTM` on purpose.** The extracted models belong to Sony; sites like this (Models-Resource) live
  on tolerance and honor takedown requests. A DMCA notice against this site must not reach the decomp.
- Host it outside the GitHub account that owns `WoTM`, or elsewhere: GitHub counts DMCA strikes per account.
- **Nothing here goes back to `WoTM`.** Rule 1 of its `CLAUDE.md` still holds: no game files in that repo. The exporter lives in
  `WoTM` (`tools/`) and writes the `.glb` files straight into this repo.

## Who does what
| Where | What |
|---|---|
| `WoTM/tools/monglb.py` (on top of `gltf.py` + `pose.py` + `animcurve.py`) | exporter: reads the user's disc (`disc/MON/`) and writes `.glb` with mesh, textures, skeleton and animations |
| `WoTM/tools/shellpics.py` | stage pictures and monster logos (`disc/SHELL/`) as PNG, for the background |
| `WoTM/docs/passos/MODELOS_3D.md` | format reference (traversal, skeleton, palette, textures, GS blending, fire, lens flare) |
| this repo | the page (three.js) and the exported files |

## How the animation works (and why it is sampled)
- WotM uses real skeletal animation (not per-vertex, like Crash on PS1). There is one mesh per costume, bound to bones (3 bones
  per vertex). Each animation is a set of per-channel curves (X/Y/Z rotation and translation of each part), with keys and
  slopes (`animcurve.py`). `pose.py` already evaluates the curves and builds each bone's matrix.
- glTF cannot store the game's curves as they are:
  - rotation: the game animates three angles (`mathfRotMatrixPRH` order) and glTF only takes quaternions, which interpolate
    differently;
  - slopes: the game's own format (`slope()`) does not map exactly to glTF's spline;
  - the extra matrices before and after the rotation, the visibility channel and the rule of only rebuilding a part when one
    of its channels changed.
- So the exporter **samples**: it evaluates every bone's pose at every frame (60/s) and writes them as glTF keys. The result is
  still per bone: each frame carries one rotation and one position per bone, never the mesh. three.js interpolates, shows the
  skeleton and does wireframe as usual.
- More faithful alternative, for later: evaluate the original curves in the browser (port `animcurve.py` + `pose.py` to JS,
  about 500 lines). Files get smaller and the motion is identical to the game's; a few more days of work.

## Plan
| Step | Where | Estimate |
|---|---|---|
| 1. Skeleton and animations in the `.glb`: `SKEL_BONE` bones become joints, `restPoseInv` becomes the inverse bind matrix (`inverseBindMatrices`), 3 weights per vertex; rigid parts under `ANIM_XFORM` become nodes; each animation sampled at 60/s | `WoTM/tools` | 1–2 days |
| 2. Size: one `.glb` per costume with only mesh and skeleton; animations in separate files, loaded when the visitor picks one; drop keys where the motion is nearly linear; compression (meshopt/quantization) | `WoTM/tools` | half a day |
| 3. three.js page: list of monsters and costumes, list of animations with play/pause and frame control, orbit camera | here | 1 day |
| 4. Wireframe (material option) and bones (`SkeletonHelper`) | here | ~1 hour |
| 5. GS blending and scrolling textures: Kineticlops' additive blend (`0x48`) and the other modes as custom materials; UV offset from the animated channels | here | half a day |
| 6. (Later, if worth it) Agamo's fire and lens flare | here | — |

Total: 3 to 4 days for the 11 monsters, all costumes and animations, with wireframe and bones.

## Monsters
Prefixes in `MON/<PREFIX><costume>.NGP` (costume 0 to 3): MONKEY Congar, ROBOT Robo-47, LIZARD Togera, SHOGUN Ultra-V, MANTIS
Preytor, ENERGY Kineticlops, LAVA Magmo, DRAGON Raptros, ROCK Agamo, ALIEN Zorgulon, ASSBOSS Goliath Prime. Idle = animation 90.

## Left out
As in `MODELOS_3D.md`: fur and tail springs (`BoneSpring`), procedural look-at, animation blend layers and the game's own
stage lighting.
