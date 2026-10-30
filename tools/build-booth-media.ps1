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

# 2. NFT Harps of God Raffle deck (16 slides: video evidence frame | GFP archival enhancement)
$harps = @(
  @('vid_01_evolve_type1.jpg', 'slice_13_the_omega_point.png'),
  @('vid_03_miracles_sheet.jpg', 'pdf_miracles_of_the_holy_spirit_pair.png'),
  @('vid_04_mnemonic_overlay.jpg', 'pdf_double_slit_theophany.png'),
  @('vid_07_early_universe_overlay.jpg', 'slice_03_quantum_pneumatology.png'),
  @('vid_10_galactic_arm_milky_way.jpg', 'pdf_galactic_harp_exegesis.png'),
  @('vid_11_festival_flyer_fullscreen.jpg', 'slice_09_entanglement_1111_signal.png'),
  @('vid_13_rorschach_inkblot.jpg', 'slice_08_supernatural_symmetry.png'),
  @('vid_14_dollar_unfinished_pyramid.jpg', 'slice_11_theology_of_fiat.png'),
  @('vid_16_golden_plates_table.jpg', 'pdf_osirian_resurrection_cycle.png'),
  @('vid_17_plates_2000_2001_overlay.jpg', 'asset_golden_plates_blueprint.png'),
  @('vid_02_raffle_medallions.jpg', 'asset_medallions_qr_coin.png'),
  @('vid_20_3d_three_earths_table.jpg', 'slice_05_sry_gene_catalyst.png'),
  @('vid_21_3d_golden_plates_closeup.jpg', 'slice_15_axolotl_metanoia.png'),
  @('vid_18_museum_tour_finale.jpg', 'asset_harps_of_god_both.jpg'),
  @('vid_22_pyramid_plates_oasis.jpg', 'slice_14_eight_principles_fifth_sun.png'),
  @('vid_23_golden_harps_clouds.jpg', 'slice_12_galactic_eschatology.png')
)
for ($i = 0; $i -lt $harps.Count; $i++) {
  $n = ($i + 1).ToString("00")
  Convert-Pair (Join-Path $A $harps[$i][0]) (Join-Path $A $harps[$i][1]) (Join-Path $Dest "harps\slide_$n.jpg")
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

$size = (Get-ChildItem $Dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Output ("Booth media built: {0:N1} MB in {1}" -f $size, $Dest)
