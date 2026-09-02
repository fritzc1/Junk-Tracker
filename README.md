# Junk Tracker - Physical Item Storage Management

A web application to track miscellaneous physical items in storage with a database backend.

## Features
- Data entry for physical items with descriptions
- Box tracking (optional box number/descriptor)
- Location tracking for items/boxes
- Data browsing page
- Basic search functionality
- Free-form data entry

## Technology Stack
- **Frontend**: React 18 + Vite + MUI
- **Backend**: Node.js with Express.js
- **Database**: MongoDB (local, Docker, or any external instance via `MONGODB_URI`)
- **Deployment**: local start scripts, release archives, or Docker Compose

## Project Structure
```
junk-tracker/
├── backend/
│   ├── models/          # Database schemas
│   ├── routes/          # API endpoints
│   ├── controllers/     # Business logic
│   ├── config/          # Configuration files
│   └── server.js        # Main server file
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API service calls
│   │   └── App.js       # Main application component
│   └── package.json
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- MongoDB installed locally or access to MongoDB Atlas

### MongoDB Setup
For local development without system-level installation, you can:
1. Download MongoDB Community Server binary from mongodb.com
2. Extract to a local directory (e.g., `C:\mongodb` on Windows)
3. Create a data directory: `mkdir C:\data\db`
4. Run MongoDB with: `mongod --dbpath C:\data\db`

Alternatively, use Docker:
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

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the backend server:
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the frontend development server:
   ```bash
   npm start
   ```

## Quick Start

One script installs everything (MongoDB into `./MongoDB/`, npm dependencies) and starts the app in development mode:

```bash
# Windows
Install.cmd && Start.cmd

# Mac/Linux
chmod +x Install.sh Start.sh && ./Install.sh && ./Start.sh
```

Development URLs: frontend http://localhost:3000 (Vite, proxies `/api`), backend API http://localhost:5000.

## Production Build

Build the React frontend for production into `frontend/dist/`:

```bash
scripts\build.cmd        # Windows
./scripts/build.sh       # Mac/Linux
```

Then run everything as a single process (backend serves the built UI):

```bash
Start.ps1 --production   # Windows  → http://localhost:5000
./Start.sh --production  # Mac/Linux → http://localhost:5000
```

In production mode the Express backend serves `frontend/dist/` and falls back to `index.html` for client-side routes; no Vite process is needed. The MongoDB connection string can be overridden with the `MONGODB_URI` environment variable (defaults to `mongodb://127.0.0.1:27017/junktracker`).

## Release Artifacts

Create a distributable release package + archive (cross-platform, no extra tools required):

```bash
scripts\release-build.cmd 1.0.0            # Windows
./scripts/release-build.sh 1.0.0           # Mac/Linux
scripts\release-build.cmd 2.0.0 --publish  # also create a GitHub release (needs `gh` CLI)
```

The pipeline: generates/updates `CHANGELOG.md` from git history → production build → stages `release/Junk-Tracker-{version}/` (backend without node_modules, pre-built frontend only, start/install scripts, docs) → writes a SHA256 manifest (`release-manifest.json`) → creates the archive:

- Windows: `release/Junk-Tracker-{version}.zip`
- Mac/Linux: `release/Junk-Tracker-{version}.tar.gz`

The archive is universal — it contains no platform-specific binaries. On the target machine, extract and run `Install.cmd`/`Install.sh`, which downloads MongoDB for that OS into `./MongoDB/` and installs backend dependencies; then run `Start.* --production`. The start scripts auto-detect pre-built releases (no `frontend/package.json`) and skip the build step.

## Docker Compose

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop) (or any Docker daemon with Compose).

**Production** — one image, one process: API + pre-built UI on http://localhost:5000:

```bash
docker compose --profile production up -d --build
```

The multi-stage `backend/Dockerfile` builds the frontend in stage 1 and runs only production dependencies in stage 2. Data persists in `./mongo-data/`.

**Development** — hot-reload backend (nodemon) on :5000 + Vite dev server on :3000:

```bash
docker compose --profile dev up -d
```

**MongoDB only** — run the app natively against a containerized database:

```bash
docker compose up -d mongodb
```

Stop everything with `docker compose down` (add `-v` to also remove the data volume).

### Deploying to a Docker server (headless Linux)

No Node.js or MongoDB is needed on the server — only Docker. The app image is built from source by Compose (`--build`).

```bash
# 1. Install Docker Engine + Compose plugin (one-liner for Ubuntu/Debian):
curl -fsSL https://get.docker.com | sh

# 2. Get the code:
git clone <your-repo-url> junk-tracker && cd junk-tracker

# 3. Build and start (mongo + app, UI served on port 5000):
docker compose --profile production up -d --build
```

Then open `http://<server-ip>:5000` in a browser. Make sure port 5000 is allowed through the server's firewall/security group if it isn't reachable. Data persists in `./mongo-data/`; stop with `docker compose down`. To update later, pull the new code and re-run step 3 — Docker only rebuilds the layers that changed.

## API Endpoints

- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get item by ID
- `POST /api/items` - Create new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item
- `GET /api/items/search/:query` - Search items

## Database Schema

The application uses MongoDB with a simple schema for items:
- `name`: String (required)
- `description`: String (optional)
- `boxNumber`: String (optional)
- `boxDescription`: String (optional)
- `location`: String (required)
- `createdAt`: Date
- `updatedAt`: Date

## Usage

1. Start both backend and frontend servers
2. Navigate to the frontend application in your browser (usually http://localhost:3000)
3. Use the "Add New Item" button to enter items
4. View all items on the main page
5. Search items using the search bar at the top of the items list

## Testing

The basic functionality has been implemented and tested. For full testing, you would typically add:
- Unit tests for backend controllers
- Integration tests for API endpoints
- End-to-end tests for frontend components