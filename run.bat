@echo off
REM ============================================================
REM  LabelStudio - run in development mode
REM  Double-click this file to launch the app.
REM ============================================================
setlocal
REM Always work from the folder this script lives in.
pushd "%~dp0"

echo(
echo === LabelStudio - starting =============================
echo(

REM Make sure Node.js is available.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on your PATH.
  echo         Install it from https://nodejs.org/ ^(LTS^) and try again.
  goto :end
)

REM Install dependencies the first time (or if node_modules is missing).
if not exist "node_modules" (
  echo First run detected - installing dependencies with npm install...
  echo This can take a few minutes.
  echo(
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. See the messages above.
    goto :end
  )
)

echo Launching the app ^(Electron + Vite dev server^)...
echo Close this window to stop the app.
echo(
call npm run dev

:end
echo(
popd
pause
endlocal
