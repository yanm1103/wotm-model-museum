// Builds src/anim-ids.json (what each animation id is) from the decomp's table, WoTM/docs/ANIM_IDS.md.
//   node scripts/anim-ids.mjs [path/to/ANIM_IDS.md]      default ../WoTM/docs/ANIM_IDS.md
//   node scripts/anim-ids.mjs --ref wip/cj               reads it from that branch of ../WoTM (git show)
// The table gives the long description, the loop kind, who has it and the confidence. The short name and the group
// shown in the list are ours (NAMES below): the table has no such columns. When the table changes, run this again: it
// warns about ids without a short name, names for ids gone from the table and descriptions that changed since the last
// run (their short name may need a look), and compares "who has it" with the costume 0 files in public/models.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "anim-ids.json");
const DECOMP = path.resolve(ROOT, "..", "WoTM");

// the table's abbreviations -> the museum's file prefix (costume 0 of each, as the table says)
const WHO = {
  Con: "MONKEY", Rob: "ROBOT", Tog: "LIZARD", UV: "SHOGUN", Pre: "MANTIS", Kin: "ENERGY",
  Mag: "LAVA", Rap: "DRAGON", Aga: "ROCK", Zor: "ALIEN", Gol: "ASSBOSS",
};

const GROUPS = [
  ["idle", "Idle"],
  ["move", "Movement"],
  ["jump", "Jump and air"],
  ["attack", "Attacks"],
  ["grab", "Grabs and objects"],
  ["block", "Block"],
  ["hit", "Taking hits"],
  ["down", "Knockdown and KO"],
  ["victory", "Taunt and victory"],
  ["special", "Special"],
  ["cinema", "Cinema"],
  ["other", "Not identified"],
];

