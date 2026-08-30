# Docker Setup for Junk Tracker

Since you're having issues with the local MongoDB installation, I recommend using Docker which is much more reliable and doesn't have these Windows-specific issues.

## Prerequisites
1. Install Docker Desktop for Windows:
   - Download from: https://www.docker.com/products/docker-desktop
   - Install and start Docker Desktop

## Setup Instructions

### 1. Create docker-compose.yml file
In your project root directory, create a file named `docker-compose.yml` with the following content:

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

### 2. Start MongoDB with Docker
Open a command prompt in your project directory and run:

```cmd
docker-compose up -d
```

This will:
- Download the MongoDB image (if not already present)
- Create a container named `junktracker-mongo`
- Map port 27017 to your host
- Create a volume for persistent data storage

### 3. Verify Docker MongoDB is Running
```cmd
docker ps
```

You should see your `junktracker-mongo` container running.

### 4. Test Connection
```cmd
docker exec -it junktracker-mongo mongosh
```

This will open the MongoDB shell where you can run commands like:
```javascript
show dbs
use junktracker
db.items.insert({test: "success"})
db.items.find()
```

## Stop Docker MongoDB
To stop the container:
```cmd
docker-compose down
```

## Benefits of Docker Approach
- No permission issues
- No Visual C++ redistributable requirements
- Consistent environment across different systems
- Easy to start/stop
- Persistent data storage
- No need to manage installation files

## Using with Your Junk Tracker Application

Once Docker MongoDB is running:
1. Start your backend: `cd backend && npm start`
2. Start your frontend: `cd frontend && npm start`

The application will connect to MongoDB at localhost:27017 as configured.