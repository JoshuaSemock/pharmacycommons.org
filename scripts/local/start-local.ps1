# Start Pharmacy Commons locally and open it in the browser (docs/local-app.md, phase 6).
#   1. Docker Desktop (started if needed; waits for the engine)
#   2. the local Supabase stack (database, API, Edge Functions) from this repo
#   3. the app (Vite dev server, pnpm dev:local) on http://127.0.0.1:5173, in a minimized
#      window. One version, editable: data edits (Tables, Studio) and code edits (pages reload
#      as you save) both show at once. About 35 s to start; a minute or two after a package change.
#   4. the default browser
# Safe to run twice: a working app is left alone; a stuck one is replaced.
# SPDX-License-Identifier: GPL-3.0-or-later
param(
  [string] $Tools = 'C:\Harddrive\4. Drug Matrix\Claude\Tools',
  [switch] $NoBrowser
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

Step 'App (Vite dev server)'
if (AppAnswers 10) {
  Write-Host "Already running at $appUrl"
} else {
  # Nothing answering on 5173 (stopped, or stuck): clear it before starting fresh.
  StopApp
  if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
    Write-Host 'Installing packages (first run only)...'
    Push-Location $repo; npx -y pnpm@10.34.3 install --frozen-lockfile; Pop-Location
  }
  Write-Host 'Starting the app (about 35 seconds; longer after a package change)...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'title Pharmacy Commons app && npx -y pnpm@10.34.3 dev:local' -WorkingDirectory $repo -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(300)
  $appUp = $false
  do { Start-Sleep 3; $appUp = AppAnswers 10 } until ($appUp -or (Get-Date) -gt $deadline)
  if (-not $appUp) { Fail "The app did not come up at $appUrl within 5 minutes. Look at the minimized 'Pharmacy Commons app' window." }
  Write-Host "Running at $appUrl (window 'Pharmacy Commons app', minimized; close it to stop the app)."
}

if (-not $NoBrowser) { Start-Process $appUrl }
Write-Host "`nPharmacy Commons is up. Database dashboard: http://127.0.0.1:54323" -ForegroundColor Green
Start-Sleep 4
