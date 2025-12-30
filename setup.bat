@echo off
echo ================================
echo WhoRU Chat App - Quick Start
echo ================================
echo.

echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js: OK
echo.

echo Checking MongoDB...
mongod --version >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: MongoDB might not be installed locally
    echo You can use MongoDB Atlas instead
    echo See QUICKSTART.md for details
) else (
    echo MongoDB: OK
)
echo.

echo ================================
echo Installation Complete!
echo ================================
echo.
echo Next steps:
echo 1. Configure server/.env (see server/.env.example)
echo 2. Open TWO terminals:
echo    Terminal 1: cd server ^&^& npm run dev
echo    Terminal 2: cd client ^&^& npm start
echo.
echo See QUICKSTART.md for detailed setup guide
echo.
pause
