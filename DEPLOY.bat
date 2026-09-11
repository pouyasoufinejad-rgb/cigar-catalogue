@echo off
cd /d "%~dp0"
echo Deploying Cigar Catalogue to Cloudflare Workers...
call npx wrangler deploy
pause
