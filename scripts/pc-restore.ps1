# PC-MIGRATION RESTORE - run on the NEW PC.
# Prereqs (install first): Node.js >= 22, PostgreSQL 16 (postgres password MUST be 123
# to match the bundled env files - or update them), pm2 (npm i -g pm2), Git.
#
# Usage:
#   1. git clone <your-repo-url>  (then cd into it)
#   2. Copy ERP-migration-bundle next to the repo folder (..\ERP-migration-bundle)
#   3. powershell -ExecutionPolicy Bypass -File scripts\pc-restore.ps1
#
# NOTE: D:\GMstore (port 3000 app) lives OUTSIDE this repo - move it separately.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Bundle = Join-Path (Split-Path -Parent $RepoRoot) "ERP-migration-bundle"
$PgBin = "C:\Program Files\PostgreSQL\16\bin"
$env:PGPASSWORD = "123"

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "MISSING: $cmd - $hint" -ForegroundColor Red; exit 1
  }
}

Write-Host "== 0/7 prereqs =="
Need node "install Node.js LTS >= 22"
Need psql "install PostgreSQL 16"
Need pm2 "run: npm i -g pm2"
node --version
if (-not (Test-Path -LiteralPath $Bundle)) { Write-Host "Bundle not found: $Bundle" -ForegroundColor Red; exit 1 }
Set-Location $RepoRoot

Write-Host "== 1/7 env files =="
Get-ChildItem -LiteralPath (Join-Path $Bundle "env") -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring((Join-Path $Bundle "env").Length + 1)
  $dst = Join-Path $RepoRoot $rel
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
  Write-Host "   restored $rel"
}
$storage = Join-Path $Bundle "storage"
if (Test-Path -LiteralPath $storage) {
  robocopy $storage (Join-Path $RepoRoot ".data\storage") /E /NFL /NDL /NJH /NJS | Out-Null
  Write-Host "   storage restored"
}

Write-Host "== 2/7 npm install (root + sub-apps) =="
$apps = @(
  ".",
  "demo-systems\grocery",
  "demo-systems\dental",
  "public\samaSYSTEM-main\backend",
  "public\samaSYSTEM-main\frontend",
  "public\celia-main",
  "public\laboratory--main",
  "public\pharmacy",
  "public\POS System",
  "public\Optometry  Eye Clinic System",
  "public\Hospital--main"
)
foreach ($a in $apps) {
  $dir = Join-Path $RepoRoot $a
  if (Test-Path -LiteralPath (Join-Path $dir "package.json")) {
    Write-Host "   npm install: $a ..."
    Push-Location -LiteralPath $dir
    cmd /c "npm install --no-audit --no-fund" 2>&1 | Select-Object -Last 2 | Out-Null
    Pop-Location
  }
}

Write-Host "== 3/7 databases =="
foreach ($db in @("businessos", "demo", "gmstore")) {
  $exists = & "$PgBin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='$db';" | Out-String
  if ($exists -notmatch "1") {
    Write-Host "   creating database $db ..."
    & "$PgBin\createdb.exe" -h localhost -p 5432 -U postgres $db | Out-Null
  }
  Write-Host "   restoring $db ..."
  & "$PgBin\pg_restore.exe" -h localhost -p 5432 -U postgres -d $db --clean --if-exists (Join-Path $Bundle "db\$db.dump") 2>&1 | Select-String -Pattern "error" | Select-Object -First 3
}
Write-Host "   prisma generate (root) ..."
Push-Location -LiteralPath $RepoRoot
cmd /c "npx prisma generate" 2>&1 | Select-Object -Last 1 | Out-Null
Pop-Location
Write-Host "   prisma migrate deploy (grocery) ..."
Push-Location -LiteralPath (Join-Path $RepoRoot "demo-systems\grocery")
cmd /c "npx prisma migrate deploy" 2>&1 | Select-Object -Last 1 | Out-Null
cmd /c "npm run db:seed" 2>&1 | Select-Object -Last 1 | Out-Null
Pop-Location