// id: [group, short name]. Attack slots and specials: the role is shared, the move is each monster's, so the name says
// only the role (the attack slots add their combo slots, readCombos). Ids no code uses: the table's names for them come
// from looking at Ultra-V alone, so they are "Not used by the code".
const NAMES = {
  0: ["other", "Not reachable by id"],
  1: ["move", "Walk"],
  2: ["move", "Run"],
  3: ["other", "Not used by the code"],
  5: ["move", "Run lean (direction)"],
  6: ["move", "Run after landing"],
  7: ["move", "Walk backward"],
  8: ["move", "Run backward"],
  9: ["move", "Run backward after landing"],
  10: ["attack", "Attack"],
  11: ["attack", "Attack"],
  12: ["attack", "Attack"],
  13: ["attack", "Attack"],
  14: ["attack", "Attack"],
  15: ["attack", "Attack"],
  16: ["attack", "Attack"],
  17: ["attack", "Attack"],
  18: ["attack", "Attack"],
  19: ["attack", "Attack"],
  20: ["attack", "Attack"],
  21: ["attack", "Attack"],
  22: ["attack", "Attack"],
  23: ["attack", "Attack"],
  26: ["attack", "Attack slot (unused)"],
  30: ["jump", "Jump take-off"],
  31: ["jump", "Running take-off 1"],
  32: ["jump", "Running take-off 2"],
  33: ["jump", "Rising"],
  34: ["jump", "Falling"],
  35: ["jump", "Landing impact"],
  36: ["jump", "Air lean: turning"],
  37: ["jump", "Air lean: drift 1"],
  38: ["jump", "Air lean: drift 2"],
  39: ["jump", "Landing recovery"],
  41: ["grab", "Pick up object"],
  42: ["grab", "Pick up large object"],
  48: ["grab", "Pick up object up high"],
  49: ["grab", "Catch thrown object"],
  50: ["grab", "Carry object"],
  52: ["grab", "Throw object"],
  54: ["grab", "Javelin throw"],
  55: ["grab", "Throw at target"],
  56: ["grab", "Throw straight ahead"],
  58: ["other", "Not used by the code"],
  59: ["other", "Not used by the code"],
  60: ["block", "Block"],
  61: ["block", "Block holding object"],
  62: ["block", "Block holding large object"],
  63: ["block", "Block holding object 0x10"],
  64: ["block", "Counter"],
  65: ["block", "Blocked hit, object 0x10"],
  66: ["block", "Blocked hit, large object"],
  67: ["hit", "Hit on the left"],
  68: ["hit", "Hit on the right"],
  69: ["hit", "Hit from behind"],
  70: ["hit", "Hit from the front"],
  71: ["block", "Blocked hit"],
  74: ["hit", "Shocked"],
  75: ["hit", "Big hit (Goliath)"],
  76: ["hit", "Countered"],
  77: ["block", "Blocked big hit"],
  78: ["other", "Not used by the code"],
  79: ["other", "Not used by the code"],
  80: ["down", "Lying face up"],
  81: ["down", "Lying face down"],
  82: ["hit", "Air recovery counter"],
  83: ["other", "Not used by the code"],
  84: ["other", "Not used by the code"],
  85: ["down", "Knocked down, face down"],
  86: ["down", "Knocked down, face up"],
  87: ["down", "Get up from face down"],
  88: ["down", "Get up from face up"],
  89: ["other", "Not used by the code"],
  90: ["idle", "Idle"],
  92: ["victory", "Taunt"],
  93: ["victory", "Taunt 2 (Goliath)"],
  95: ["idle", "Idle, low health"],
  96: ["idle", "Idle, special ready"],
  97: ["idle", "Fancy idle"],
  98: ["idle", "Fancy idle"],
  99: ["idle", "Fancy idle"],
  100: ["move", "Climb: latch on"],
  101: ["move", "Climb up"],
  102: ["move", "Climb down"],
  103: ["move", "Climb sideways, left"],
  104: ["move", "Climb sideways, right"],
  105: ["move", "Climb over the ledge"],
  106: ["move", "Hang at the top"],
  110: ["jump", "Glide"],
  111: ["jump", "Glide layer"],
  113: ["jump", "Flap"],
  114: ["jump", "Flap, stick back"],
  120: ["down", "KO"],
  121: ["down", "KO lying face down"],
  122: ["down", "KO lying face up"],
  130: ["victory", "Victory 1"],
  131: ["victory", "Victory 2"],
  132: ["victory", "Victory 3"],
  140: ["attack", "Projectile recoil"],
  142: ["hit", "Stunned"],
  143: ["hit", "Impaled (not played)"],
  144: ["hit", "Pull out the impaler"],
  145: ["other", "Not used by the code"],
  150: ["hit", "Flinch, pushed right"],
  151: ["hit", "Flinch, pushed left"],
  152: ["hit", "Flinch from behind"],
  153: ["hit", "Flinch from the front"],
  154: ["idle", "Head look: sideways"],
  155: ["idle", "Head look: up and down"],
  156: ["jump", "Legs in the air"],
  160: ["special", "Special: windup"],
  161: ["special", "Special: loop"],
  162: ["special", "Special: winddown"],
  163: ["special", "Crowd control: windup"],
  164: ["special", "Crowd control: loop"],
  165: ["special", "Crowd control: winddown"],
  166: ["special", "Special aim"],
  167: ["special", "Special aim 2"],
  170: ["grab", "Grab"],
  171: ["grab", "Lift overhead"],
  172: ["grab", "Idle, carrying"],
  173: ["grab", "Walk, carrying"],
  174: ["grab", "Held by the grabber"],
  176: ["grab", "Walk backward, carrying"],
  177: ["grab", "Overhead hit"],
  178: ["grab", "Overhead hit 2"],
  180: ["jump", "Jump take-off, carrying"],
  181: ["jump", "Rising, carrying"],
  182: ["jump", "Falling, carrying"],
  183: ["jump", "Landing, carrying"],
  184: ["other", "Not used by the code"],
  185: ["grab", "Grab miss"],
  186: ["grab", "Overhead finisher"],
  189: ["other", "Not used by the code"],
  191: ["other", "Not a body animation"],
  192: ["special", "Crowd control in the air"],
  193: ["special", "Crowd control from the air"],
  194: ["cinema", "Cinema"],
  195: ["cinema", "Cinema"],
  196: ["cinema", "Cinema"],
  197: ["cinema", "Cinema"],
  198: ["cinema", "Cinema"],
  200: ["cinema", "Cinema"],
  201: ["cinema", "Cinema"],
  202: ["cinema", "Cinema"],
  203: ["cinema", "Cinema"],
  204: ["cinema", "Cinema"],
  205: ["cinema", "Cinema"],
  206: ["cinema", "Cinema, with sound"],
  207: ["cinema", "Cinema roar"],
  208: ["cinema", "Cinema roar 2"],
  209: ["grab", "Held, struggle meter"],
  210: ["grab", "Held overhead"],
  211: ["other", "Not used by the code"],
  220: ["attack", "Object swing"],
  221: ["attack", "Object swing"],
  222: ["attack", "Object swing"],
  223: ["attack", "Object swing"],
  224: ["attack", "Object swing"],
  225: ["attack", "Object swing"],
  226: ["attack", "Object swing / stomp"],
  227: ["attack", "Object swing"],
  228: ["attack", "Object swing"],
  229: ["attack", "Object swing"],
  230: ["attack", "Object swing"],
  231: ["attack", "Object swing"],
  239: ["attack", "Stomp with object 2"],
  240: ["attack", "Stomp"],
  241: ["attack", "Stomp, other foot"],
  242: ["attack", "Get-up attack, face down"],
  243: ["attack", "Get-up attack, face up"],
  244: ["attack", "Fire held weapon"],
  245: ["attack", "Bash, object 0x10"],
  246: ["attack", "Bash 2, object 0x10"],
  250: ["hit", "Flail in the air"],
  251: ["hit", "Flail bend: upper body y"],
  252: ["hit", "Flail bend: upper body x"],
  253: ["hit", "Flail bend: upper body z"],
  254: ["hit", "Flail bend: lower body y"],
  255: ["hit", "Flail bend: lower body x"],
  256: ["hit", "Flail bend: lower body z"],
  261: ["attack", "Butt slam: jump"],
  262: ["attack", "Butt slam: drop"],
  263: ["other", "Not used by the code"],
  264: ["move", "Dash start"],
  265: ["move", "Dash"],
  266: ["attack", "Ram: charge"],
  267: ["attack", "Ram: impact"],
  268: ["other", "Not used by the code"],
  269: ["other", "Not used by the code"],
  270: ["other", "Not used by the code"],
  271: ["hit", "Impaled: struggle"],
  272: ["hit", "Impaled: struggle"],
  280: ["grab", "Struggle in the hold"],
  281: ["grab", "Struggle in the hold"],
  282: ["grab", "Struggle in the hold"],
  283: ["grab", "Struggle in the hold"],
  284: ["grab", "Struggle in the hold"],
};

