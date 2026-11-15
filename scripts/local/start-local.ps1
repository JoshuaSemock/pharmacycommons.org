# Start Pharmacy Commons locally and open it in the browser (docs/local-app.md, phase 6).
#   1. Docker Desktop (started if needed; waits for the engine)
#   2. the local Supabase stack (database, API, Edge Functions) from this repo
#   3. the app (pnpm dev:local on http://127.0.0.1:5173), in a minimized window
#   4. the default browser
# Safe to run twice: anything already running is left alone.
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

Step 'App (pnpm dev:local)'
$appUp = $false
try { Invoke-WebRequest $appUrl -UseBasicParsing -TimeoutSec 3 | Out-Null; $appUp = $true } catch {}
if ($appUp) {
  Write-Host "Already running at $appUrl"
} else {
  if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
    Write-Host 'Installing packages (first run only)...'
    Push-Location $repo; npx -y pnpm@10.34.3 install --frozen-lockfile; Pop-Location
  }
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'title Pharmacy Commons app && npx -y pnpm@10.34.3 dev:local' -WorkingDirectory $repo -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(60)
  do { Start-Sleep 2; try { Invoke-WebRequest $appUrl -UseBasicParsing -TimeoutSec 3 | Out-Null; $appUp = $true } catch {} } until ($appUp -or (Get-Date) -gt $deadline)
  if (-not $appUp) { Fail "The app did not come up at $appUrl. Look at the minimized 'Pharmacy Commons app' window." }
  Write-Host "Running at $appUrl (window 'Pharmacy Commons app', minimized; close it to stop the app)."
}

if (-not $NoBrowser) { Start-Process $appUrl }
Write-Host "`nPharmacy Commons is up. Database dashboard: http://127.0.0.1:54323" -ForegroundColor Green
Start-Sleep 4
