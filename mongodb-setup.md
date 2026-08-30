# MongoDB Installation and Setup Guide

To run the Junk Tracker application, you'll need to have MongoDB installed and running on your system. Here are instructions for different operating systems:

## Option 1: Install MongoDB Community Server (Recommended for Development)

### Windows:
1. Download MongoDB Community Server from: https://www.mongodb.com/try/download/community
2. Run the installer as Administrator
3. Choose "Custom Installation" 
4. Select "MongoDB Community Server" and "MongoDB Compass" components
5. Complete the installation wizard
6. Start MongoDB service:
   - Open Services (services.msc)
   - Find "MongoDB" service
   - Right-click and select "Start"

### macOS:
Using Homebrew:
```bash
brew tap mongodb/brew
brew install mongodb-community
```

Using direct download:
1. Download from: https://www.mongodb.com/try/download/community
2. Follow the installation instructions

### Linux (Ubuntu/Debian):
```bash
# Import the MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Create a list file for MongoDB
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -sc)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Reload local package database
sudo apt-get update

# Install MongoDB
sudo apt-get install -y mongodb-org

# Start MongoDB service
sudo systemctl start mongod
sudo systemctl enable mongod
```

## Option 2: Use MongoDB Atlas (Cloud Solution)

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up for a free account
3. Create a new cluster
4. Configure network access (allow all IPs for development)
5. Create a database user
6. Get your connection string

## Verify Installation

After installation, verify MongoDB is running:

### Windows:
```cmd
mongod --version
```

### macOS/Linux:
```bash
mongod --version
```

### Test Connection:
```bash
mongo
```
This should open the MongoDB shell.

## Starting MongoDB Service

### Windows:
- Open Services (services.msc)
- Find "MongoDB" service
- Right-click and select "Start"

### macOS:
```bash
brew services start mongodb-community
```

### Linux:
```bash
sudo systemctl start mongod
```

## Using MongoDB Atlas (Cloud)

If you choose to use MongoDB Atlas instead of local installation:

1. Update the connection string in `backend/config/db.js`:
   ```javascript
   const conn = await mongoose.connect('mongodb+srv://<username>:<password>@cluster.mongodb.net/junktracker', {
     useNewUrlParser: true,
     useUnifiedTopology: true,
   });
   ```

2. Replace `<username>` and `<password>` with your Atlas credentials

## Default MongoDB Configuration

The Junk Tracker application is configured to connect to:
- Host: 127.0.0.1 (localhost)
- Port: 27017
- Database name: junktracker

If you're running MongoDB locally, no changes should be needed to the connection string in the code.