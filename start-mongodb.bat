@echo off
echo Starting MongoDB...
echo.

REM Change to the MongoDB bin directory
cd mongodb-windows-x86_64-8.3.8\bin

REM Create data directory if it doesn't exist
if not exist "..\data\db" mkdir "..\data\db"

REM Start MongoDB with the data directory
mongod.exe --dbpath "..\data\db"

echo.
echo MongoDB started successfully!
echo Press Ctrl+C to stop MongoDB
echo.
pause