# BusinessOS boot starter - brings the whole public site up after a reboot.
#
# The problem this exists to solve: on 2026-10-09 the machine rebooted and three
# services stayed down, because nothing was responsible for starting them. The
# dental demo (which serves the 3D model and the notification bell) ran from a
# manual `Start-Process`, so it simply never came back, and the owner saw that
# as "3D and the notifications button stopped working".
#
# What runs here, in order:
#   1. pm2 resurrect/start  - every service in ecosystem.config.cjs
#   2. the watchdog         - owns port 3100, the platform itself, and can roll
#                             a bad release back to the previous one
#   3. the browser          - so turning the laptop on is enough to use it
#
# Registered as a Scheduled Task running at startup, delayed so the network and
# the PostgreSQL service have a moment (the platform logs in to the database on
# boot, and so do the demos).
#
# Usage:
#   powershell -File scripts\boot-start.ps1          # start everything
#   powershell -File scripts\boot-start.ps1 -Check  # report only, start nothing
[CmdletBinding()]
param(
  [switch]$Check,
  [int]$NetworkWaitSec = 120,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $Root ".data\boot.log"
$SiteUrl = "https://bosc.dpdns.org"

function Write-Log {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  try {
    $dir = Split-Path -Parent $LogFile
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::AppendAllText($LogFile, "$line`r`n", (New-Object System.Text.UTF8Encoding($false)))
  } catch { }
  Write-Host $line
}

# Bounded .NET probe rather than Test-NetConnection, which has no timeout in
# PowerShell 5.1 and can hang for minutes under SYSTEM.
function Wait-Network {
  param([int]$TimeoutSec)
  # Hashtables rather than positional arrays: indexing a wrapped array literal
  # is exactly the kind of thing that silently probes the wrong host, and the
  # first version of this waited out its whole timeout on a machine that was
  # online the entire time.
  $targets = @(
    @{ Host = "1.1.1.1"; Port = 443 },
    @{ Host = "8.8.8.8"; Port = 53 }
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    foreach ($t in $targets) {
      try {
        $c = New-Object Net.Sockets.TcpClient
        $ar = $c.BeginConnect($t.Host, [int]$t.Port, $null, $null)
        if ($ar.AsyncWaitHandle.WaitOne(2000)) { $c.EndConnect($ar); $c.Close(); return $true }
        $c.Close()
      } catch { }
    }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Get-PortOwner {
  param([int]$Port)
  return (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1).OwningProcess
}

function Get-Pm2Command {
  # The PowerShell shim drops the `--` separator, which pm2 needs to pass
  # arguments through to Next. The `.cmd` shim is the one that works here.
  $candidate = Join-Path $env:APPDATA "npm\pm2.cmd"
  if (Test-Path -LiteralPath $candidate) { return $candidate }
  return "pm2"
}

Write-Log "boot start (check-only: $Check)"

if (-not (Wait-Network -TimeoutSec $NetworkWaitSec)) {
  Write-Log "WARN network not confirmed yet, starting anyway"
}

$pm2 = Get-Pm2Command
$ecosystem = Join-Path $Root "ecosystem.config.cjs"

if ($Check) {
  $owner = Get-PortOwner -Port 3100
  Write-Log ("platform :3100 owner = " + $(if ($owner) { $owner } else { "none" }))
  foreach ($p in 3101, 3106, 5000, 4096, 4097) {
    $o = Get-PortOwner -Port $p
    Write-Log ("port $p owner = " + $(if ($o) { $o } else { "none" }))
  }
  exit 0
}

# 1. everything pm2 owns
try {
  if (Get-PortOwner -Port 3101) {
    Write-Log "pm2 services appear to be up already, asking pm2 to reconcile anyway"
  }
  & $pm2 start $ecosystem 2>&1 | ForEach-Object { if ($_ -match "error|Error") { Write-Log "pm2: $_" } }
  Write-Log "pm2 ecosystem reconciled"
} catch {
  Write-Log "ERROR pm2 could not start the ecosystem: $($_.Exception.Message)"
}

# 2. the platform, which the watchdog owns because it is the thing that can roll
#    a broken release back. -Check reports; it never stops a healthy server.
try {
  $watchdog = Join-Path $Root "scripts\platform-watchdog.ps1"
  $owner = Get-PortOwner -Port 3100
  if ($owner) {
    Write-Log "platform already listening on :3100 (pid $owner), leaving it alone"
  } else {
    # -Threshold 1: the scheduled watchdog deliberately ignores the first failed
    # probe so a transient blip does not cause a restart. At boot there is no
    # blip to ignore -- the server is simply not running -- and with the default
    # threshold this call would only increment a counter and return, leaving the
    # site down until the next scheduled run.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $watchdog -Check -Threshold 1 | ForEach-Object { Write-Log "watchdog: $_" }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $watchdog -Threshold 1 | Out-Null
    Write-Log "watchdog asked to bring the platform up"
  }
} catch {
  Write-Log "ERROR watchdog could not start the platform: $($_.Exception.Message)"
}

# 3. prove it, so a boot that half-worked is loud. The platform needs a few
# seconds to bind after the watchdog starts it, so retry briefly rather than
# reporting a 502 that is only a race.
foreach ($u in @("$SiteUrl/demo", "$SiteUrl/demo/dental/login")) {
  $ok = $false
  foreach ($attempt in 1..10) {
    try {
      $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20
      if ([int]$r.StatusCode -lt 500) {
        Write-Log "ok  $u -> HTTP $([int]$r.StatusCode)"
        $ok = $true
        break
      }
      Write-Log "WARN $u -> HTTP $([int]$r.StatusCode)"
    } catch {
      Write-Log "WARN $u did not answer yet (attempt $attempt)"
    }
    Start-Sleep -Seconds 5
  }
  if (-not $ok) { Write-Log "ERROR $u never came up - this boot is not healthy" }
}

if (-not $NoBrowser) {
  try { Start-Process $SiteUrl | Out-Null; Write-Log "opened $SiteUrl" }
  catch { Write-Log "could not open a browser: $($_.Exception.Message)" }
}

Write-Log "boot start done"