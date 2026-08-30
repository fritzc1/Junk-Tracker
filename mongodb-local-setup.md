# Local MongoDB Binary Setup Guide

To run MongoDB locally without system-level installation, you can download the binary version and run it in a local directory. Here's how:

## Download and Install MongoDB Binary

### Windows:
1. Go to: https://www.mongodb.com/try/download/community
2. Select "Windows" and then "MongoDB Community Server"
3. Choose "Download" for the latest version (e.g., 6.0 or 7.0)
4. Extract the downloaded ZIP file to a local directory like `C:\mongodb`

### macOS/Linux:
1. Go to: https://www.mongodb.com/try/download/community
2. Select your operating system and download the appropriate binary package
3. Extract to a local directory like `/opt/mongodb` or `~/mongodb`

## Create Local Data Directory

1. Create a directory for MongoDB data files:
   ```bash
   # Windows
   mkdir C:\data\db
   
   # macOS/Linux
   mkdir -p ~/mongodb/data/db
   ```

2. Create a configuration file (optional but recommended):
   ```bash
   # Windows
   notepad C:\mongodb\mongod.cfg
   
   # macOS/Linux
   nano ~/mongodb/mongod.cfg
   ```

   Add this content to the config file:
   ```yaml
   storage:
     dbPath: C:\data\db
   net:
     port: 27017
     bindIp: 127.0.0.1
   ```

## Running MongoDB Locally

### Windows:
1. Open Command Prompt as Administrator
2. Navigate to your MongoDB installation directory:
   ```cmd
   cd C:\mongodb\bin
   ```
3. Run MongoDB with the data directory:
   ```cmd
   mongod --dbpath C:\data\db
   ```

### macOS/Linux:
1. Open Terminal
2. Navigate to your MongoDB installation directory:
   ```bash
   cd ~/mongodb/bin
   ```
3. Run MongoDB with the data directory:
   ```bash
   ./mongod --dbpath ~/mongodb/data/db
   ```

## Alternative: Using Docker (Recommended)

If you prefer a containerized approach:

1. Install Docker Desktop for Windows/macOS or Docker Engine for Linux

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

3. Run with Docker Compose:
   ```bash
   docker-compose up -d
   ```

## Verify Local MongoDB Installation

1. Open a new terminal/command prompt
2. Connect to MongoDB:
   ```bash
   # Windows
   cd C:\mongodb\bin
   mongo
   
   # macOS/Linux
   cd ~/mongodb/bin
   ./mongo
   ```

3. You should see the MongoDB shell prompt:
   ```
   MongoDB shell version v6.0.x
   connecting to: mongodb://127.0.0.1:27017/
   ```

## Application Configuration

The Junk Tracker application is already configured to connect to:
- Host: 127.0.0.1 (localhost)
- Port: 27017
- Database name: junktracker

No changes are needed in the code if you're running MongoDB locally with default settings.

## Stopping MongoDB

To stop MongoDB when you're done:
1. In the terminal where MongoDB is running, press `Ctrl+C`
2. Or use the task manager (Windows) or `kill` command (macOS/Linux)

## Troubleshooting

If you encounter permission issues on macOS/Linux:
```bash
# Make binaries executable
chmod +x ~/mongodb/bin/*
```

If MongoDB fails to start due to permissions:
```bash
# Create data directory with proper permissions
mkdir -p ~/mongodb/data/db
chmod 755 ~/mongodb/data/db