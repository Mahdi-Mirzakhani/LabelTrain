@echo off
REM ============================================================
REM  LabelStudio - build a Windows .exe installer
REM  Double-click this file to package the app.
REM  Output installer: build\release\
REM ============================================================

REM --- Self-elevate to Administrator -------------------------
REM electron-builder unpacks winCodeSign, which contains symbolic
REM links. Creating symlinks on Windows needs admin rights, else
REM it fails with "A required privilege is not held by the client".
net session >nul 2>nul
if errorlevel 1 (
  echo Requesting Administrator privileges ^(needed to build the installer^)...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
REM ----------------------------------------------------------

setlocal
REM Always work from the folder this script lives in.
pushd "%~dp0"

echo(
echo === LabelStudio - building Windows installer ============
echo(

REM Make sure Node.js is available.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on your PATH.
  echo         Install it from https://nodejs.org/ ^(LTS^) and try again.
  goto :end
)

REM Install dependencies if missing.
if not exist "node_modules" (
  echo Installing dependencies with npm install...
  echo(
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. See the messages above.
    goto :end
  )
)

echo Compiling and packaging with electron-builder...
echo This can take several minutes on the first run.
echo(
call npm run electron:build:win
if errorlevel 1 (
  echo(
  echo [ERROR] Build failed. See the messages above.
  goto :end
)

echo(
echo === Done ================================================
echo Your installer ^(.exe^) is in:
echo    %CD%\build\release
echo(
REM Open the output folder in Explorer if it exists.
if exist "build\release" start "" explorer "%CD%\build\release"

:end
echo(
popd
pause
endlocal
