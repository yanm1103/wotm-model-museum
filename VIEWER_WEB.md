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
- **Togera complete (step 2 done for it):** 4 costumes, all 153 animations. Each `LIZARDn.glb` (245-280 KB) carries mesh,
  skeleton, the idle and the list of animations (scene `extras.animations`: `{k, id, frames, file}`); each other animation is
  `LIZARD/aNNN.glb` (only node names and keys), downloaded when picked. The four costumes give byte-identical animation files,
  so they share one folder: 3.3 MB for all 153 (2.8 MB gzipped), against ~13 MB sampled raw. Size cuts: keys that linear
  interpolation rebuilds within tolerance are dropped (142k of 823k kept; translation 0.01 units, rotation 5e-4 per quaternion
  component), constant tracks equal to the rest pose are left out (three.js restores a node when the previous animation stops),
  one bufferView per file, rotations as normalized int16. All 157 files pass the glTF validator (0 errors, 0 warnings).
- **Animations are identified by k** (index in the game's table), not by id: ids repeat (Togera has two animation 0s). The
  select shows "Idle" first, then "Animation <id>" sorted by id ("#1/#2" for repeated ids). No names yet: the decomp's
  `MonsterAnim` enum is still unnamed.
- **Player:** bar at the bottom with previous frame / play-pause / next frame, a frame slider (one step = one frame at 60/s) and
  "frame / total"; space and the arrow keys do the same. Paused, "Save as png" saves the chosen frame. The picked animation is
  kept when changing costume.
- **Front end:** Vite + plain JavaScript + three.js (no UI framework). `npm install`, `npm run dev` (development),
  `npm run build` (writes `dist/`, static, with relative paths for any host).
- **Generating the files** (from `WoTM`, with the user's own disc in `disc/`):
  - `python tools/monglb.py disc/MON/LIZARD0.NGP ../wotm-model-museum/public/models/LIZARD0.glb --all --split --anim-dir LIZARD`
    for each costume (about 2.5 min each; they can run in parallel); then one line in `src/catalog.js`.
  - `python tools/shellpics.py disc/SHELL ../wotm-model-museum/public` (11 stage pictures in `stages/` and 10 logos in
    `logos/`, from `SHELL.TEX/.RTX`).
- **All 11 monsters (2026-10-21):** 42 costumes, every animation; 112 MB at the time in `public/models` (3,707 files, all pass the glTF
  validator). Costumes only share animation files when they are byte-identical: rigid parts often differ per costume (Preytor's
  four costumes each have their own parts), so a costume's differing files go to `<PREFIX>_<costume>/` and the list inside its
  `.glb` points at them. Done by `merge.py` (kept outside the repos, in `wotm-export-tmp/`): export each costume with
  `--anim-dir <tmp>/c<costume>/<PREFIX>`, then merge.
- **Skinned meshes moved or hidden after skinning:** Agamo has skinned pieces with an object matrix (the game does
  skin(v) * M) and Zorgulon's costume 4 has skinned pieces that only show in 41 of 141 animations. glTF ignores a skinned
  mesh's node transform, so the exporter puts M on an `off_<obj>` node (scale 0 when hidden) with a copy of the skeleton under
  it (`boneN@obj`, same keys). The page leaves the copies out of the bones overlay and the count.
- **Checked:** `wotm-export-tmp/check.py` evaluates a `.glb` as glTF specifies and compares every mesh with `pose.py`; one
  animation per costume group, max distance 0.026 units (the key-reduction tolerance).
- **Goliath Prime costume 0** (`ASSBOSS0.NGP`, March 2002, gray, 59 animations) looks like an early version left on the disc;
  the select calls it "early version".
- **Effects (steps 5 and 6, 2026-10-21)**, ported from the game port's renderer (`native/wotm_model.hpp`), in `src/effects.js`:
  - **PS2 blend modes:** each material carries `extras.gs` ({blend: ALPHA_1, aref, zmsk}); the page sets custom blend factors
    and the shader output per mode (additive 0x48, subtractive 0x42, darken 0x46, the "negative" 0x81 of Kineticlops costume 3)
    and the GS alpha test (discard As·128 <= aref). The stage picture is now drawn in WebGL (it used to sit behind a transparent
    canvas), so the subtractive and negative modes have something to act on.
  - **Scrolling textures:** objects with uvScroll get uv keys; Kineticlops and Agamo loop a separate layer animation (0x91,
    scene `extras.uvLayer`, no longer listed as an animation), the rest come with each animation (`extras.uv`). The page moves
    the texture offset.
  - **Fire** (preset 141 IdolHeadFlame: Agamo, Magmo costume 4) and **lens flares** (HierLight with hasLensFlare: Robo-47
    costumes 1-3, Congar 2-4, Goliath final): `fx_<node>_<n>` nodes animated with the effect's matrix (scale 0 when off),
    parameters in `extras.fx`. The fire is simulated per game field (pauses with the player); flares are 18 screen sprites.
    Textures in `public/fx/` (from `LVL/CENTRAL.TEX/.RTX`, `wotm-export-tmp/fxtex.py`).
  - Re-export: 140 MB, 4,724 files, all pass the validator. Costumes share fewer animation files now (effect nodes differ).
  - The transparent "Save image" crops to the content (drops fully transparent margins). Additive glows (fire, flares)
    don't carry alpha, so they stay out of the transparent picture.
- **Next:** animation names when the decomp names them.

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
