# krysta/fonts

Chinese fonts bundled into Krysta's EffectCraft web builds (x.y.z-zhN) by
`krysta/patch/cjk-font.patch` and `.github/workflows/krysta-zh-web.yml`. All are
under the SIL Open Font License 1.1 (the `*-OFL.txt` next to each), unmodified
except where noted. `SHA256SUMS.txt` lists the exact bytes the workflow checks.

| File | Family in the font menu | Style | Source |
|---|---|---|---|
| NotoSansSC-Regular.otf | Noto Sans SC | Regular | Noto Sans SC 2.004 (Google, Adobe) |
| NotoSansSC-Medium.otf | Noto Sans SC | Medium | Noto Sans SC 2.004 |
| NotoSansSC-Bold.otf | Noto Sans SC | Bold | Noto Sans CJK SC Bold 2.004; **name table only**: typographic family (ID 16) set to "Noto Sans SC" and subfamily (ID 17) to "Bold", so it groups with the other weights. Outlines and every other table unchanged. Noto has no Reserved Font Name. |
| NotoSansSC-Black.otf | Noto Sans SC | Black | Noto Sans SC 2.004 |
| NotoSerifSC-Regular.otf | Noto Serif SC | Regular | Noto Serif SC |
| NotoSerifSC-Bold.otf | Noto Serif SC | Bold | Noto Serif SC |
| LXGWWenKai-Regular.ttf | LXGW WenKai | Regular | LXGW WenKai (lxgw/LxgwWenKai); Reserved Font Names 霞鹜 / LXGW, used unmodified |
| LXGWWenKai-Medium.ttf | LXGW WenKai | Medium | LXGW WenKai |
| MaShanZheng-Regular.ttf | Ma Shan Zheng | Regular | googlefonts/mashanzheng |
| SmileySans-Oblique.ttf | Smiley Sans | Oblique | atelierAnchor; Reserved Font Names Smiley / 得意黑, used unmodified |
| ZCOOLKuaiLe-Regular.ttf | ZCOOL KuaiLe | Regular | googlefonts/zcool-kuaile |

The first one registered (Noto Sans SC Regular) is the default face for Chinese
characters when the chosen font has none. Droid Sans Fallback (from the patch's
original version) stays registered last, for kana / Hangul and anything else
the Chinese fonts lack.
