#!/usr/bin/env python3
"""Exports the detail levels (LOD) of the monsters for the LOD selector (see VIEWER_WEB.md).

  python scripts/export-lods.py                  # every costume that has a public/models/<COSTUME>.glb
  python scripts/export-lods.py MONKEY0 ROBOT    # only those (a name or a prefix)
  options: --wotm ../WoTM (the decomp repo with tools/ and disc/)   --jobs 3   --tmp DIR   --force

For each costume with N levels it makes N-1 files, public/models/lod/<COSTUME>_L<level>.glb (level 0 is the coarsest; the most
detailed level is the costume's own .glb, so it is not exported again), and writes public/models/lod/index.json:
  { "MONKEY0": { "levels": ["lod/MONKEY0_L0", "lod/MONKEY0_L1", "lod/MONKEY0_L2", "MONKEY0"] } }

Animations: the levels share the skeleton. For a costume with no rigid parts (everything skinned to the bones) whose level
animates the same nodes as the most detailed one, only the mesh is exported and the list points at the costume's own
animation files. Otherwise every animation is exported for the level; a file identical to the costume's own is not stored again, the others go to
public/models/lod/<COSTUME>_L<level>/ (identical files are shared between costumes).

The site loads public/models/lod/index.json on start; a costume without an entry has no LOD chips.
Needs the user's own disc in WoTM/disc (nothing from the game is committed).
"""
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = os.path.join(ROOT, "public", "models")
OUT = os.path.join(MODELS, "lod")


def read_glb(path):
    d = open(path, "rb").read()
    n = struct.unpack_from("<I", d, 12)[0]
    return json.loads(d[20:20 + n]), d[20 + n:]


def write_glb(path, j, rest):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(rest))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + rest
    with open(path, "wb") as f:
        f.write(out)


def sha1(path):
    return hashlib.sha1(open(path, "rb").read()).hexdigest()


def prefix_of(stem):
    return stem.rstrip("0123456789")


def parse(argv):
    opt = {"wotm": os.path.join(os.path.dirname(ROOT), "WoTM"), "jobs": 3, "tmp": os.path.join(tempfile.gettempdir(), "wotm-lod"),
           "force": False, "names": []}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--force":
            opt["force"] = True
        elif a in ("--wotm", "--jobs", "--tmp"):
            i += 1
            opt[a[2:]] = int(argv[i]) if a == "--jobs" else argv[i]
        elif a.startswith("-"):
            sys.exit(__doc__)
        else:
            opt["names"].append(a.upper())
        i += 1
    return opt


