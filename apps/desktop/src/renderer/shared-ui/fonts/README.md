# Baloo 2 font

Baloo 2 is licensed under the SIL Open Font License (OFL) 1.1.

Drop the variable woff2 here as `Baloo2-Variable.woff2` (or download
fresh from https://fonts.google.com/specimen/Baloo+2). Also include
the upstream `OFL.txt` as `LICENSE-Baloo2.txt` alongside the font.

The `@font-face` declaration in
`apps/desktop/src/renderer/shared-ui/theme.css` references this
filename. If you change the filename, update the CSS.

This directory is checked in by design — we self-host the font so
Swoosh works offline and so we never call out to Google Fonts at
runtime (per the constitution's privacy principle).
