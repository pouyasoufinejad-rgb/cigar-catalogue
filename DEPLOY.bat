@echo off
cd /d "%~dp0"
echo Deploying Cigar Catalogue v136 to Cloudflare Workers...
call npx wrangler deploy
pause
