param(
  [string]$OutputDirectory = "$PSScriptRoot\..\resources"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-LightClipIcon {
  param([int]$Size)

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $scale = $Size / 256.0
  $bounds = [System.Drawing.RectangleF]::new(0, 0, $Size, $Size)
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bounds,
    [System.Drawing.Color]::FromArgb(255, 23, 32, 51),
    [System.Drawing.Color]::FromArgb(255, 8, 16, 32),
    135
  )
  $accent = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bounds,
    [System.Drawing.Color]::FromArgb(255, 110, 231, 183),
    [System.Drawing.Color]::FromArgb(255, 125, 211, 252),
    135
  )

  $graphics.FillPath($background, (New-RoundedRectanglePath 0 0 $Size $Size (58 * $scale)))

  $clipboardPath = New-RoundedRectanglePath (50 * $scale) (70 * $scale) (156 * $scale) (140 * $scale) (24 * $scale)
  $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 248, 250, 252)), $clipboardPath)

  $clipPath = New-RoundedRectanglePath (65 * $scale) (51 * $scale) (126 * $scale) (48 * $scale) (24 * $scale)
  $graphics.FillPath($accent, $clipPath)

  $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 23, 32, 51), [Math]::Max(2, 14 * $scale))
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($linePen, 98 * $scale, 116 * $scale, 158 * $scale, 116 * $scale)
  $graphics.DrawLine($linePen, 98 * $scale, 146 * $scale, 176 * $scale, 146 * $scale)
  $graphics.DrawLine($linePen, 98 * $scale, 176 * $scale, 144 * $scale, 176 * $scale)

  $badgeBounds = [System.Drawing.RectangleF]::new(152 * $scale, 148 * $scale, 58 * $scale, 58 * $scale)
  $graphics.FillEllipse($accent, $badgeBounds)

  $checkPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 8, 16, 32), [Math]::Max(2, 8 * $scale))
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $checkPoints = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(170 * $scale, 177 * $scale),
    [System.Drawing.PointF]::new(178 * $scale, 185 * $scale),
    [System.Drawing.PointF]::new(193 * $scale, 167 * $scale)
  )
  $graphics.DrawLines($checkPen, $checkPoints)

  $graphics.Dispose()
  $background.Dispose()
  $accent.Dispose()
  return $bitmap
}

function Convert-PngToIcoEntry {
  param(
    [byte[]]$PngBytes,
    [int]$Size,
    [int]$Offset
  )

  $directoryEntry = [byte[]]::new(16)
  $directoryEntry[0] = if ($Size -eq 256) { 0 } else { [byte]$Size }
  $directoryEntry[1] = if ($Size -eq 256) { 0 } else { [byte]$Size }
  $directoryEntry[2] = 0
  $directoryEntry[3] = 0
  [BitConverter]::GetBytes([UInt16]1).CopyTo($directoryEntry, 4)
  [BitConverter]::GetBytes([UInt16]32).CopyTo($directoryEntry, 6)
  [BitConverter]::GetBytes([UInt32]$PngBytes.Length).CopyTo($directoryEntry, 8)
  [BitConverter]::GetBytes([UInt32]$Offset).CopyTo($directoryEntry, 12)

  return @{
    DirectoryEntry = $directoryEntry
    ImageBytes = $PngBytes
  }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$pngPath = Join-Path $OutputDirectory 'lightclip-icon.png'
$icoPath = Join-Path $OutputDirectory 'lightclip-icon.ico'
$primaryBitmap = Draw-LightClipIcon 256
$primaryBitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$primaryBitmap.Dispose()

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$offset = 6 + ($sizes.Count * 16)
$entries = foreach ($size in $sizes) {
  $bitmap = Draw-LightClipIcon $size
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  $pngBytes = $stream.ToArray()
  $stream.Dispose()
  $entry = Convert-PngToIcoEntry $pngBytes $size $offset
  $offset += $pngBytes.Length
  $entry
}

$icoStream = [System.IO.File]::Create($icoPath)
try {
  $header = [byte[]]::new(6)
  [BitConverter]::GetBytes([UInt16]0).CopyTo($header, 0)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($header, 2)
  [BitConverter]::GetBytes([UInt16]$entries.Count).CopyTo($header, 4)
  $icoStream.Write($header, 0, $header.Length)

  foreach ($entry in $entries) {
    $icoStream.Write($entry.DirectoryEntry, 0, $entry.DirectoryEntry.Length)
  }

  foreach ($entry in $entries) {
    $icoStream.Write($entry.ImageBytes, 0, $entry.ImageBytes.Length)
  }
} finally {
  $icoStream.Dispose()
}

Write-Host "Generated $pngPath and $icoPath"
