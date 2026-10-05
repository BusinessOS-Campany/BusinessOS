# Download "Need some space?" by Loïc Norgeot from Sketchfab
# Model UID: d6521362b37b48e3a82bce4911409303
#
# Requires a Sketchfab API token:
#   1. Sign in at https://sketchfab.com
#   2. Go to https://sketchfab.com/settings/password  →  API → Create a token
#   3. Run:  .\scripts\download-sketchfab-model.ps1
#      Or pass the token inline:  .\scripts\download-sketchfab-model.ps1 -Token "xxxx"

param(
    [string]$Token = $env:SKETCHFAB_TOKEN,
    [string]$ModelUid = "d6521362b37b48e3a82bce4911409303",
    [string]$OutDir = (Join-Path $PSScriptRoot "..\public\models")
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Error "No API token. Set -Token or the SKETCHFAB_TOKEN env var."
    exit 1
}

# 1) Ask Sketchfab for the signed download URLs
$download = Invoke-RestMethod `
    -Uri "https://api.sketchfab.com/v3/models/$ModelUid/download" `
    -Headers @{ Authorization = "Token $Token" } `
    -Method Get

if (-not $download.gltf -or -not $download.gltf.url) {
    Write-Error "No glTF download link returned. Response: $($download | ConvertTo-Json -Compress)"
    exit 1
}

$url = $download.gltf.url
$sizeMB = [math]::Round($download.gltf.size / 1MB, 1)
Write-Host "Downloading glTF ($sizeMB MB) from: $url" -ForegroundColor Cyan

# 2) Download the zip
$zip = Join-Path $env:TEMP "sketchfab-${ModelUid}.zip"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

# 3) Extract into a per-model folder
$modelDir = Join-Path $OutDir "need-some-space"
if (Test-Path -LiteralPath $modelDir) {
    Remove-Item -LiteralPath $modelDir -Recurse -Force
}
Expand-Archive -LiteralPath $zip -DestinationPath $modelDir -Force

Write-Host "Saved to: $modelDir" -ForegroundColor Green
Get-ChildItem -LiteralPath $modelDir -Recurse | Select-Object FullName, Length