Write-Host "== 4/7 builds =="
Write-Host "   root (next build --webpack, slow) ..."
Push-Location -LiteralPath $RepoRoot
cmd /c "npm run build" 2>&1 | Select-Object -Last 2 | Out-Null
Pop-Location
$stdApps = @(
  "demo-systems\grocery",
  "demo-systems\dental", "public\laboratory--main", "public\pharmacy",
  "public\POS System", "public\Optometry  Eye Clinic System", "public\Hospital--main",
  "public\celia-main", "public\samaSYSTEM-main\frontend"
)
foreach ($a in $stdApps) {
  Write-Host "   build: $a ..."
  Push-Location -LiteralPath (Join-Path $RepoRoot $a)
  cmd /c "npm run build" 2>&1 | Select-Object -Last 1 | Out-Null
  Pop-Location
}

Write-Host "== 5/7 pm2 start =="
# Delete only this project's processes. `pm2 delete all` would also kill
# unrelated apps on the machine (e.g. gmstore in D:\GMstore), which is not this
# script's to stop.
cmd /c "pm2 delete businessos-erp grocery-demo grocery sama-api sama-web celia dental laboratory pharmacy pos optometry hospital" 2>&1 | Out-Null
Push-Location -LiteralPath $RepoRoot
# Start from the ecosystem file so cwd is always correct. `pm2 restart` does not
# re-read cwd, so a repo that has moved would keep serving from its old path.
cmd /c "pm2 start ecosystem.config.cjs" 2>&1 | Out-Null
Pop-Location
# Optional demo systems, started only when their source is actually present.
$starts = @(
  @{ d = "public\samaSYSTEM-main\backend"; a = "run start"; n = "sama-api" },
  @{ d = "public\samaSYSTEM-main\frontend"; a = "run preview -- --port 3102"; n = "sama-web" },
  @{ d = "public\celia-main"; a = "run start -- --port 3104"; n = "celia" },
  @{ d = "demo-systems\dental"; a = "run start -- --port 3106"; n = "dental" },
  @{ d = "public\laboratory--main"; a = "run start -- --port 3107"; n = "laboratory" },
  @{ d = "public\pharmacy"; a = "run start"; n = "pharmacy" },
  @{ d = "public\POS System"; a = "run start -- --port 3108"; n = "pos" },
  @{ d = "public\Optometry  Eye Clinic System"; a = "run start -- --port 3109"; n = "optometry" },
  @{ d = "public\Hospital--main"; a = "run start -- --port 3105"; n = "hospital" }
)
foreach ($s in $starts) {
  $dir = Join-Path $RepoRoot $s.d
  if (-not (Test-Path -LiteralPath (Join-Path $dir "package.json"))) {
    Write-Host "   skip $($s.n): $($s.d) not present"
    continue
  }
  Write-Host "   pm2: $($s.n) ..."
  Push-Location -LiteralPath $dir
  cmd /c "pm2 start npm --name $($s.n) -- $($s.a)" 2>&1 | Out-Null
  Pop-Location
}
cmd /c "pm2 save" 2>&1 | Out-Null

Write-Host "== 6/7 verify =="
Start-Sleep -Seconds 20
$checks = @{
  "erp" = "http://localhost:3100/signin"; "grocery" = "http://localhost:3100/grocery";
  "hospital" = "http://localhost:3100/hospital"; "dental" = "http://localhost:3100/demo/dental";
  "pharmacy" = "http://localhost:3100/pharmacy"; "pos" = "http://localhost:3100/pos"
}
foreach ($k in $checks.Keys) {
  try {
    $r = Invoke-WebRequest -Uri $checks[$k] -TimeoutSec 25 -UseBasicParsing
    Write-Host "   $k : $($r.StatusCode)" -ForegroundColor Green
  } catch { Write-Host "   $k : FAIL $($_.Exception.Message)" -ForegroundColor Red }
}

Write-Host ""
Write-Host "DONE. Sign in with your admin account and smoke-test /platform-admin + /demo." -ForegroundColor Green
Write-Host "Remember: D:\GMstore and production deploys are separate - handle them manually."