def main(argv):
    opt = parse(argv)
    wotm = os.path.abspath(opt["wotm"])
    sys.path.insert(0, os.path.join(wotm, "tools"))
    import pose  # noqa: E402  (from the decomp repo)

    mon = os.path.join(wotm, "disc", "MON")
    stems = sorted(f[:-4] for f in os.listdir(mon) if f.upper().endswith(".NGP"))
    stems = [s for s in stems if os.path.exists(os.path.join(MODELS, s + ".glb"))]
    if opt["names"]:
        stems = [s for s in stems if s in opt["names"] or prefix_of(s) in opt["names"]]

    # ---- what each costume needs: the levels below the most detailed one, and whether they animate the same nodes
    jobs, plan = [], {}
    for s in stems:
        path = os.path.join(mon, s + ".NGP")
        n = pose.Model(path).lod_levels()
        if n < 2:
            continue
        top = set(pose.Model(path).pose(rest=True).xforms)
        # the animation files only match between levels when there are no rigid parts (all skinned to the bones): with rigid
        # parts they differ even when the animated nodes are the same (checked on Robo-47 level 0: 0 of 161 identical)
        skinned_only = read_glb(os.path.join(MODELS, s + ".glb"))[0]["scenes"][0]["extras"].get("parts", 1) == 0
        plan[s] = []
        for lv in range(n - 1):
            same = skinned_only and set(pose.Model(path, lod=lv).pose(rest=True).xforms) == top
            plan[s].append((lv, same))
            jobs.append((s, lv, same))
        print("%s: %d levels, %s" % (s, n, ", ".join("L%d %s" % (lv, "mesh only" if same else "all animations") for lv, same in plan[s])), flush=True)

    # ---- export (monglb.py), a few at a time; a finished one is kept in --tmp and skipped next time
    def run(job):
        s, lv, same = job
        d = os.path.join(opt["tmp"], "%s_L%d" % (s, lv))
        done = os.path.join(d, ".done")
        if os.path.exists(done) and not opt["force"]:
            return job, True, ""
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
        cmd = [sys.executable, os.path.join(wotm, "tools", "monglb.py"), os.path.join(mon, s + ".NGP"), os.path.join(d, s + ".glb"),
               "--lod", str(lv)]
        if not same:
            cmd += ["--all", "--split", "--anim-dir", prefix_of(s)]
        r = subprocess.run(cmd, cwd=wotm, capture_output=True, text=True)
        if r.returncode:
            return job, False, (r.stderr or r.stdout)[-600:]
        open(done, "w").close()
        return job, True, ""

    failed = []
    with ThreadPoolExecutor(max_workers=max(1, int(opt["jobs"]))) as pool:
        for n, (job, ok, err) in enumerate(pool.map(run, jobs), 1):
            print("[%d/%d] %s L%d %s" % (n, len(jobs), job[0], job[1], "ok" if ok else "FAILED\n" + err), flush=True)
            if not ok:
                failed.append(job)

    # ---- put the files in public/models/lod and write the index
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(OUT, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    placed = {}   # sha1 -> path under models/ of an animation file stored in lod/ (shared between the costumes of a prefix)
    for s in sorted(plan):
        if any(j[0] == s for j in failed):
            continue
        base_j, _ = read_glb(os.path.join(MODELS, s + ".glb"))
        base_list = base_j["scenes"][0]["extras"]["animations"]
        base_file = {a["k"]: a["file"] for a in base_list}
        for d in os.listdir(OUT):
            if d.startswith(s + "_L") and os.path.isdir(os.path.join(OUT, d)):
                shutil.rmtree(os.path.join(OUT, d))
        levels = []
        for lv, same in plan[s]:
            tmp = os.path.join(opt["tmp"], "%s_L%d" % (s, lv))
            j, rest = read_glb(os.path.join(tmp, s + ".glb"))
            extras = j["scenes"][0]["extras"]
            if same:
                extras["animations"] = [dict(a) for a in base_list]
            else:
                kept = new = 0
                for a in extras["animations"]:
                    src = os.path.join(tmp, prefix_of(s), os.path.basename(a["file"]))
                    h = sha1(src)
                    own = base_file.get(a["k"])
                    if own and os.path.exists(os.path.join(MODELS, own)) and sha1(os.path.join(MODELS, own)) == h:
                        a["file"] = own
                        kept += 1
                    else:
                        if h not in placed:
                            folder = "lod/%s_L%d" % (s, lv)
                            os.makedirs(os.path.join(MODELS, folder), exist_ok=True)
                            shutil.copyfile(src, os.path.join(MODELS, folder, os.path.basename(a["file"])))
                            placed[h] = folder + "/" + os.path.basename(a["file"])
                            new += 1
                        a["file"] = placed[h]
                print("%s L%d: %d animations shared with the costume, %d new files" % (s, lv, kept, new))
            write_glb(os.path.join(OUT, "%s_L%d.glb" % (s, lv)), j, rest)
            levels.append("lod/%s_L%d" % (s, lv))
        index[s] = {"levels": levels + [s]}
    with open(index_path, "w") as f:
        json.dump(index, f, indent=1, sort_keys=True)
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _d, fs in os.walk(OUT) for f in fs)
    print("%d costumes in lod/index.json, %.1f MB in public/models/lod" % (len(index), size / 1e6))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
