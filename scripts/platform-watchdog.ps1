# BUSINESSOS PLATFORM WATCHDOG - probes the local origin and restarts it when it
# is down or wedged (TCP accepts, no HTTP answer). Catches the Cloudflare 524 case.
#   -Check   probe and report only (exit 0 healthy / 1 unhealthy)
#   -DryRun  evaluate and log the action it would take, never act

[CmdletBinding()]
param(
  [int]$Port = 3100,
  [string]$ProbePath = "/signin",
  [string]$WorkingDirectory = "",
  [string]$StartCommand = "npm run serve",
  [string]$BuildCommand = "npm run build",
  [int]$TimeoutSec = 15,
  [int]$Threshold = 2,
  [int]$BootGraceSec = 180,
  [int]$StartWaitSec = 90,
  [switch]$Check,
  [switch]$DryRun,
  # Promote a release from `releases/` to active, restart into it, and roll back
  # to the previous release if it does not become healthy. This is how a deploy
  # switches over: the build never touches the directory the server is reading,
  # so the only downtime is this restart, not the build.
  [string]$ActivateRelease = ""
)

$ErrorActionPreference = "Stop"

if (-not $WorkingDirectory) { $WorkingDirectory = Split-Path -Parent $PSScriptRoot }

$DataDir = Join-Path $WorkingDirectory ".data"
$StateFile = Join-Path $DataDir "watchdog.state.json"
$LogFile = Join-Path $DataDir "watchdog.log"
$ReleasesFile = Join-Path $DataDir "releases.json"
$ReleasesDir = Join-Path $WorkingDirectory "releases"
$LegacyBuildIdFile = Join-Path $WorkingDirectory ".next\BUILD_ID"
$ServeOut = Join-Path $DataDir "prod.out.log"
$ServeErr = Join-Path $DataDir "prod.err.log"
$BuildLog = Join-Path $DataDir "watchdog-build.log"

