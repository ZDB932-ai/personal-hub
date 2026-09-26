$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$rootPath = Split-Path -Parent $PSScriptRoot
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
foreach ($name in @('solar', 'abyss', 'dunes', 'garden', 'forest-lake', 'coast', 'obsidian', 'moon')) {
    $source = [System.Drawing.Image]::FromFile((Join-Path $rootPath "assets/wallpaper-originals/$name.png"))
    try {
        foreach ($variant in @(@{ Suffix = ''; Width = $source.Width; Quality = 88 }, @{ Suffix = '-thumb'; Width = 420; Quality = 82 })) {
            $height = [int][Math]::Round($source.Height * $variant.Width / $source.Width)
            $bitmap = New-Object System.Drawing.Bitmap($variant.Width, $height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($source, 0, 0, $variant.Width, $height)
                $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$variant.Quality)
                $bitmap.Save((Join-Path $rootPath "public/wallpapers/$name$($variant.Suffix).jpg"), $encoder, $parameters)
            } finally {
                $parameters.Dispose()
                $graphics.Dispose()
                $bitmap.Dispose()
            }
        }
    } finally { $source.Dispose() }
}
