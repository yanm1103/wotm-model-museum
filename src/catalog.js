// What the site shows. Each exported costume is public/models/<PREFIX><costume>.glb (mesh, skeleton, idle and the list of
// animations) plus public/models/<PREFIX><costume>/aNNN.glb, one per animation (WoTM/tools/monglb.py --all --split).
// zoom: camera dolly per monster (Togera's tail and Raptros' wings make the box wide), as in the game port's save list.
export const MONSTERS = [
  { prefix: "LIZARD", name: "Togera", costumes: [0, 1, 2, 3], zoom: 1.35 },
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
