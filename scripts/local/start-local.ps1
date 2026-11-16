# Start Pharmacy Commons locally and open it in the browser (docs/local-app.md, phase 6).
#   1. Docker Desktop (started if needed; waits for the engine)
#   2. the local Supabase stack (database, API, Edge Functions) from this repo
#   3. the app on http://127.0.0.1:5173, in a minimized window. By default this is the built
#      app (vite build --mode localdb + vite preview), rebuilt only when the code has changed
#      since the last build: it opens in seconds. -Dev runs the Vite dev server instead
#      (pages reload as you edit code; its first start after a package change is slow).
#   4. the default browser
# Safe to run twice: a working app is left alone; a stuck one is replaced.
# SPDX-License-Identifier: GPL-3.0-or-later
param(
  [string] $Tools = 'C:\Harddrive\4. Drug Matrix\Claude\Tools',
  [switch] $NoBrowser,
  [switch] $Dev
)
$ErrorActionPreference = 'Continue'   # native tools write notices to stderr; exit codes are checked instead
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$supabase = Join-Path $Tools 'supabase\supabase.exe'
$appUrl = 'http://127.0.0.1:5173'
$env:SUPABASE_TELEMETRY_DISABLED = '1'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host $text -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
function AppAnswers([int] $seconds) {
  try { Invoke-WebRequest $appUrl -UseBasicParsing -TimeoutSec $seconds | Out-Null; return $true } catch { return $false }
}
function StopApp {
  # Only node processes running vite from this repo, and their console windows.
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*vite*' -and $_.CommandLine -like "*$(Split-Path $repo -Leaf)*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { $_.CommandLine -like '*title Pharmacy Commons app*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 2
}

Step 'Docker'
docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  $dd = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $dd)) { Fail 'Docker Desktop is not installed.' }
  Write-Host 'Starting Docker Desktop...'
  Start-Process $dd
  $deadline = (Get-Date).AddMinutes(3)
  do { Start-Sleep 5; docker info --format '{{.ServerVersion}}' 2>$null | Out-Null } until ($LASTEXITCODE -eq 0 -or (Get-Date) -gt $deadline)
  if ($LASTEXITCODE -ne 0) { Fail 'Docker did not start within 3 minutes. Open Docker Desktop, wait for "Engine running", and try again.' }
}
Write-Host 'Docker engine is running.'

Step 'Database and API (supabase start)'
Push-Location $repo
& $supabase start 2>&1 | Where-Object { $_ -match 'Started|already running|API URL|error' } | ForEach-Object { Write-Host $_ }
$started = $LASTEXITCODE
Pop-Location
if ($started -ne 0) { Fail 'supabase start failed. Run it in this folder to see the full message.' }
try { Invoke-WebRequest 'http://127.0.0.1:54321/rest/v1/' -UseBasicParsing -TimeoutSec 10 -Headers @{ apikey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' } | Out-Null; Write-Host 'API is answering.' }
catch { if ($_.Exception.Response) { Write-Host 'API is answering.' } else { Fail 'The local API on port 54321 is not answering.' } }

Step 'App'
# Build and mode stamps live outside dist (vite build empties dist).
$stateDir = Join-Path $env:LOCALAPPDATA 'PharmacyCommons'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$stamp = Join-Path $stateDir 'last-build.txt'
$wantMode = if ($Dev) { 'dev' } else { 'built' }
$runningMode = if (Test-Path "$stamp.mode") { (Get-Content "$stamp.mode" -Raw).Trim() } else { '' }
if ((AppAnswers 5) -and $runningMode -eq $wantMode) {
  Write-Host "Already running at $appUrl"
} else {
  # Nothing usable on 5173 (stuck, or the other mode): clear it before starting fresh.
  StopApp
  if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
    Write-Host 'Installing packages (first run only)...'
    Push-Location $repo; npx -y pnpm@10.34.3 install --frozen-lockfile; Pop-Location
  }
  if ($Dev) {
    $command = 'npx -y pnpm@10.34.3 dev:local'
    $wait = 300
  } else {
    # Rebuild only when code changed since the last build (newest file in src, index.html, configs).
    $inputs = @(Get-ChildItem (Join-Path $repo 'src') -Recurse -File) +
      @(Get-ChildItem $repo -File | Where-Object { $_.Name -in 'index.html', 'vite.config.ts', 'package.json', 'pnpm-lock.yaml', '.env.localdb' })
    $newest = ($inputs | Measure-Object LastWriteTime -Maximum).Maximum
    if (-not (Test-Path $stamp) -or -not (Test-Path (Join-Path $repo 'dist\index.html')) -or (Get-Item $stamp).LastWriteTime -lt $newest) {
      Write-Host 'Building the app (only after code changes; about 2 minutes)...'
      Push-Location $repo
      npx -y pnpm@10.34.3 build:local 2>&1 | Select-Object -Last 2 | ForEach-Object { Write-Host $_ }
      $built = $LASTEXITCODE
      Pop-Location
      if ($built -ne 0 -or -not (Test-Path (Join-Path $repo 'dist\index.html'))) { Fail 'The build failed. Run "npx pnpm build:local" in the project folder to see why.' }
      Set-Content -Path $stamp -Value (Get-Date -Format o) -Encoding ascii
    } else {
      Write-Host 'Code unchanged since the last build: starting it.'
    }
    $command = 'npx -y pnpm@10.34.3 exec vite preview --mode localdb --host 127.0.0.1 --port 5173 --strictPort'
    $wait = 90
  }
  Set-Content -Path "$stamp.mode" -Value $wantMode -Encoding ascii
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', "title Pharmacy Commons app && $command" -WorkingDirectory $repo -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds($wait)
  $appUp = $false
  do { Start-Sleep 2; $appUp = AppAnswers 10 } until ($appUp -or (Get-Date) -gt $deadline)
  if (-not $appUp) { Fail "The app did not come up at $appUrl. Look at the minimized 'Pharmacy Commons app' window." }
  Write-Host "Running at $appUrl (window 'Pharmacy Commons app', minimized; close it to stop the app)."
}

if (-not $NoBrowser) { Start-Process $appUrl }
Write-Host "`nPharmacy Commons is up. Database dashboard: http://127.0.0.1:54323" -ForegroundColor Green
Start-Sleep 4
