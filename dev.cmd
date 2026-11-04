@echo off
rem Starts the game with the project's own Node, so no system install is needed.
cd /d "%~dp0"
set "PATH=%~dp0.tools\node;%PATH%"
call npm run dev
