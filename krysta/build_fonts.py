#!/usr/bin/env python3
"""Krysta 动效节点: turn krysta/fonts/fonts.txt into the Chinese font list of the web build.

fonts.txt, one font per line (order matters: the first face that covers a character draws it, so the
first line is the default Chinese face):

    NotoSansSC-Regular.otf | NotoSansSC-OFL.txt
    # comments and blank lines are ignored

For every line this checks the font file and its licence are in krysta/fonts, the font really is a
TrueType / OpenType file, and no two fonts have the same family + style (the editor's font menu groups
faces by the family name it reads: typographic family/subfamily, name IDs 16/17, else 1/2). It then

- copies the fonts and licences into assets/fonts,
- writes crates/text/src/krysta_web_fonts.rs (WEB_CJK_FACES in fonts.txt order + WEB_CJK_FALLBACK),
- writes the list of font paths for the "is the font in the wasm" check, a release body, and a table
  of family / style / size / GB2312 coverage to the job summary.

Any problem stops the build with a message saying which line is wrong. Nothing is published then.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import sys

from fontTools.ttLib import TTFont

FONT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:ttf|otf)$")
LICENCE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.txt$")
MAGIC = (b"\x00\x01\x00\x00", b"OTTO", b"true")


def fail(message: str) -> None:
    print(f"::error::{message}")
    sys.exit(1)


def gb2312() -> set:
    chars = set()
    for b1 in range(0xB0, 0xF8):
        for b2 in range(0xA1, 0xFF):
            try:
                chars.add(ord(bytes([b1, b2]).decode("gb2312")))
            except UnicodeDecodeError:
                pass
    return chars


def names(font: TTFont) -> tuple:
    table = font["name"]
    family = table.getDebugName(16) or table.getDebugName(1) or ""
    style = table.getDebugName(17) or table.getDebugName(2) or ""
    return family.strip(), style.strip()


def read_list(path: str) -> list:
    rows, seen = [], set()
    with open(path, encoding="utf-8") as handle:
        for number, raw in enumerate(handle, 1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            parts = [part.strip() for part in line.split("|")]
            if len(parts) != 2:
                fail(f"fonts.txt line {number}: write it as <font file> | <licence file>")
            font, licence = parts
            if not FONT_RE.match(font):
                fail(f"fonts.txt line {number}: {font!r} is not a .ttf / .otf file name (letters, digits, . _ - only)")
            if not LICENCE_RE.match(licence):
                fail(f"fonts.txt line {number}: {licence!r} is not a .txt licence file name")
            if font in seen:
                fail(f"fonts.txt line {number}: {font} is listed twice")
            seen.add(font)
            rows.append((number, font, licence))
    if not rows:
        fail("fonts.txt lists no font")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fonts", required=True, help="krysta/fonts of the fork")
    parser.add_argument("--assets", required=True, help="assets/fonts of the official source")
    parser.add_argument("--out", required=True, help="crates/text/src/krysta_web_fonts.rs")
    parser.add_argument("--list", required=True, help="where to write the font paths, one per line")
    parser.add_argument("--licences", required=True, help="where to write the licence file names, one per line")
    parser.add_argument("--body", required=True, help="where to write the release body (markdown)")
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()

    rows = read_list(os.path.join(args.fonts, "fonts.txt"))
    common = gb2312()
    seen_faces = {}
    summary = []
    for number, font, licence in rows:
        path = os.path.join(args.fonts, font)
        if not os.path.isfile(path):
            fail(f"fonts.txt line {number}: krysta/fonts/{font} is not in the repository")
        if not os.path.isfile(os.path.join(args.fonts, licence)):
            fail(f"fonts.txt line {number}: the licence krysta/fonts/{licence} of {font} is not in the repository")
        with open(path, "rb") as handle:
            if handle.read(4) not in MAGIC:
                fail(f"fonts.txt line {number}: {font} is not a TrueType / OpenType font (font collections .ttc are not supported)")
        try:
            face = TTFont(path, lazy=True)
            family, style = names(face)
            cmap = face.getBestCmap() or {}
        except Exception as exc:  # broken file
            fail(f"fonts.txt line {number}: {font} cannot be read ({type(exc).__name__}: {exc})")
        if not family:
            fail(f"fonts.txt line {number}: {font} has no family name")
        key = (family.casefold(), style.casefold())
        if key in seen_faces:
            fail(f"fonts.txt line {number}: {font} is {family} {style}, the same family and style as {seen_faces[key]} "
                 "(the font menu would show only one of them)")
        seen_faces[key] = font
        covered = sum(1 for code in common if code in cmap)
        if covered == 0:
            print(f"::warning::{font} ({family} {style}) has no Chinese characters")
        size = os.path.getsize(path)
        digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
        summary.append((font, family, style, size, covered, licence, digest))

    os.makedirs(args.assets, exist_ok=True)
    licences = sorted({licence for _, _, licence in rows})
    for _, font, _ in rows:
        shutil.copyfile(os.path.join(args.fonts, font), os.path.join(args.assets, font))
    for licence in licences:
        shutil.copyfile(os.path.join(args.fonts, licence), os.path.join(args.assets, licence))

    lines = [
        "// Written by krysta/build_fonts.py from krysta/fonts/fonts.txt. Do not edit.",
        '#[cfg(target_arch = "wasm32")]',
        "pub static WEB_CJK_FACES: &[&[u8]] = &[",
    ]
    lines += [f'    include_bytes!("../../../assets/fonts/{font}"),' for _, font, _ in rows]
    lines += [
        "    WEB_CJK_FALLBACK,",
        "];",
        '#[cfg(target_arch = "wasm32")]',
        'pub static WEB_CJK_FALLBACK: &[u8] = include_bytes!("../../../assets/fonts/DroidSansFallback.ttf");',
        "",
    ]
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))
    with open(args.list, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("".join(os.path.join(args.assets, font) + "\n" for _, font, _ in rows))
    with open(args.licences, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("".join(licence + "\n" for licence in licences))

    total = sum(row[3] for row in summary)
    table = ["| # | 文件 | 字体族 | 样式 | 大小 | GB2312 常用字 | 许可证 |", "|---|---|---|---|---|---|---|"]
    for index, (font, family, style, size, covered, licence, _digest) in enumerate(summary, 1):
        table.append(f"| {index} | `{font}` | {family} | {style} | {size / 1e6:.1f} MB | {covered}/{len(common)} | `{licence}` |")
    report = "\n".join(table) + f"\n\n共 {len(summary)} 款，{total / 1e6:.1f} MB。第 1 款是中文默认字体；最后由 Droid Sans Fallback 补缺。\n"
    step = os.getenv("GITHUB_STEP_SUMMARY")
    if step:
        with open(step, "a", encoding="utf-8") as handle:
            handle.write("### 中文字体\n\n" + report)
    print(report)
    sums = "\n".join(f"- `{font}` sha256 `{digest}`" for font, *_rest, digest in summary)
    body = (f"EffectCraft `{args.tag}` web build with bundled Chinese fonts, for Krysta's 动效节点.\n\n"
            f"Built from the official tag `{args.tag}` with `krysta/patch/cjk-font.patch` and the fonts listed in "
            "`krysta/fonts/fonts.txt`, plus Droid Sans Fallback (Apache-2.0). Licences are in `fonts-licenses/` "
            "inside the zip.\n\n" + report + "\n" + sums + "\n")
    with open(args.body, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(body)


if __name__ == "__main__":
    main()
