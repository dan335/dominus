@echo off
REM Thin wrapper: deploy.sh is the single source of truth for deploys, so this
REM file cannot drift from it. Runs deploy.sh with Git Bash.
cd /d "%~dp0"
set "GITBASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=bash"
"%GITBASH%" deploy.sh %*
exit /b %ERRORLEVEL%