// the table's loop column -> what the list shows
const LOOP = { cycle: "loop", loop: "loop", hold: "hold", layer: "layer", add: "additive", one: "once" };

function readTable(args) {
  const i = args.indexOf("--ref");
  if (i >= 0) {
    const ref = args[i + 1];
    return { md: execFileSync("git", ["-C", DECOMP, "show", `${ref}:docs/ANIM_IDS.md`], { encoding: "utf8" }), from: `WoTM ${ref}:docs/ANIM_IDS.md` };
  }
  const file = path.resolve(args[0] ?? path.join(DECOMP, "docs", "ANIM_IDS.md"));
  return { md: fs.readFileSync(file, "utf8"), from: file };
}

// "all", "all but Zor,Gol", "Con,Rob,UV", "none" -> file prefixes
function who(s) {
  const all = Object.keys(WHO);
  let list;
  if (s === "all") list = all;
  else if (s === "none") list = [];
  else if (s.startsWith("all but ")) {
    const out = s.slice(8).split(",").map((x) => x.trim());
    list = all.filter((x) => !out.includes(x));
  } else list = s.split(",").map((x) => x.trim());
  for (const x of list) if (!WHO[x]) throw new Error(`unknown monster "${x}" in "${s}"`);
  return list.map((x) => WHO[x]);
}

// The table names some moves by looking at Ultra-V ("Ultra-V: right jab (Sq 1st/3rd)", "(Ultra-V pulls the victim in)"):
// every monster gets the description without those parts, Ultra-V included.
function generic(text) {
  const rest = text.replace(/\s*\(Ultra-V[^)]*\)/g, "").replace(/[.;]\s*Ultra-V:?\s[^.;]*/g, "");
  return buttons(rest).replace(/\s+/g, " ").replace(/\s+([.;:,])/g, "$1").trim();
}

// the table writes the buttons as words ("Sq", "circle+triangle", "Back+Tri"): the page shows the symbols
function buttons(s) {
  const map = { Sq: "□", square: "□", Tri: "△", triangle: "△", circle: "○", X: "✕" };
  return s
    .replace(/\b(Sq|Tri|square|triangle|circle|X)\b/g, (m) => map[m])
    .replace(/\bFwd\b/g, "forward")
    .replace(/\bBack\+/g, "back+");
}

function parse(md) {
  const rows = [];
  const table = md.slice(md.indexOf("## Table"));
  for (const line of table.split(/\r?\n/)) {
    const c = line.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length !== 8 || !/^\d+$/.test(c[0])) continue;
    const [id, , what, , loop, uvFrames, has, conf] = c;
    rows.push({ id: Number(id), what, loop, uvFrames, who: who(has), conf });
  }
  return rows;
}

// the ids each costume 0 file has (scene extras.animations)
function fileIds(prefix) {
  const f = path.join(ROOT, "public", "models", `${prefix}0.glb`);
  if (!fs.existsSync(f)) return null;
  const b = fs.readFileSync(f);
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  return new Set((j.scenes[j.scene ?? 0].extras?.animations ?? []).map((a) => a.id));
}

