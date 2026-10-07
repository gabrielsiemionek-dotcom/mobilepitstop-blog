#!/usr/bin/env python3
"""Add Gab's new job photos to the private photo library.

    python3 scripts/add-photos.py <path to mobilepitstop-blog-library>

Takes every photo in <library>/new-photos/ (JPG, PNG, HEIC, WebP):
  - turns it the right way up, resizes it to 1600 px and saves it as photos/P###.webp
    (re-encoding drops all EXIF data, including the GPS location of customers' homes)
  - skips near-duplicates of photos already in the library
  - adds an entry to photos.json flagged "needs-review", with no description yet
  - deletes the original from new-photos/

Prints a JSON summary. Claude then looks at each new photo and fills in its description,
tags and privacy flags, removing "needs-review".
Needs Pillow; HEIC files also need pillow-heif (pip install pillow pillow-heif).
"""

import json
import os
import re
import sys
from datetime import date

from PIL import Image, ImageOps

try:
    import pillow_heif  # noqa: F401

    pillow_heif.register_heif_opener()
    HEIC = True
except ImportError:
    HEIC = False

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
VIDEO = {".mov", ".mp4", ".m4v", ".avi"}


def ahash(img, size=8):
    """Average hash: a tiny fingerprint that survives resizing and re-encoding."""
    g = img.convert("L").resize((size, size), Image.LANCZOS)
    px = list(g.tobytes())
    avg = sum(px) / len(px)
    return "".join("1" if p >= avg else "0" for p in px)


def distance(a, b):
    return sum(x != y for x, y in zip(a, b))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    lib = os.path.abspath(sys.argv[1])
    inbox = os.path.join(lib, "new-photos")
    photos_dir = os.path.join(lib, "photos")
    cat_path = os.path.join(lib, "photos.json")
    os.makedirs(inbox, exist_ok=True)
    os.makedirs(photos_dir, exist_ok=True)

    with open(cat_path, encoding="utf-8") as f:
        catalogue = json.load(f)
    entries = catalogue["photos"]

    # Fingerprints of what's already in the library.
    known = {}
    for e in entries:
        if e.get("ahash"):
            known[e["id"]] = e["ahash"]
            continue
        p = os.path.join(lib, e["file"])
        if os.path.exists(p):
            with Image.open(p) as im:
                known[e["id"]] = e["ahash"] = ahash(im)

    nums = [int(m.group(1)) for e in entries if (m := re.match(r"P(\d+)$", e["id"]))]
    next_num = max(nums, default=0) + 1

    added, duplicates, skipped = [], [], []
    for name in sorted(os.listdir(inbox)):
        src = os.path.join(inbox, name)
        ext = os.path.splitext(name)[1].lower()
        if not os.path.isfile(src) or name.lower() in ("readme.md", ".gitkeep") or name.startswith("."):
            continue
        if ext in VIDEO:
            skipped.append({"file": name, "reason": "video (not used for the blog)"})
            continue
        if ext not in EXTS:
            skipped.append({"file": name, "reason": "not a photo"})
            continue
        if ext in (".heic", ".heif") and not HEIC:
            skipped.append({"file": name, "reason": "HEIC needs pillow-heif: pip install pillow-heif"})
            continue
        try:
            with Image.open(src) as raw:
                img = ImageOps.exif_transpose(raw).convert("RGB")
        except Exception as err:  # unreadable file
            skipped.append({"file": name, "reason": f"couldn't open ({err})"})
            continue

        fp = ahash(img)
        match = next((pid for pid, h in known.items() if distance(fp, h) <= 3), None)
        if match:
            duplicates.append({"file": name, "same_as": match})
            os.remove(src)
            continue

        img.thumbnail((1600, 1600), Image.LANCZOS)
        pid = f"P{next_num:03d}"
        next_num += 1
        out = os.path.join(photos_dir, f"{pid}.webp")
        img.save(out, "WEBP", quality=80, method=6)  # no EXIF written, so no GPS
        entry = {
            "id": pid,
            "file": f"photos/{pid}.webp",
            "width": img.width,
            "height": img.height,
            "orientation": "portrait" if img.height > img.width else "landscape",
            "description": "",
            "tags": [],
            "flags": ["needs-review"],
            "source": f"new-photos/{name} (added {date.today().isoformat()})",
            "used_in": [],
            "ahash": fp,
        }
        entries.append(entry)
        known[pid] = fp
        added.append({"id": pid, "file": entry["file"], "from": name, "size_kb": round(os.path.getsize(out) / 1024)})
        os.remove(src)

    with open(cat_path, "w", encoding="utf-8") as f:
        json.dump(catalogue, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(json.dumps({"added": added, "duplicates_removed": duplicates, "skipped": skipped}, indent=1))


if __name__ == "__main__":
    main()
