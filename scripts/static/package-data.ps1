# Package the static edition's data for the deploy workflow (docs/static-export.md).
#   powershell -File scripts\static\package-data.ps1 -Out "C:\...\StaticExport\full" [-Upload]
# Writes <Out>\static-data.tar.gz holding data\ and api-static\ from <Out>\site.
# -Upload attaches it to the GitHub release `static-data` (created if missing) with gh;
# that makes the files public, so only with Joshua's go-ahead.
# Destination: scripts/static/package-data.ps1
param([Parameter(Mandatory = $true)][string]$Out, [switch]$Upload)
$ErrorActionPreference = 'Stop'
$site = Join-Path $Out 'site'
foreach ($d in 'data', 'api-static') { if (-not (Test-Path (Join-Path $site $d))) { throw "Missing $site\$d" } }
$tgz = Join-Path $Out 'static-data.tar.gz'
Remove-Item $tgz -ErrorAction SilentlyContinue
& tar.exe -czf $tgz -C $site data api-static
if ($LASTEXITCODE -ne 0) { throw "tar failed ($LASTEXITCODE)" }
'{0} {1:N0} MB' -f $tgz, ((Get-Item $tgz).Length / 1MB)
if ($Upload) {
  $repo = 'JoshuaSemock/pharmacycommons.org'
  & gh release view static-data --repo $repo *> $null
  if ($LASTEXITCODE -ne 0) {
    & gh release create static-data --repo $repo --title 'Static edition data' --notes 'Recorded data for the static edition (docs/static-export.md). Replaced on each refresh.' --latest=false
  }
  & gh release upload static-data $tgz --repo $repo --clobber
}
