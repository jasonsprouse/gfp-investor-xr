# Builds web-optimised booth media (1280x720 JPEG textures + narration MP3s) from a local clone of
# https://github.com/jasonsprouse/digital-golden-plates
# Usage: powershell -File tools\build-booth-media.ps1 -Source <path-to-digital-golden-plates> 
param(
  [string]$Source = "C:\Users\jason\.gemini\antigravity\scratch\digital-golden-plates-ref",
  [string]$Dest = (Join-Path (Split-Path $PSScriptRoot -Parent) "media\booths")
)

Add-Type -AssemblyName System.Drawing

$W = 1280; $H = 720
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)

function New-Canvas {
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(255, 5, 8, 16))
  return @{ Bmp = $bmp; G = $g }
}

# Draw image 'contain'-fitted inside the given rectangle
function Draw-Contain($g, $path, $x, $y, $w, $h) {
  $img = [System.Drawing.Image]::FromFile($path)
  try {
    $scale = [Math]::Min($w / $img.Width, $h / $img.Height)
    $dw = [int]($img.Width * $scale); $dh = [int]($img.Height * $scale)
    $dx = $x + [int](($w - $dw) / 2); $dy = $y + [int](($h - $dh) / 2)
    $g.DrawImage($img, $dx, $dy, $dw, $dh)
  } finally { $img.Dispose() }
}

function Save-Jpeg($bmp, $outPath) {
  $dir = Split-Path $outPath -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($outPath, $jpegCodec, $encParams)
}

function Convert-Single($src, $out) {
  $c = New-Canvas
  Draw-Contain $c.G $src 0 0 $W $H
  Save-Jpeg $c.Bmp $out
  $c.G.Dispose(); $c.Bmp.Dispose()
}

# Keep native aspect ratio (longest side <= 1280) so the runtime composer can letterbox as needed
function Convert-Native($src, $out, $maxSide = 1280) {
  $img = [System.Drawing.Image]::FromFile($src)
  try {
    $scale = [Math]::Min(1.0, $maxSide / [Math]::Max($img.Width, $img.Height))
    $w = [Math]::Max(1, [int]($img.Width * $scale)); $h = [Math]::Max(1, [int]($img.Height * $scale))
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::FromArgb(255, 5, 8, 16))
    $g.DrawImage($img, 0, 0, $w, $h)
    Save-Jpeg $bmp $out
    $g.Dispose(); $bmp.Dispose()
  } finally { $img.Dispose() }
}

function Convert-Pair($left, $right, $out) {
  $c = New-Canvas
  Draw-Contain $c.G $left 8 8 ($W / 2 - 16) ($H - 16)
  Draw-Contain $c.G $right ($W / 2 + 8) 8 ($W / 2 - 16) ($H - 16)
  # thin divider
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 240, 255), 3)
  $c.G.DrawLine($pen, $W / 2, 0, $W / 2, $H)
  Save-Jpeg $c.Bmp $out
  $pen.Dispose(); $c.G.Dispose(); $c.Bmp.Dispose()
}

function Copy-Audio($srcDir, $destDir) {
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  Copy-Item -Path (Join-Path $srcDir "slide_*.mp3") -Destination $destDir -Force
}

$A = Join-Path $Source "assets"

# 1. Prismatic Architecture (20 slides + narration)
for ($i = 1; $i -le 20; $i++) {
  $n = $i.ToString("00")
  Convert-Single (Join-Path $Source "slides_prismatic\slide_$n.png") (Join-Path $Dest "prismatic\slide_$n.jpg")
}
Copy-Audio (Join-Path $Source "audio_prismatic") (Join-Path $Dest "prismatic")

# 2. NFT Harps of God Raffle deck (16 slides). Image pairs come from HARPS_SLIDES in the live
#    nft_harps_presentation.html (via media/booths/harps/slides.json, see tools/extract-slide-data.mjs):
#    slide_NN_a.jpg = video evidence frame (img1), slide_NN_b.jpg = GFP synthesis image (img2).
$harpsJson = Join-Path $Dest "harps\slides.json"
if (-not (Test-Path $harpsJson)) { throw "Run tools/extract-slide-data.mjs first ($harpsJson missing)" }
$harps = Get-Content $harpsJson -Raw -Encoding UTF8 | ConvertFrom-Json
# Remove stale side-by-side composites from the previous layout
Get-ChildItem (Join-Path $Dest "harps") -Filter "slide_??.jpg" -ErrorAction SilentlyContinue | Remove-Item -Force
for ($i = 0; $i -lt $harps.Count; $i++) {
  $n = ($i + 1).ToString("00")
  Convert-Native (Join-Path $A $harps[$i].img1) (Join-Path $Dest "harps\slide_${n}_a.jpg")
  Convert-Native (Join-Path $A $harps[$i].img2) (Join-Path $Dest "harps\slide_${n}_b.jpg")
}
Copy-Audio (Join-Path $Source "audio_harps") (Join-Path $Dest "harps")

# 3. Sacred Blueprint & Archive gallery (5 single-image panels)
$gallery = @('asset_gfp_infographic.png', 'asset_decoding_gfp.png', 'slice_01_sacred_blueprint.png', 'slice_10_economics_of_salvation.png', 'asset_golden_plates_blueprint.png')
for ($i = 0; $i -lt $gallery.Count; $i++) {
  $n = ($i + 1).ToString("00")
  Convert-Single (Join-Path $A $gallery[$i]) (Join-Path $Dest "archive\slide_$n.jpg")
}

# 4. NFT Collector cards (front | back)
Convert-Pair (Join-Path $A 'card_yellow_y_harps_492856_front.jpg') (Join-Path $A 'card_yellow_y_harps_492856_back.jpg') (Join-Path $Dest "cards\slide_01.jpg")
Convert-Pair (Join-Path $A 'card_green_g_harps_490643_front.jpg') (Join-Path $A 'card_green_g_harps_490643_back.jpg') (Join-Path $Dest "cards\slide_02.jpg")
Convert-Single (Join-Path $A 'asset_harps_of_god_both.jpg') (Join-Path $Dest "cards\slide_03.jpg")
Convert-Single (Join-Path $A 'asset_medallions_qr_coin.png') (Join-Path $Dest "cards\slide_04.jpg")

# 5. Relic Pavilion textures: Harps of God card faces (4:5 portrait, 640x800, upscaled with bicubic)
function Convert-Card($src, $out) {
  $bmp = New-Object System.Drawing.Bitmap(640, 800)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::FromArgb(255, 10, 12, 20))
  Draw-Contain $g $src 0 0 640 800
  Save-Jpeg $bmp $out
  $g.Dispose(); $bmp.Dispose()
}
Convert-Card (Join-Path $A 'card_yellow_y_harps_492856_front.jpg') (Join-Path $Dest "relics\yellow_front.jpg")
Convert-Card (Join-Path $A 'card_yellow_y_harps_492856_back.jpg')  (Join-Path $Dest "relics\yellow_back.jpg")
Convert-Card (Join-Path $A 'card_green_g_harps_490643_front.jpg')  (Join-Path $Dest "relics\green_front.jpg")
Convert-Card (Join-Path $A 'card_green_g_harps_490643_back.jpg')   (Join-Path $Dest "relics\green_back.jpg")

$size = (Get-ChildItem $Dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Output ("Booth media built: {0:N1} MB in {1}" -f $size, $Dest)
