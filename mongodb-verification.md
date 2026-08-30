# Verifying MongoDB is Running

When MongoDB starts successfully, it should display some initial information and then run in the background. Here's how to properly verify that MongoDB is running:

## 1. Check MongoDB Status

### Using Windows Task Manager:
1. Press `Ctrl + Shift + Esc` to open Task Manager
2. Go to the "Details" tab
3. Look for processes named `mongod.exe`
4. If you see it running, MongoDB is active

### Using Command Line:
```cmd
tasklist | findstr mongod
```

## 2. Test Connection to MongoDB

Open a **new** command prompt window (don't close the one running MongoDB):

1. Navigate to MongoDB bin directory:
   ```cmd
   cd mongodb-windows-x86_64-8.3.8\bin
   ```

2. Connect to MongoDB:
   ```cmd
   mongo
   ```

3. If successful, you should see output like:
   ```
   MongoDB shell version v8.3.8
   connecting to: mongodb://127.0.0.1:27017/
   MongoDB server version: 8.3.8
   >
   ```

4. You can test basic commands:
   ```javascript
   show dbs
   use junktracker
   db.items.insert({test: "success"})
   db.items.find()
   ```

5. Exit the MongoDB shell:
   ```javascript
   exit
   ```

## 3. Check MongoDB Logs

MongoDB logs are typically stored in the data directory. Look for log files like:
- `mongodb-windows-x86_64-8.3.8\data\mongod.log`
- Or check the console output when you started MongoDB for any error messages

## 4. Verify Port Usage

Check if MongoDB is listening on port 27017:
```cmd
netstat -ano | findstr :27017
```

If MongoDB is running, you should see something like:
```
TCP    127.0.0.1:27017       0.0.0.0:0              LISTENING       1234
```

## 5. Test with Your Application

Once MongoDB is confirmed running, start your Junk Tracker application:

### Backend:
```cmd
cd backend
npm start
```

### Frontend:
```cmd
cd frontend
npm start
```

## What to Expect When MongoDB is Running Properly

When MongoDB starts successfully, you should see output similar to:
```
...
[initandlisten] waiting for connections on port 27017
[WT] 2026-08-27T00:14:31.123+0000 I  -        [main] 
[WT] 2026-08-27T00:14:31.123+0000 I  -        [main] 
[WT] 2026-08-27T00:14:31.123+0000 I  -        [main] 
[initandlisten] waiting for connections on port 27017
```

## Troubleshooting Tips

If you don't see the "waiting for connections" message:
1. Check if there are any error messages in the terminal output
2. Verify that no other MongoDB instance is running
3. Make sure the data directory path is correct
4. Ensure you're running as Administrator

## Running MongoDB in Foreground (for debugging)

If you want to see continuous output from MongoDB, run it with:
```cmd
mongod.exe --dbpath "..\data\db" --verbose
```

This will show detailed logging information while MongoDB is running.