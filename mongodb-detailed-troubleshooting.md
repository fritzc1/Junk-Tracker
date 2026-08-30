# Detailed MongoDB Troubleshooting

Since you're not seeing MongoDB in netstat output, let's go through a more systematic approach to identify and fix the issue:

## Step 1: Check if MongoDB Actually Started

### Method A: Check for Process in Task Manager
1. Press `Ctrl + Shift + Esc` to open Task Manager
2. Go to "Details" tab
3. Look for any process named:
   - `mongod.exe`
   - `mongo.exe`
   - `mongos.exe`

### Method B: Check Command Line Output
When you ran the start-mongodb.bat file, did you see any error messages in the terminal window? If the terminal closed immediately, that's a problem.

## Step 2: Run MongoDB Manually with Full Output

Create a new batch file called `debug-mongodb.bat`:

```batch
@echo off
echo Starting MongoDB with full output...
echo.

REM Change to the MongoDB bin directory
cd /d "mongodb-windows-x86_64-8.3.8\bin"

REM Create data directory if it doesn't exist
if not exist "..\data\db" mkdir "..\data\db"

echo Data directory created or already exists.

REM Start MongoDB with verbose output and log file
echo Starting MongoDB with verbose logging...
mongod.exe --dbpath "..\data\db" --verbose > "..\mongodb.log" 2>&1

echo.
echo MongoDB started. Check mongodb.log for details.
echo Press any key to exit...
pause
```

Save this as `debug-mongodb.bat` and run it.

## Step 3: Check for Common Issues

### Issue 1: Missing Visual C++ Redistributables
MongoDB requires Microsoft Visual C++ Redistributable packages:
1. Navigate to your MongoDB installation directory
2. Look for `vc_redist.x64.exe`
3. Run it as Administrator

### Issue 2: Insufficient Permissions
1. Right-click on the command prompt or batch file
2. Select "Run as administrator"
3. Try running MongoDB again

### Issue 3: Data Directory Issues
1. Make sure you have write permissions to:
   - `mongodb-windows-x86_64-8.3.8\data\db`
2. Try creating the directory manually:
   ```cmd
   mkdir "mongodb-windows-x86_64-8.3.8\data\db"
   ```

### Issue 4: Port Already in Use
Check if any process is using port 27017:
```cmd
netstat -ano | findstr :27017
```

If something is using it, kill the process:
```cmd
taskkill /PID <process_id> /F
```

## Step 4: Test with Minimal Configuration

Try running MongoDB with minimal configuration:
```cmd
cd mongodb-windows-x86_64-8.3.8\bin
mongod.exe --dbpath "..\data\db" --port 27018
```

This changes the port to 27018 to avoid conflicts.

## Step 5: Check MongoDB Log File

After running MongoDB, check if a log file was created:
1. Look in `mongodb-windows-x86_64-8.3.8\`
2. Look for files like:
   - `mongodb.log`
   - `mongod.log`
   - Any `.log` files

## Step 6: Alternative Approach - Use Docker

If you continue having issues, use Docker which is more reliable:

1. Install Docker Desktop for Windows
2. Create a `docker-compose.yml` file in your project root:
```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:latest
    container_name: junktracker-mongo
    ports:
      - "27017:27017"
    volumes:
      - ./mongo-data:/data/db
    restart: unless-stopped
```

3. Run with:
```cmd
docker-compose up -d
```

## Step 7: Verify MongoDB Installation

Check if MongoDB binaries are working:
1. Open command prompt in `mongodb-windows-x86_64-8.3.8\bin`
2. Run:
   ```cmd
   mongod.exe --version
   mongo.exe --version
   ```

If these don't work, the installation may be corrupted.

## Step 8: Complete Clean Restart

1. Close all command prompt windows
2. Kill any existing MongoDB processes:
   ```cmd
   taskkill /f /im mongod.exe
   ```
3. Delete the data directory (backup first if needed):
   ```cmd
   rmdir /s "mongodb-windows-x86_64-8.3.8\data\db"
   ```
4. Recreate it:
   ```cmd
   mkdir "mongodb-windows-x86_64-8.3.8\data\db"
   ```
5. Run MongoDB again with the debug batch file

## Expected Successful Output

When MongoDB starts correctly, you should see output like:
```
...
[initandlisten] MongoDB starting : pid=1234 port=27017 dbpath=..\data\db 64-bit host=your-computer-name
...
[initandlisten] waiting for connections on port 27017
```

## Next Steps

Try the debug-mongodb.bat approach first, as it will show you exactly what's happening. If that doesn't work, the Docker approach is very reliable and won't have these Windows-specific issues.