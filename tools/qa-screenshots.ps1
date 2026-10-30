# Headless Edge screenshots of the XR scene for QA (software WebGL, separate profile).
# Usage: powershell -File tools\qa-screenshots.ps1 -OutDir <dir> [-Only name1,name2]
# The dev server must already be running on http://localhost:8080 (python serve.py).
param(
  [string]$OutDir = (Join-Path $PSScriptRoot "..\qa"),
  [string[]]$Only = @(),
  [int]$BudgetMs = 22000
)

$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$base = 'http://localhost:8080/?clean=1'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$profileDir = Join-Path $OutDir 'edge-profile'

$shots = [ordered]@{
  'skyport'          = '&view=skyport'
  'relics'           = '&view=relics'
  'relics-animated'  = '&view=relics&do=relic:plate3:toggle,relic:sphinx:count,relic:yellow:flip,relic:gold:flip,advance:6'
  'booth-prismatic'  = '&view=booth:prismatic'
  'booth-harps-video'= '&view=booth:harps'
  'booth-harps-gfp'  = '&view=booth:harps&do=booth:harps:view'
  'booth-harps-both' = '&view=booth:harps&do=booth:harps:view,booth:harps:view'
  'booth-transcript' = '&view=booth:prismatic&do=booth:prismatic:view'
  'booth-collector'  = '&view=booth:collector'
  'docent-idle'      = '&view=docent'
  'docent'           = '&view=docent&voice=0&do=docent:tour,advance:8'
}

foreach ($name in $shots.Keys) {
  if ($Only.Count -gt 0 -and ($Only -notcontains $name)) { continue }
  $png = Join-Path $OutDir "$name.png"
  if (Test-Path $png) { Remove-Item $png -Force }
  $args2 = @('--headless=new', "--user-data-dir=$profileDir", '--no-first-run',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900',
    "--virtual-time-budget=$BudgetMs", "--screenshot=$png", ($base + $shots[$name]))
  $p = Start-Process -FilePath $edge -ArgumentList $args2 -PassThru -WindowStyle Hidden
  if (-not $p.WaitForExit(120000)) { $p.Kill() }
  Write-Output ("{0,-20} {1}" -f $name, (Test-Path $png))
}
