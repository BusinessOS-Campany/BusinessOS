# PC-MIGRATION BACKUP - run on the OLD PC from the repo root.
# Collects: code state check, PostgreSQL dumps, env files, storage, pm2 map.
# Output: ..\ERP-migration-bundle\  (copy this folder to the new PC via USB/drive)
# NOTE: secrets (.env files) are copied PLAIN - keep the USB safe, delete after restore.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Bundle = Join-Path (Split-Path -Parent $RepoRoot) "ERP-migration-bundle"
$DbDir = Join-Path $Bundle "db"
$EnvDir = Join-Path $Bundle "env"
$PgBin = "C:\Program Files\PostgreSQL\16\bin"
$env:PGPASSWORD = "123"

Write-Host "== 1/5 git state =="
Set-Location $RepoRoot
$dirty = git status --short
if ($dirty) {
  Write-Host "!! Uncommitted changes (commit + push BEFORE moving):" -ForegroundColor Yellow
  $dirty | Select-Object -First 30 | ForEach-Object { Write-Host "   $_" }
} else {
  Write-Host "   working tree clean"
}
$branch = git branch --show-current
$remote = git remote get-url origin
Write-Host "   branch=$branch remote=$remote"
"branch=$branch`nremote=$remote`n" | Out-File (Join-Path $Bundle "git-info.txt") -Encoding utf8

Write-Host "== 2/5 database dumps =="
New-Item -ItemType Directory -Force -Path $DbDir | Out-Null
foreach ($db in @("businessos", "demo", "gmstore")) {
  Write-Host "   dumping $db ..."
  & "$PgBin\pg_dump.exe" -h localhost -p 5432 -U postgres -F c -f (Join-Path $DbDir "$db.dump") $db
}
Write-Host "   roles (postgres superuser expected on new PC with same password)"

Write-Host "== 3/5 env files =="
$envFiles = @(
  ".env.local",
  "demo-systems\grocery\.env", "demo-systems\grocery\.env.local",
  "demo-systems\dental\.env", "demo-systems\dental\.env.local",
  "public\Hospital--main\.env", "public\Hospital--main\.env.local",
  "public\pharmacy\.env", "public\pharmacy\.env.local",
  "public\POS System\.env", "public\POS System\.env.local",
  "public\celia-main\.env", "public\celia-main\.env.local",
  "public\laboratory--main\.env", "public\laboratory--main\.env.local",
  "public\Optometry  Eye Clinic System\.env",
  "public\GMstore\.env",
  "public\samaSYSTEM-main\backend\.env", "public\samaSYSTEM-main\frontend\.env"
)
foreach ($f in $envFiles) {
  $src = Join-Path $RepoRoot $f
  if (Test-Path -LiteralPath $src) {
    $dst = Join-Path $EnvDir $f
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    Copy-Item -LiteralPath $src -Destination $dst -Force
    Write-Host "   copied $f"
  } else {
    Write-Host "   MISSING (skipped): $f" -ForegroundColor DarkYellow
  }
}

Write-Host "== 4/5 storage =="
$storage = Join-Path $RepoRoot ".data\storage"
if (Test-Path -LiteralPath $storage) {
  robocopy $storage (Join-Path $Bundle "storage") /E /NFL /NDL /NJH /NJS | Out-Null
  Write-Host "   storage copied"
}

Write-Host "== 5/5 pm2 map =="
cmd /c "pm2 jlist" > (Join-Path $Bundle "pm2-jlist.json")

Write-Host ""
Write-Host "DONE. Bundle at: $Bundle" -ForegroundColor Green
Write-Host "Next: 1) git commit+push everything, 2) copy bundle to new PC, 3) run scripts\pc-restore.ps1 there."
