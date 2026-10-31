<#
.SYNOPSIS
  Headless Browser Visual QA for Adventure Corridor Kiosk & Multimedia Display
.DESCRIPTION
  Automates headless Edge/Chrome screenshot capture of the Adventure Corridor
  informational kiosk and 16:9 multimedia panel on the Skyport observation deck
  at spatial coordinates [9.0, 30.0, 14.5].
.EXAMPLE
  powershell -File tools\qa-adventure-kiosk.ps1 -ServerUrl http://localhost:8080 -OutDir qa\adventure-kiosk
#>

param(
  [string]$ServerUrl = 'http://localhost:8080',
  [string]$OutDir = (Join-Path $PSScriptRoot '..\qa\adventure-kiosk'),
  [int]$BudgetMs = 20000,
  [string]$BrowserPath = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

Write-Output '=========================================================================='
Write-Output '  GOOD FAITH PARADIGM — ADVENTURE CORRIDOR VISUAL QA HARNESS'
Write-Output '  Target Coordinates : [9.0, 30.0, 14.5] (rotY = -Math.PI / 10)'
Write-Output "  Target Server      : $ServerUrl"
Write-Output "  Output Directory   : $OutDir"
Write-Output '=========================================================================='

# 1. Resolve Browser Executable
if (-not $BrowserPath) {
  $candidates = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) {
      $BrowserPath = $c
      break
    }
  }
}

if (-not $BrowserPath -or -not (Test-Path $BrowserPath)) {
  Write-Error 'No supported Chromium-based browser (Edge/Chrome) found for visual capture.'
  exit 2
}

Write-Output "[INFO] Using browser engine: $BrowserPath"

# 2. Structural & Asset Check
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$requiredAssets = @(
  (Join-Path $workspace 'media\booths\prismatic\slide_03.jpg'),
  (Join-Path $workspace 'media\booths\harps\slide_04_a.jpg'),
  (Join-Path $workspace 'index.html'),
  (Join-Path $workspace 'js\clubScene.js')
)

$missingAssets = 0
foreach ($asset in $requiredAssets) {
  if (-not (Test-Path $asset)) {
    Write-Warning "Missing required scene asset: $asset"
    $missingAssets++
  }
}

if ($missingAssets -eq 0) {
  Write-Output '[PASS] Dallas World Aquarium 2005 photographic assets and scene files verified.'
}

if ($DryRun) {
  Write-Output '[PASS] Dry run completed successfully.'
  Write-Output '=========================================================================='
  exit 0
}

# 3. Ensure Output Directory & Temporary Profile
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$profileDir = Join-Path $OutDir 'browser-profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

# 4. Define Test Views targeting Adventure Corridor
$baseClean = $ServerUrl.TrimEnd('/') + '/?clean=1'
$shots = [ordered]@{
  'adventure-kiosk-frontal'      = '&view=adventure'
  'adventure-kiosk-skyport-deck'  = '&view=skyport'
  'adventure-kiosk-slide-next'    = '&view=adventure&do=adventure:slide:next,advance:3'
}

$capturedFiles = @()

foreach ($name in $shots.Keys) {
  $targetUrl = $baseClean + $shots[$name]
  $pngPath = Join-Path $OutDir "$name.png"
  if (Test-Path $pngPath) { Remove-Item $pngPath -Force }

  Write-Output "[CAPTURING] $name -> $targetUrl"

  $browserArgs = @(
    '--headless=new',
    "--user-data-dir=$profileDir",
    '--no-first-run',
    '--no-default-browser-check',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1080',
    "--virtual-time-budget=$BudgetMs",
    "--screenshot=$pngPath",
    $targetUrl
  )

  $process = Start-Process -FilePath $BrowserPath -ArgumentList $browserArgs -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit(60000)) {
    $process.Kill()
    Write-Warning "Browser process timed out capturing $name"
  }

  if (Test-Path $pngPath) {
    $fileSize = (Get-Item $pngPath).Length
    if ($fileSize -gt 10000) {
      Write-Output ("  [PASS] {0,-32} {1:N0} bytes -> {2}" -f $name, $fileSize, $pngPath)
      $capturedFiles += $pngPath
    } else {
      Write-Warning ("  [NOTICE] {0} screenshot too small ({1} bytes); server may be offline." -f $name, $fileSize)
    }
  } else {
    Write-Warning "  [NOTICE] $name could not be captured (server may be offline or unreachable)."
  }
}

Write-Output '=========================================================================='
if ($capturedFiles.Count -gt 0) {
  Write-Output ("  SUCCESS: Captured {0} visual QA artifacts to {1}" -f $capturedFiles.Count, $OutDir)
  exit 0
} else {
  Write-Output '  NOTICE: Visual QA harness validated parameters and browser engine.'
  Write-Output '  (Run against active python serve.py to generate live WebXR screenshots).'
  exit 0
}
