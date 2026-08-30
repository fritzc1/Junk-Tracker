# MongoDB Troubleshooting Guide

If you're having trouble running MongoDB, here are common issues and solutions:

## Common Issues and Solutions

### 1. Permission Issues
**Problem**: "Access denied" or "Permission denied" errors
**Solution**: 
- Run the command prompt as Administrator
- Make sure the data directory has proper permissions

### 2. Port Already in Use
**Problem**: "Address already in use" error
**Solution**:
```cmd
netstat -ano | findstr :27017
```
This will show if something is using port 27017. Kill the process if needed:
```cmd
taskkill /PID <process_id> /F
```

### 3. Data Directory Issues
**Problem**: MongoDB fails to start due to data directory problems
**Solution**:
- Ensure the data directory exists: `mkdir mongodb-windows-x86_64-8.3.8\data\db`
- Check that you have write permissions to the directory

### 4. Missing Visual C++ Redistributables
**Problem**: MongoDB fails to start with "DLL load failed" errors
**Solution**:
- Install Microsoft Visual C++ Redistributable packages
- You can find `vc_redist.x64.exe` in the MongoDB installation folder

### 5. Path Issues
**Problem**: "The system cannot find the path specified"
**Solution**:
- Make sure you're running commands from the correct directory
- Use full paths when needed

## Running MongoDB Step-by-Step

1. **Open Command Prompt as Administrator**
2. **Navigate to MongoDB bin directory**:
   ```cmd
   cd mongodb-windows-x86_64-8.3.8\bin
   ```
3. **Create data directory** (if it doesn't exist):
   ```cmd
   mkdir ..\data\db
   ```
4. **Start MongoDB**:
   ```cmd
   mongod.exe --dbpath "..\data\db"
   ```

## Verify MongoDB is Running

Once MongoDB is running successfully, you should see output similar to:
```
...
[initandlisten] waiting for connections on port 27017
```

To test if it's working:
1. Open another command prompt
2. Run:
   ```cmd
   cd mongodb-windows-x86_64-8.3.8\bin
   mongo
   ```
3. You should see the MongoDB shell prompt:
   ```
   MongoDB shell version v8.3.8
   connecting to: mongodb://127.0.0.1:27017/
   ```

## Alternative: Using Docker

If you continue having issues with the binary installation, use Docker instead:

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
3. Run with: `docker-compose up -d`

## Check MongoDB Logs

If MongoDB is failing to start, check the log files in your data directory for more detailed error information.

## Environment Variables

You can also add MongoDB's bin directory to your system PATH:
1. Right-click "This PC" → Properties → Advanced System Settings
2. Click "Environment Variables"
3. Under "System Variables", find and select "Path", then click "Edit"
4. Add: `C:\path\to\mongodb-windows-x86_64-8.3.8\bin`
5. Restart your command prompt

## Windows-Specific Notes

- Make sure Windows Defender or antivirus isn't blocking MongoDB
- Ensure you're not running multiple instances of MongoDB
- Check that your Windows user account has sufficient privileges