if (-not (Test-Path -LiteralPath $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }

function Write-Log {
  param([string]$Level, [string]$Message)
  $stamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
  $line = "$stamp [$Level] $Message`r`n"
  if ((Test-Path -LiteralPath $LogFile) -and (Get-Item -LiteralPath $LogFile).Length -gt 5MB) {
    Move-Item -LiteralPath $LogFile -Destination "$LogFile.1" -Force
  }
  [System.IO.File]::AppendAllText($LogFile, $line, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "[$Level] $Message"
}

function Read-State {
  if (Test-Path -LiteralPath $StateFile) {
    try { return (Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json) } catch { }
  }
  return [pscustomobject]@{ Failures = 0; Rebuilds = 0; LastAction = ""; LastDetail = "" }
}

function Save-State {
  param($State)
  $json = $State | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($StateFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}

# ── releases ────────────────────────────────────────────────────────────────
# `active` is the release `npm run serve` starts (scripts/serve.mjs reads this
# same file). `previous` is what a rollback returns to. The release a build
# produces is verified and promoted BEFORE it is named here, so a failed deploy
# never leaves the server pointing at a build nobody has run.

function Get-ReleaseState {
  if (Test-Path -LiteralPath $ReleasesFile) {
    try { return (Get-Content -LiteralPath $ReleasesFile -Raw | ConvertFrom-Json) } catch { }
  }
  return [pscustomobject]@{ active = ""; previous = ""; history = @() }
}

function Save-ReleaseState {
  param($State)
  $json = $State | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($ReleasesFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-ReleaseDir {
  param([string]$Id)
  if (-not $Id) { return $null }
  $dir = Join-Path $ReleasesDir $Id
  if (-not (Test-Path -LiteralPath (Join-Path $dir "BUILD_ID"))) { return $null }
  return $dir
}

# The build output that is actually live. When a release is active its BUILD_ID
# is the one that matters: the old check asked about `.next`, which is just a
# build artifact now, and it is why a deploy could leave the watchdog convinced
# the site was fine while it was serving nothing.
function Get-LiveBuildIdFile {
  $state = Get-ReleaseState
  $dir = Get-ReleaseDir -Id $state.active
  if ($dir) { return (Join-Path $dir "BUILD_ID") }
  return $LegacyBuildIdFile
}

function Test-Platform {
  $url = "http://127.0.0.1:$Port$ProbePath"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
    $sw.Stop()
    return [pscustomobject]@{ Ok = $true; Status = [int]$resp.StatusCode; Ms = [int]$sw.ElapsedMilliseconds; Detail = "HTTP $([int]$resp.StatusCode)" }
  } catch {
    $sw.Stop()
    $gotResponse = $null -ne $_.Exception.Response
    if ($gotResponse) {
      $code = [int]$_.Exception.Response.StatusCode
      # A 4xx is the application answering on purpose (a redirect to /signin, a
      # 404 on a path it does not own) and the process is demonstrably serving.
      # A 5xx is not: that is the server up and failing, which is precisely the
      # state this watchdog exists to notice. Treating it as healthy is what let
      # the 2026-10-09 outage sit there while the process was "running".
      if ($code -ge 500) {
        return [pscustomobject]@{ Ok = $false; Status = $code; Ms = [int]$sw.ElapsedMilliseconds; Detail = "HTTP $code (server error)" }
      }
      return [pscustomobject]@{ Ok = $true; Status = $code; Ms = [int]$sw.ElapsedMilliseconds; Detail = "HTTP $code (app-level, process is serving)" }
    }
    return [pscustomobject]@{ Ok = $false; Status = 0; Ms = [int]$sw.ElapsedMilliseconds; Detail = $_.Exception.Message }
  }
}

function Get-PortOwner {
  return (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1).OwningProcess
}

# Every process that belongs to this port: the server itself (it names the port on
# its command line) plus the npm/cmd wrappers above it, reached by walking the
# parent chain from the port owner. Scoped by construction, so a watchdog pointed
# at a sandbox port can never touch the production platform on 3100.
function Get-PlatformProcesses {
  $found = @{}
  $serverPat = "(?i)(-p\s+$Port\b|--port[=\s]+$Port\b|PORT=$Port\b)"
  $queue = @()
  foreach ($proc in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
    if ($proc.CommandLine -and $proc.CommandLine -match $serverPat) {
      $found[[int]$proc.ProcessId] = $proc
      $queue += [int]$proc.ProcessId
    }
  }
  # Also seed from the port owner: it may not name the port on its command line.
  $owner = Get-PortOwner
  if ($owner -and -not $found.ContainsKey([int]$owner)) {
    $found[[int]$owner] = $null
    $queue += [int]$owner
  }

  # Walk parents of every server found, not just the port owner, so wrappers of a
  # server that has not bound its port yet are still identified and cleaned up.
  $visited = @{}
  while ($queue.Count -gt 0) {
    $current = $queue[0]
    # Queue.Queue never breaks on a one-element slice ([1..0] reverses, not empties).
    if ($queue.Count -eq 1) { $queue = @() } else { $queue = @($queue[1..($queue.Count - 1)]) }
    if ($visited.ContainsKey($current)) { continue }
    $visited[$current] = $true
    for ($depth = 0; $depth -lt 8 -and $current; $depth++) {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
      if (-not $proc) { break }
      $found[[int]$proc.ProcessId] = $proc
      if (-not $proc.ParentProcessId -or [int]$proc.ParentProcessId -eq 0) { break }
      $parent = [int]$proc.ParentProcessId
      if ($visited.ContainsKey($parent)) { break }
      $current = $parent
    }
  }

  return @($found.Values | Where-Object { $_ })
}

function Test-BuildRunning {
  $pat = "(?i)(scripts[\\/]+build\.ts|run\s+build\b)"
  $hits = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $pat }
  return $null -ne $hits
}

function Stop-Pid {
  param([int]$ProcessId)
  if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
  # taskkill writes to stderr on a race (process already gone); under
  # $ErrorActionPreference=Stop that becomes a terminating error and aborts the
  # run mid-restart. Run it through Start-Process so its streams are never
  # attached to the error stream.
  try {
    $null = Start-Process -FilePath "taskkill.exe" -ArgumentList @("/T","/F","/PID","$ProcessId") `
      -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput "$env:TEMP\wd-taskkill.out" `
      -RedirectStandardError "$env:TEMP\wd-taskkill.err"
  } catch { }
}

function Stop-Platform {
  $killed = @()
  # Captured BEFORE anything is killed: once the port owner is gone its parent
  # chain is unreachable, which is exactly the set of npm/cmd wrappers that would
  # otherwise survive and keep holding the port open.
  $procs = Get-PlatformProcesses

  $owner = Get-PortOwner
  if ($owner) { Stop-Pid $owner; $killed += $owner }
  for ($attempt = 1; $attempt -lt 4 -and (Get-PortOwner); $attempt++) {
    Start-Sleep -Seconds 2
    $owner = Get-PortOwner
    if ($owner) { Stop-Pid $owner; $killed += $owner }
  }
  Start-Sleep -Milliseconds 500

  foreach ($proc in $procs) {
    if (-not $proc.ProcessId) { continue }
    if (Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue) {
      Stop-Pid $proc.ProcessId
      $killed += $proc.ProcessId
    }
  }
  return ($killed | Select-Object -Unique) -join ","
}

function Start-Platform {
  # `SERVE_RELEASE` is set in this process's environment just before the call and
  # inherited by cmd.exe and then by scripts/serve.mjs. PowerShell 5.1's
  # Start-Process has no -Environment, and the release has to be named at start
  # time: `.data/releases.json` is only updated once the new release has proved
  # it can serve, so it cannot be the thing that selects it.
  $arg = "/c $StartCommand >> `"$ServeOut`" 2>> `"$ServeErr`""
  Start-Process -FilePath "cmd.exe" -ArgumentList $arg -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
}

function Start-PlatformRelease {
  param([string]$Id)
  if ($Id) { $env:SERVE_RELEASE = $Id } else { Remove-Item Env:\SERVE_RELEASE -ErrorAction SilentlyContinue }
  Start-Platform
  if ($Id) { Remove-Item Env:\SERVE_RELEASE -ErrorAction SilentlyContinue }
}

function Start-Build {
  $arg = "/c $BuildCommand >> `"$BuildLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList $arg -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
}

function Wait-Healthy {
  $deadline = (Get-Date).AddSeconds($StartWaitSec)
  # A process that has exited will never become healthy, so waiting out the full
  # window only adds downtime before the rollback. Give it a few probes to bind
  # (a real start is ready in well under a second) and then stop waiting.
  $deadNoPort = 0
  while ((Get-Date) -lt $deadline) {
    $probe = Test-Platform
    if ($probe.Ok) { return $probe }
    if (Get-PortOwner) {
      $deadNoPort = 0
    } else {
      $deadNoPort++
      if ($deadNoPort -ge 4) { return $null }
    }
    Start-Sleep -Seconds 3
  }
  return $null
}

function Get-AgeSeconds {
  param($Process)
  if (-not $Process) { return -1 }
  $created = $Process.CreationDate
  if (-not $created) { return -1 }
  return [int]((Get-Date) - $created).TotalSeconds
}

$state = Read-State
$probe = Test-Platform

# ── activation and rollback ─────────────────────────────────────────────────
# Reached only when a deploy asks for it. The restart and the health wait are the
# same Stop-Platform/Start-Platform/Wait-Healthy used by the health path below,
# so a switchover cannot behave differently from a crash recovery.
if ($ActivateRelease) {
  $target = Get-ReleaseDir -Id $ActivateRelease
  if (-not $target) {
    Write-Log "ERROR" "cannot activate release '$ActivateRelease': no BUILD_ID in releases\$ActivateRelease"
    exit 1
  }
  $rel = Get-ReleaseState
  $from = $rel.active
  Write-Log "INFO" "activating release $ActivateRelease (state said '${from}')"

  if ($DryRun) {
    Write-Log "INFO" "DRYRUN: would restart into release $ActivateRelease"
    exit 0
  }

  # Start the server on the new release WITHOUT committing it to the state file.
  # If this release is broken, nothing has recorded it as good and the previous
  # release is still the one the state file names.
  $null = Stop-Platform
  Start-PlatformRelease -Id $ActivateRelease
  $healthy = Wait-Healthy
  if ($healthy) {
    $rel.previous = $from
    $rel.active = $ActivateRelease
    $rel.history = @($ActivateRelease, $from) + @($rel.history) | Where-Object { $_ } | Select-Object -Unique
    Save-ReleaseState $rel
    Write-Log "INFO" "release $ActivateRelease is serving ($($healthy.Detail))"
    exit 0
  }

  # The new build does not come up. Put back what was serving a minute ago
  # rather than leaving the site down waiting for a human.
  Write-Log "ERROR" "release $ActivateRelease did not become healthy, rolling back"
  $fallback = if ($from) { Get-ReleaseDir -Id $from } else { $null }
  if (-not $fallback) {
    Write-Log "ERROR" "no usable previous release to roll back to; manual intervention required"
    exit 1
  }
  $null = Stop-Platform
  Start-PlatformRelease -Id $from
  $restored = Wait-Healthy
  # Committed only now, and only to what is actually serving.
  $rel.active = $from
  Save-ReleaseState $rel
  if ($restored) {
    Write-Log "INFO" "rolled back to release $from ($($restored.Detail))"
    exit 1
  }
  Write-Log "ERROR" "rollback to $from also failed; manual intervention required"
  exit 1
}

if ($Check) {
  if ($probe.Ok) { Write-Host "healthy: $($probe.Detail) in $($probe.Ms)ms"; exit 0 }
  Write-Host "unhealthy: $($probe.Detail) after $($probe.Ms)ms"; exit 1
}

if ($probe.Ok) {
  if ([int]$state.Failures -ne 0 -or $state.LastAction -or [int]$state.Rebuilds -ne 0) {
    $state.Failures = 0
    $state.Rebuilds = 0
    $state.LastAction = ""
    $state.LastDetail = ""
    Save-State $state
    Write-Log "INFO" "recovered: $($probe.Detail) in $($probe.Ms)ms"
  } else {
    # Heartbeat: proves the scheduled task is actually running. ~60 bytes/5min,
    # well under the 5MB rotation ceiling (years of headroom).
    Write-Log "INFO" "healthy: $($probe.Detail) in $($probe.Ms)ms"
  }
  exit 0
}

$state.Failures = [int]$state.Failures + 1
Save-State $state
Write-Log "WARN" "probe failed $($state.Failures)/$Threshold ($($probe.Detail), $($probe.Ms)ms)"

if ([int]$state.Failures -lt $Threshold) { exit 0 }
if ($DryRun) { Write-Log "INFO" "DRYRUN: would restart the platform now"; exit 0 }

# Boot grace exists to spare a server that has not bound its port yet. A port that
# IS bound but stays silent is a wedge, not a boot - that is the outage case, so
# grace never applies to it regardless of process age.
$age = -1
if (-not (Get-PortOwner)) {
  $youngest = Get-PlatformProcesses | Sort-Object CreationDate -Descending | Select-Object -First 1
  $age = Get-AgeSeconds $youngest
}
if ($age -ge 0 -and $age -lt $BootGraceSec) {
  Write-Log "INFO" "platform process is ${age}s old, within boot grace of ${BootGraceSec}s, not acting"
  exit 0
}

$liveBuildIdFile = Get-LiveBuildIdFile
if (-not (Test-Path -LiteralPath $liveBuildIdFile)) {
  if (Test-BuildRunning) {
    Write-Log "WARN" "build output missing and a build is already running, waiting"
    exit 0
  }
  # A build that fails would leave BUILD_ID absent forever; cap the attempts so a
  # permanently broken build degrades to a loud error instead of a rebuild storm.
  if ([int]$state.Rebuilds -ge 3) {
    Write-Log "ERROR" "build output missing and 3 rebuilds already attempted, giving up - manual intervention required"
    exit 1
  }
  # Do NOT stop the platform to rebuild it. A missing BUILD_ID is a fact about a
  # directory, not about a process, and stopping a server that is answering in
  # order to rebuild is how a stale-artifact check turns into an outage. The
  # rebuild is best-effort and the restart below is what actually acts.
  Write-Log "ERROR" "live build output missing at $liveBuildIdFile, starting a rebuild ($([int]$state.Rebuilds + 1)/3)"
  Start-Build
  $state.Rebuilds = [int]$state.Rebuilds + 1
  $state.LastAction = "rebuild"
  $state.LastDetail = "live build output was missing"
  Save-State $state
}
$state.Rebuilds = 0

Write-Log "ERROR" "platform unhealthy, restarting (port $Port)"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$stopped = Stop-Platform
if ($stopped) { Write-Log "INFO" "stopped pids: $stopped" }

Start-Platform
$recovered = Wait-Healthy
$sw.Stop()

if ($recovered) {
  Write-Log "INFO" "recovered in $([int]$sw.Elapsed.TotalSeconds)s ($($recovered.Detail))"
  $state.Failures = 0
  $state.LastAction = "restart"
  $state.LastDetail = "recovered in $([int]$sw.Elapsed.TotalSeconds)s"
  Save-State $state
  exit 0
}

Write-Log "ERROR" "did not recover within ${StartWaitSec}s"
$state.Failures = 0
$state.LastAction = "restart-failed"
$state.LastDetail = "no health within ${StartWaitSec}s"
Save-State $state
exit 1
