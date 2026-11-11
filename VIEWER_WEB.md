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
  a color picker. A button downloads the current `.glb` with every animation (built on click by
  `src/glbmerge.js`: the costume's file plus each `aNNN.glb` in its list, clips keep the exporter's names: `idle`, `anim<id>_k<k>`), and "Save image (.png)" saves what is on screen (background +
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
  select shows "Idle" first, then "Animation <id>" sorted by id ("#1/#2" for repeated ids).
- **Animation names (2026-11-05):** `src/anim-ids.json`, made by `npm run anim-ids` (`scripts/anim-ids.mjs`) from the
  decomp's `docs/ANIM_IDS.md` (`-- --ref wip/cj` reads it from that branch) and, for the attack slots, the combo table of
  each `RST/<PREFIX>.CHR` (`tools/chr_dump.py --csv`, needs Python and the disc; without them the last combos are kept).
  The list groups the animations by kind (chips filter one kind), shows id, short name, how it plays (loop / hold / layer /
  additive) and the frames; "?" marks a "likely" or "guess", and a guess is dimmed. The tooltip, and a line under the
  picked one, give the table's description, the combo and the confidence. Attack slots are named by button and hit of a
  combo ("Attack: □ 1/3 · △ 6"), never by the move, which is each monster's own. Only the 11 monsters the table covers get
  names; the plant and Cerebulon keep "Animation <id>". The short names and groups live in the script; when the table
  changes, it warns about new ids, gone ids and changed descriptions.
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
  - The transparent "Save image" draws the scene over black and over white and rebuilds the alpha from the difference
    (additive parts like Kineticlops' body, fire and flares write no alpha, so the canvas alpha alone dropped them), then
    crops to the content (drops fully transparent margins).
- **Detail levels / LOD (2026-11-10):** the monsters' `.NGP` files hold up to 4 levels of detail per LOD node (same skeleton;
  index 0 is the coarsest). The costume's own `.glb` is the most detailed level the game draws (a last level with
  `switchOutDis` 0, like Togera costume 3's A-pose mesh, is never drawn and is skipped). The "Detail (LOD)" chips under
  "Costume" pick one; the last chip is the costume's own file. `python scripts/export-lods.py [NAME...]` (needs `WoTM/disc`
  and `monglb.py --lod N` from the decomp repo) writes `public/models/lod/<COSTUME>_L<n>.glb` and `lod/index.json`
  (`{ COSTUME: { levels: [...] } }`, the page reads it on start; a costume without an entry has no chips). Animation files:
  costumes with no rigid parts (Congar, Magmo, Ultra-V...) share the costume's own files, since a level only changes the
  skinned mesh; costumes with rigid parts export every animation per level (on Robo-47 level 0 none of the 161 files
  matched the costume's), with files identical to the costume's or to another level's stored once.
- **Bosses (2026-10-21):** "Plant boss", "Plant boss root" and "Cerebulon" (the final boss: costumes "stage 1: Mecha",
  "stage 2: Jelly", "stage 3") in the monster select. Monster and costume are separate selects; the costume one is hidden
  when the monster has a single costume.
  - Plant (`PLANT0`): pieces of the 3-MILE level, put together where `PlantBoss.cpp` places them: base (0x2728) at the
    origin and the three heads (0x271B..0x271D) at their `wakeUp` offsets, with each head's switch 999 turned on (the parts
    the fight shows). Animations are per piece ("Head: Animation n" plays on the three heads, "Base: ..."), the other piece
    staying in its resting animation (head id 0, base id 1). The game picks animations by id (`animationGetHandle`), not
    by table position, and the heads' tables are in different orders, so pieces are matched by id. `PLANT1` is one root
    (0x271E) on its own: the game puts ten around the player, up to 1075 units away.
  - Final boss: stage 1 is the Mecha from CAPITOL (0x27A6, with the turret 0x27A7 looping its animation 1 as
    `FinalBoss::initAfter` starts it; the laser 0x27A9 at rest), stage 2 `MON/JELLY0` (it has a lens flare), stage 3
    `MON/FINAL0`. The separate 0x27A8 piece (one object) is left out: nothing in the decomp shows what it is yet.
  - `monglb.py --boss plant|root|mecha` (level `.NGP` as input); keys are 100 * piece + index, `extras.animations` entries
    carry `part` and `first` (the animation the base file starts in, since bosses have no idle 90).
- **New layout (2026-11-05), copied from the GrandChase model viewer** (`grandchase/tools/visualizador`, same colors, chips
  and buttons): header (Ko-fi, showcase, save picture), an icon rail on each side and a footer. The left rail opens a drawer
  with what to show: Monsters (logo tiles, the bosses by name, costume chips on top) and Animations (a list with the frame
  count; the plant's pieces as groups). The right rail opens a panel with sections: Model (mesh / wireframe / bones, download),
  Scene (background tiles, floor grid), Lighting, Picture and video, About (keys, credits). This replaces the selects and the
  single collapsible drawer. The player is the GrandChase bar at the bottom of the stage (speed as chips, hides to a small
  arrow). Phones (`max-width: 760px`, or a coarse pointer under 520 px tall): the rails become one bar at the bottom, the
  open drawer a sheet between the stage and that bar (one at a time), its height changed by dragging its top and remembered;
  lying down, the sheet goes to the right of the stage.
- **Floor grid (2026-11-05):** Blender-style grid on the game's ground (y = 0): thin lines every 10 units, thick every 100, X
  axis red and Z axis green, fading out at about three times the monster's size. On by default; G or Scene > Floor turns it
  off. Left out of the transparent picture, kept in the normal picture and the video (what is on screen).
- **Shading (2026-11-05):** the page used flat shading (one normal per triangle), which showed every face (Kineticlops' eye
  most of all). The game port lights per vertex with the game's own normals (`0.7 + 0.6 * max(0, n.L)`), and every `.glb`
  carries them (no zero normal in any file). Lighting > Shading now picks Smooth (those normals, the default, like the game;
  per pixel here) or Flat (the old look); F switches, remembered per visitor.
  - **Winding:** in 47% of the triangles (all files; 31-56% per file) the vertex order is the opposite of the vertex
    normals (PS2 strips), so winding says nothing about the front; hence every material is double-sided. three.js flips the
    normal of a triangle it sees from the back, which lit about half the faces from the wrong side in Smooth. The page takes
    that flip out of the shader (`keepGameNormals` in `main.js`), using the normal as it is, like the game port. Fixing the
    winding in `monglb.py` would also work, but means exporting every file again.
- **Surface views (2026-11-05):** Model > Surface shows Texture (the game's look), Normals (view space: red = right,
  green = up, blue = toward the camera) or Vertex colors (`COLOR_0` alone); V switches. Parts cut out by the alpha test keep
  their shape; fire and flares only show with Texture. The files hold no other map: one color texture (`baseColorTexture`,
  PNG) per part, no normal map; per vertex: position, normal, vertex color, UV and, on skinned parts, joints and weights.
  Vertex colors vary on some monsters (Kineticlops 147 distinct, Robo-47 23) and are flat gray on others (Togera one color).
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