// The combo slots (key 0xFCC of each RST/<PREFIX>.CHR, through the decomp's chr_dump.py): which button, at which hit of
// a combo, plays each attack animation. The type goes by the button (docs/FORMATS.md, "Character"); the position is the
// hit's place in the chain (the button can change along it). The slots past the end of a chain are filled with animation
// 10, no locator, window 20-100%: those are left out. Needs Python and the disc in ../WoTM/disc; without them the
// combos of the last run are kept.
const TYPES = [[5, "□"], [0, "△"], [3, "forward+□"], [1, "forward+△"], [4, "back+□"], [2, "back+△"]];

function readCombos() {
  const tool = path.join(DECOMP, "tools", "chr_dump.py");
  const files = Object.values(WHO).map((p) => path.join(DECOMP, "disc", "RST", `${p}.CHR`));
  if (!fs.existsSync(tool) || !files.every((f) => fs.existsSync(f))) return null;
  let csv;
  try {
    csv = execFileSync("python", [tool, ...files, "--csv"], { encoding: "utf8" });
  } catch {
    return null;
  }
  const slots = {}; // prefix -> id -> type -> [positions]
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [mon, pos, type, anim, loc, ini, fim] = line.split(",");
    if (!mon || mon === "monstro") continue;
    if (loc === "-" && anim === "10" && Number(ini) === 0.2 && Number(fim) === 1) continue; // filler
    const t = ((slots[mon] ??= {})[anim] ??= {});
    (t[type] ??= []).push(Number(pos) + 1);
  }
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  const or = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}` : xs[0]);
  const combos = {};
  for (const [mon, byId] of Object.entries(slots)) {
    combos[mon] = {};
    for (const [id, byType] of Object.entries(byId)) {
      const used = TYPES.filter(([t]) => byType[t]).map(([t, b]) => [b, [...new Set(byType[t])].sort((x, y) => x - y)]);
      combos[mon][id] = {
        short: used.map(([b, p]) => `${b} ${p.join("/")}`).join(" · "),
        long: "Plays for " + used.map(([b, p]) => `${b} as the ${or(p.map(ord))} hit`).join("; ") + " of a combo",
      };
    }
  }
  return combos;
}

const { md, from } = readTable(process.argv.slice(2));
const rows = parse(md);
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const old = prev.ids ?? {};
const warn = [];
const ids = {};

for (const r of rows) {
  const n = NAMES[r.id];
  if (!n) warn.push(`id ${r.id}: no short name in NAMES ("${r.what}")`);
  const [group, name] = n ?? ["other", r.what.split(/[;:(]/)[0].trim()];
  const level = r.conf.split(/[\s(;]/)[0]; // "certain (side: likely)" -> certain; the note goes in the tooltip
  if (!["certain", "likely", "guess"].includes(level)) warn.push(`id ${r.id}: unknown confidence "${r.conf}"`);
  const e = { group, name, text: generic(r.what), loop: LOOP[r.loop] ?? null, conf: level };
  if (r.conf !== level) e.confNote = r.conf;
  if (old[r.id] && old[r.id].text !== e.text) warn.push(`id ${r.id}: description changed, check its short name ("${name}")`);
  ids[r.id] = e;
}
for (const id of Object.keys(NAMES)) if (!ids[id]) warn.push(`id ${id}: in NAMES but no longer in the table`);

// the table's "who has it" against what the museum's costume 0 files have
for (const prefix of Object.values(WHO)) {
  const have = fileIds(prefix);
  if (!have) continue;
  const said = new Set(rows.filter((r) => r.who.includes(prefix)).map((r) => r.id));
  const missing = [...said].filter((x) => !have.has(x));
  const extra = [...have].filter((x) => !said.has(x));
  if (missing.length) warn.push(`${prefix}0.glb: the table says it has ${missing.join(", ")}, the file doesn't`);
  if (extra.length) warn.push(`${prefix}0.glb: the file has ${extra.join(", ")}, not listed for it in the table`);
}

let combos = readCombos();
if (!combos) {
  combos = prev.combos ?? {};
  warn.push("could not run ../WoTM/tools/chr_dump.py on the disc's .CHR files: kept the combos of the last run");
}

const out = {
  source: "WoTM docs/ANIM_IDS.md and RST/*.CHR (generated by scripts/anim-ids.mjs, do not edit)",
  monsters: Object.values(WHO), // the ones the table covers: the bosses keep plain numbers (other numbering, or unchecked)
  groups: GROUPS.map(([key, label]) => ({ key, label })),
  ids,
  combos,
};
fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
const count = (c) => rows.filter((r) => r.conf.startsWith(c)).length;
console.log(`${rows.length} ids from ${from} -> ${path.relative(ROOT, OUT)}`);
console.log(`certain ${count("certain")}, likely ${count("likely")}, guess ${count("guess")}; combos for ${Object.keys(combos).length} monsters`);
for (const w of warn) console.log(`warning: ${w}`);
