# Переименовывает аудио уроков Акыды в схему akyda-1-N.mp3
# и складывает копии в папку %USERPROFILE%\Desktop\akyda_upload
#
# Как запустить:
#   1. Откройте PowerShell (Пуск -> наберите "PowerShell").
#   2. Выполните (вместе со скобками одной строкой):
#        powershell -ExecutionPolicy Bypass -File "путь\к\rename_akyda.ps1"
#      или просто скопируйте весь код ниже и вставьте в окно PowerShell.

$src = "C:\Users\user\Desktop\Вайбкодинг\Акыда. Базовый уровень"
$dst = "$env:USERPROFILE\Desktop\akyda_upload"

New-Item -ItemType Directory -Force -Path $dst | Out-Null

Get-ChildItem -Path $src -Filter *.mp3 | ForEach-Object {
    if ($_.Name -match 'Урок\s*(\d+)') {
        $n = $matches[1]
        $target = Join-Path $dst "akyda-1-$n.mp3"
        Copy-Item $_.FullName $target -Force
        Write-Host "$($_.Name)  ->  akyda-1-$n.mp3"
    } else {
        Write-Host "ПРОПУЩЕН (не нашёл номер урока): $($_.Name)"
    }
}

Write-Host ""
Write-Host "Готово. Переименованные копии лежат в: $dst"
