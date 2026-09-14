@echo off
setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo   SYNC LOCAL REPO AND APPLY FIXES
echo ========================================
echo.
echo Your local repo is many commits behind GitHub, which is why
echo UPDATE.bat could not push. This resyncs it and reapplies the fixes.
echo.
echo Nothing is lost: your current commit is saved to a backup branch
echo before anything is reset.
echo.
pause

echo.
echo [1/4] Fetching from GitHub...
git fetch origin
if errorlevel 1 goto ERROR

echo.
echo [2/4] Saving your current state to a backup branch...
for /f %%i in ('git rev-parse --short HEAD') do set CURRENT=%%i
git branch -f backup-before-sync HEAD
if errorlevel 1 goto ERROR
echo       Saved commit %CURRENT% to branch "backup-before-sync"

echo.
echo [3/4] Moving local main onto the current GitHub state...
git reset --hard origin/main
if errorlevel 1 goto ERROR

echo.
echo [4/4] Applying the catalogue editor fixes...
git apply --3way --whitespace=nowarn claude-fixes.patch
if errorlevel 1 goto PATCHFAIL

echo.
echo ========================================
echo   DONE
echo ========================================
echo.
echo Changes now staged in your working tree:
echo.
git status --short
echo.
echo Next: run UPDATE.bat to commit and push.
echo.
echo You can delete this file and claude-fixes.patch afterwards.
echo.
pause
exit /b 0

:PATCHFAIL
echo.
echo ========================================
echo   PATCH DID NOT APPLY CLEANLY
echo ========================================
echo.
echo GitHub has probably moved again. Nothing was pushed.
echo Your previous state is still on branch "backup-before-sync".
echo Send this output back and it can be rebuilt against the new state.
echo.
pause
exit /b 1

:ERROR
echo.
echo ========================================
echo   SYNC FAILED
echo ========================================
echo.
echo Nothing was pushed. Your previous state is on "backup-before-sync"
echo if the reset had already run.
echo.
pause
exit /b 1
