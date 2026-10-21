// O que o site mostra. Cada traje exportado é public/modelos/<PREFIXO><traje>.glb (WoTM/tools/monglb.py).
// zoom: aproximação da câmera (a cauda do Togera e as asas do Raptros deixam a caixa larga), como no wotm_savepics.hpp.
export const MONSTROS = [
  { prefixo: "LIZARD", nome: "Togera", trajes: [0], zoom: 1.35 },
];

// Fotos das fases do menu (WoTM/tools/shellpics.py), na ordem do jogo
export const FASES = [
  { arquivo: "fase_01_midtown_park", nome: "Midtown Park" },
  { arquivo: "fase_02_gamblers_gulch", nome: "Gamblers Gulch" },
  { arquivo: "fase_03_rosdale_canyon", nome: "Rosdale Canyon" },
  { arquivo: "fase_04_metro_city", nome: "Metro City" },
  { arquivo: "fase_05_century_airfield", nome: "Century Airfield" },
  { arquivo: "fase_06_atomic_island", nome: "Atomic Island" },
  { arquivo: "fase_07_baytown", nome: "Baytown" },
  { arquivo: "fase_08_club_caldera", nome: "Club Caldera" },
  { arquivo: "fase_09_tsunopolis", nome: "Tsunopolis" },
  { arquivo: "fase_10_ufo", nome: "UFO" },
  { arquivo: "fase_11_capitol", nome: "Capitol" },
];
