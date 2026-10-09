@echo off
setlocal enabledelayedexpansion
title RigDeck - Multi-Agent Mission Control
cd /d "%~dp0"

echo ========================================================
echo   RigDeck Desktop Orchestrator (Windows Edition)
echo ========================================================
echo.

rem Cari runner: bun dulu (lebih cepat), lalu npm.
rem
rem CATATAN PENTING:
rem Versi lama gagal dengan "was unexpected at this time" karena
rem memakai %ERRORLEVEL% DI DALAM blok if (...). Di Windows,
rem variabel itu dievaluasi saat blok dibaca, bukan saat dijalankan,
rem jadi nilainya selalu dari perintah sebelumnya.
rem Perbaikannya: pakai "if not errorlevel 1" (langsung cek hasil),
rem dan set variabel lalu dipakai dengan !RUNNER! (delayed expansion).

set RUNNER=

where bun >nul 2>&1
if not errorlevel 1 set RUNNER=bun

if "!RUNNER!"=="" (
    where npm >nul 2>&1
    if not errorlevel 1 set RUNNER=npm
)

if "!RUNNER!"=="" (
    echo [ERROR] Bun atau Node.js / NPM belum terdeteksi di PATH.
    echo.
    echo Install salah satu:
    echo    - Bun      : https://bun.sh
    echo    - Node.js  : https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [RigDeck] Menjalankan lewat !RUNNER! ...
echo.

if "!RUNNER!"=="bun" (
    bun run tauri dev
) else (
    npm run tauri dev
)

echo.
echo [RigDeck] Proses selesai / berhenti.
echo.
pause
