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
- **Frontend**: React.js with modern JavaScript/ES6+
- **Backend**: Node.js with Express.js
- **Database**: MongoDB (local development)
- **Deployment**: Local development environment

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