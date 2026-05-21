# Fix-Electron-Install
#
# Worked around a recurring pnpm + Electron postinstall issue on Windows
# where `pnpm install` runs without error but `node_modules/electron/dist`
# stays empty (no electron.exe). `pnpm dev` then fails with:
#
#   Error: Electron uninstall
#       at getElectronPath (.../electron-vite/dist/chunks/lib-*.mjs)
#
# This script manually extracts the cached Electron zip into
# node_modules and writes the marker files the Electron loader expects.
#
# Run from anywhere; uses the apps/desktop relative to the script.

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$electronPkg = Join-Path $repoRoot 'apps/desktop/node_modules/electron'
if (-not (Test-Path $electronPkg)) {
  throw "electron package not found at $electronPkg — run \`pnpm install\` first."
}

$version = (Get-Content (Join-Path $electronPkg 'package.json') | ConvertFrom-Json).version
$cachedZip = "$env:LOCALAPPDATA\electron\Cache\electron-v$version-win32-x64.zip"

if (-not (Test-Path $cachedZip)) {
  throw "No cached Electron zip at $cachedZip. Re-run \`pnpm install\` once to populate the cache."
}

$dist = Join-Path $electronPkg 'dist'
Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Write-Host "Extracting Electron v$version..."
Expand-Archive -Path $cachedZip -DestinationPath $dist -Force

Set-Content -Path (Join-Path $dist 'version') -Value $version -NoNewline -Encoding ascii
Set-Content -Path (Join-Path $electronPkg 'path.txt') -Value 'electron.exe' -NoNewline -Encoding ascii

$exe = Join-Path $dist 'electron.exe'
if (Test-Path $exe) {
  Write-Host "Electron $version ready at $exe"
} else {
  throw "Extraction succeeded but $exe is missing."
}
