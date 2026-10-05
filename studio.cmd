@echo off
cd /d "%~dp0"
echo Starting 64k Studio at http://localhost:8064
start "" http://localhost:8064
node studio\server.js
