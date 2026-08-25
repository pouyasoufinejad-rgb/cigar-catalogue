@echo off
setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo      CIGAR CATALOGUE UPDATE
echo ========================================
echo.

for /f "delims=" %%i in ('git status --porcelain') do set HAS_CHANGES=1

if not defined HAS_CHANGES (
    echo No changes found. Nothing to upload.
    echo.
    pause
    exit /b 0
)

echo Changes detected:
echo.
git status --short
echo.

set /p MSG=Describe this update [Update Cigar Catalogue]: 
if "%MSG%"=="" set "MSG=Update Cigar Catalogue"

git add -A
if errorlevel 1 goto ERROR

git commit -m "%MSG%"
if errorlevel 1 goto ERROR

git push origin main
if errorlevel 1 goto ERROR

echo.
echo ========================================
echo SUCCESS
echo ========================================
echo.
echo GitHub updated.
echo Cloudflare will deploy automatically.
echo.
pause
exit /b 0

:ERROR
echo.
echo ========================================
echo UPDATE FAILED
echo ========================================
echo.
pause
exit /b 1