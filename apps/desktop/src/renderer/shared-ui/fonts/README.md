# Baloo 2 font

Baloo 2 is licensed under the SIL Open Font License (OFL) 1.1.
The upstream license is checked in here as `LICENSE-Baloo2.txt`.

Files in this directory:

- `Baloo2-Regular.woff2` — weight 400, latin subset
- `Baloo2-SemiBold.woff2` — weight 600, latin subset
- `Baloo2-ExtraBold.woff2` — weight 800, latin subset
- `LICENSE-Baloo2.txt` — SIL OFL 1.1, upstream

These were pulled from Google Fonts' static woff2 endpoint
(latin subset only — roughly ~20 KB each). If you need extended
glyph coverage (devanagari, vietnamese, latin-ext), download those
additional subsets from https://fonts.google.com/specimen/Baloo+2
and add corresponding `@font-face` blocks in `../theme.css`.

The `@font-face` declarations in
`apps/desktop/src/renderer/shared-ui/theme.css` reference these
filenames. If you change them, update the CSS.

This directory is checked in by design — we self-host the font so
Swoosh works offline and so we never call out to Google Fonts at
runtime (per the constitution's privacy principle).
