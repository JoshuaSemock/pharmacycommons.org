# Stop the local app and the local Supabase stack (docs/local-app.md, phase 6).
# `supabase stop` keeps the database in its Docker volume; nothing is deleted.
# Docker Desktop itself is left running.
# SPDX-License-Identifier: GPL-3.0-or-later
param([string] $Tools = 'C:\Harddrive\4. Drug Matrix\Claude\Tools')
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:SUPABASE_TELEMETRY_DISABLED = '1'

# The app: the Vite server (built preview or dev) started by start-local.ps1 (only node processes running vite from this repo).
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*vite*' -and $_.CommandLine -like "*$(Split-Path $repo -Leaf)*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "Stopped app process $($_.ProcessId)" }
# ... and the minimized 'Pharmacy Commons app' console windows that started them.
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
  Where-Object { $_.CommandLine -like '*title Pharmacy Commons app*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Push-Location $repo
& (Join-Path $Tools 'supabase\supabase.exe') stop 2>&1 | Where-Object { $_ -match 'Stopped|backed up' } | ForEach-Object { Write-Host $_ }
Pop-Location
Write-Host 'Stopped. The database is kept in Docker (volume supabase_db_pharmacy-commons).' -ForegroundColor Green
Start-Sleep 3
