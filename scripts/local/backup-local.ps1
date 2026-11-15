# Nightly backup of the LOCAL database (docs/local-app.md, phase 6).
#   - pg_dump (custom format) of public, archive, auth, storage and supabase_migrations
#     from the local stack (127.0.0.1:54322; the CLI's default local password, not a secret)
#   - checks the archive is readable (pg_restore --list) and records exact row counts
#   - keeps the newest $KeepLocal dumps in $LocalDir and copies each one to $SecondDir,
#     keeping the newest $KeepSecond there
#   - appends one line per run to backup-log.txt in $LocalDir
# If the stack isn't running it logs that and exits 0 (a sleeping PC or a stopped stack is not
# an error). Registered as the scheduled task "Pharmacy Commons nightly backup" by
# install-backup-task.ps1.
# SPDX-License-Identifier: GPL-3.0-or-later
param(
  [string] $Tools = 'C:\Harddrive\4. Drug Matrix\Claude\Tools',
  [string] $LocalDir = 'C:\Harddrive\4. Drug Matrix\Claude\Backups\local-nightly',
  [string] $SecondDir = (Join-Path $env:USERPROFILE 'OneDrive\Pharmacy Commons Backups'),
  [int] $KeepLocal = 14,
  [int] $KeepSecond = 7
)
$ErrorActionPreference = 'Continue'
$bin = Join-Path $Tools 'pgsql\bin'
$env:PGPASSWORD = 'postgres'
Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
$P = @('-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres')
New-Item -ItemType Directory -Force $LocalDir | Out-Null
$log = Join-Path $LocalDir 'backup-log.txt'
function Log($msg) { $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg; Add-Content $log $line; Write-Host $line }

& "$bin\pg_isready.exe" -h 127.0.0.1 -p 54322 -q
if ($LASTEXITCODE -ne 0) { Log 'skipped: local database not running'; exit 0 }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$file = Join-Path $LocalDir "pharmacy-commons_$stamp.dump"
& "$bin\pg_dump.exe" @P -Fc -Z 6 -n public -n archive -n auth -n storage -n supabase_migrations -f $file 2> "$file.log"
if ($LASTEXITCODE -ne 0) { Log "FAILED: pg_dump (see $file.log)"; exit 1 }
& "$bin\pg_restore.exe" --list $file > $null 2>&1
if ($LASTEXITCODE -ne 0) { Log "FAILED: dump is not readable: $file"; exit 1 }
Remove-Item "$file.log" -ErrorAction SilentlyContinue

$counts = & "$bin\psql.exe" @P -tAc "select count(*) from public.entities"
$sizeMb = [math]::Round((Get-Item $file).Length / 1MB, 1)
$hash = (Get-FileHash $file -Algorithm SHA256).Hash.Substring(0, 16)

$copied = 'no second location'
if ($SecondDir) {
  try {
    New-Item -ItemType Directory -Force $SecondDir -ErrorAction Stop | Out-Null
    Copy-Item $file $SecondDir -ErrorAction Stop
    $copied = "copied to $SecondDir"
    Get-ChildItem $SecondDir -Filter 'pharmacy-commons_*.dump' | Sort-Object Name -Descending | Select-Object -Skip $KeepSecond | Remove-Item
  } catch { $copied = "COPY FAILED to ${SecondDir}: $($_.Exception.Message)" }
}
Get-ChildItem $LocalDir -Filter 'pharmacy-commons_*.dump' | Sort-Object Name -Descending | Select-Object -Skip $KeepLocal | Remove-Item

Log ("ok: {0} ({1} MB, sha256 {2}..., {3} entities); {4}" -f (Split-Path $file -Leaf), $sizeMb, $hash, $counts.Trim(), $copied)
