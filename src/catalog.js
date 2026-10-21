// What the site shows. Each exported costume is public/models/<PREFIX><costume>.glb (mesh, skeleton, idle and the list of
// animations); the animations are public/models/<PREFIX>/aNNN.glb, one per file, shared by the monster's costumes
// (WoTM/tools/monglb.py --all --split --anim-dir <PREFIX>). Game order (character select).
// labels: costume names in the select (default "costume N").
// zoom: camera dolly per monster (Togera's tail and Raptros' wings make the box wide), as in the game port's save list.
export const MONSTERS = [
  { prefix: "MONKEY", name: "Congar", costumes: [0, 1, 2, 3] },
  { prefix: "ROBOT", name: "Robo-47", costumes: [0, 1, 2, 3] },
  { prefix: "LIZARD", name: "Togera", costumes: [0, 1, 2, 3], zoom: 1.35 },
  { prefix: "SHOGUN", name: "Ultra-V", costumes: [0, 1, 2, 3] },
  { prefix: "MANTIS", name: "Preytor", costumes: [0, 1, 2, 3] },
  { prefix: "ENERGY", name: "Kineticlops", costumes: [0, 1, 2, 3] },
  { prefix: "LAVA", name: "Magmo", costumes: [0, 1, 2, 3] },
  { prefix: "DRAGON", name: "Raptros", costumes: [0, 1, 2, 3], zoom: 1.6 },
  { prefix: "ROCK", name: "Agamo", costumes: [0, 1, 2, 3] },
  { prefix: "ALIEN", name: "Zorgulon", costumes: [0, 1, 2, 3] },
  // ASSBOSS0.NGP (March 2002, gray, 59 animations) looks like an early version left on the disc; ASSBOSS1 is the final boss
  { prefix: "ASSBOSS", name: "Goliath Prime", costumes: [0, 1], labels: ["early version", "final"] },
];

// Stage pictures from the game menu (WoTM/tools/shellpics.py), in game order
export const STAGES = [
  { file: "01_midtown_park", name: "Midtown Park" },
  { file: "02_gamblers_gulch", name: "Gamblers Gulch" },
  { file: "03_rosdale_canyon", name: "Rosdale Canyon" },
  { file: "04_metro_city", name: "Metro City" },
  { file: "05_century_airfield", name: "Century Airfield" },
  { file: "06_atomic_island", name: "Atomic Island" },
  { file: "07_baytown", name: "Baytown" },
  { file: "08_club_caldera", name: "Club Caldera" },
  { file: "09_tsunopolis", name: "Tsunopolis" },
  { file: "10_ufo", name: "UFO" },
  { file: "11_capitol", name: "Capitol" },
];
