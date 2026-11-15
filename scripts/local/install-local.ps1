# One-time setup on the local PC (docs/local-app.md, phase 6). No admin rights needed.
#   - Desktop shortcuts "Pharmacy Commons" (start-local.ps1) and "Stop Pharmacy Commons" (stop-local.ps1)
#   - Scheduled task "Pharmacy Commons nightly backup": backup-local.ps1 daily at $At, for the
#     current user, catching up after the PC was asleep or off (StartWhenAvailable)
# Re-running replaces both. Remove the task with:
#   Unregister-ScheduledTask -TaskName 'Pharmacy Commons nightly backup' -Confirm:$false
# SPDX-License-Identifier: GPL-3.0-or-later
param(
  [string] $At = '2:17AM',
  [string] $SecondDir = (Join-Path $env:USERPROFILE 'OneDrive\Pharmacy Commons Backups')
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

# Desktop shortcuts
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
foreach ($s in @(
  @{ name = 'Pharmacy Commons'; script = 'start-local.ps1'; icon = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) 'public\favicon.ico' },
  @{ name = 'Stop Pharmacy Commons'; script = 'stop-local.ps1'; icon = "$env:SystemRoot\System32\shell32.dll,27" }
)) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop "$($s.name).lnk"))
  $lnk.TargetPath = $ps
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $here $s.script)`""
  $lnk.WorkingDirectory = $here
  $lnk.IconLocation = $s.icon
  $lnk.Save()
  Write-Host "Shortcut: $(Join-Path $desktop "$($s.name).lnk")"
}

# Nightly backup task
$action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $here 'backup-local.ps1')`" -SecondDir `"$SecondDir`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Pharmacy Commons nightly backup' -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'pg_dump of the local Pharmacy Commons database (scripts/local/backup-local.ps1)' -Force | Out-Null
$t = Get-ScheduledTask -TaskName 'Pharmacy Commons nightly backup'
Write-Host "Scheduled task: $($t.TaskName), daily at $At, state $($t.State); second copy to $SecondDir"
