$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $output = '.tauri-tmp/generated-icons'
    & npx tauri icon assets/icon.png --output $output
    if ($LASTEXITCODE -ne 0) { throw '图标生成失败' }
    & npx tauri icon assets/icon.png --output "$output/web" --png 36 --png 81 --png 180
    if ($LASTEXITCODE -ne 0) { throw '网页图标生成失败' }
    Get-ChildItem $output -File | Copy-Item -Destination src-tauri/icons
    Copy-Item "$output/32x32.png" public/favicon.png
    Copy-Item "$output/128x128@2x.png" public/app-icon.png
    Copy-Item "$output/web/180x180.png" public/apple-touch-icon.png
    $res = 'android/app/src/main/res'
    Get-ChildItem "$output/android" -Directory -Filter 'mipmap-*' | ForEach-Object {
        $destination = Join-Path $res $_.Name
        New-Item -ItemType Directory -Force $destination | Out-Null
        Get-ChildItem $_.FullName -File | Copy-Item -Destination $destination
    }
    Copy-Item "$res/mipmap-anydpi-v26/ic_launcher.xml" "$res/mipmap-anydpi-v26/ic_launcher_round.xml"
    Copy-Item "$output/web/36x36.png" "$res/mipmap-ldpi/ic_launcher.png"
    Copy-Item "$output/web/36x36.png" "$res/mipmap-ldpi/ic_launcher_round.png"
    Copy-Item "$output/web/81x81.png" "$res/mipmap-ldpi/ic_launcher_foreground.png"
    Set-Content "$res/values/ic_launcher_background.xml" '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#FFF4ED</color></resources>'
} finally {
    Pop-Location
}
