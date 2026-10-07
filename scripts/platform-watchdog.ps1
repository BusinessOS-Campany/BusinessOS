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
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not $WorkingDirectory) { $WorkingDirectory = Split-Path -Parent $PSScriptRoot }

$DataDir = Join-Path $WorkingDirectory ".data"
$StateFile = Join-Path $DataDir "watchdog.state.json"
$LogFile = Join-Path $DataDir "watchdog.log"
$BuildIdFile = Join-Path $WorkingDirectory ".next\BUILD_ID"
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

function Test-Platform {
  $url = "http://127.0.0.1:$Port$ProbePath"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
    $sw.Stop()
    return [pscustomobject]@{ Ok = $true; Status = [int]$resp.StatusCode; Ms = [int]$sw.ElapsedMilliseconds; Detail = "HTTP $($resp.StatusCode)" }
  } catch {
    $sw.Stop()
    $gotResponse = $null -ne $_.Exception.Response
    if ($gotResponse) {
      $code = [int]$_.Exception.Response.StatusCode
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
  $arg = "/c $StartCommand >> `"$ServeOut`" 2>> `"$ServeErr`""
  Start-Process -FilePath "cmd.exe" -ArgumentList $arg -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
}

function Start-Build {
  $arg = "/c $BuildCommand >> `"$BuildLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList $arg -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
}

function Wait-Healthy {
  $deadline = (Get-Date).AddSeconds($StartWaitSec)
  while ((Get-Date) -lt $deadline) {
    $probe = Test-Platform
    if ($probe.Ok) { return $probe }
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

if (-not (Test-Path -LiteralPath $BuildIdFile)) {
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
  Write-Log "ERROR" "build output missing at $BuildIdFile, starting a rebuild ($([int]$state.Rebuilds + 1)/3)"
  $stopped = Stop-Platform
  if ($stopped) { Write-Log "INFO" "stopped pids: $stopped" }
  Start-Build
  $state.Rebuilds = [int]$state.Rebuilds + 1
  $state.LastAction = "rebuild"
  $state.LastDetail = "build output was missing"
  Save-State $state
  exit 1
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
