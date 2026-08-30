# Testing Instructions

To test the Junk Tracker application, follow these steps:

## Prerequisites
1. MongoDB must be installed and running locally on your machine
2. Node.js and npm must be installed

## Setup Steps

### 1. Backend Setup
```bash
cd backend
npm install
```

### 2. Start Backend Server
```bash
npm start
# or for development with auto-restart
npm run dev
```

The backend should start on port 5000.

### 3. Frontend Setup
```bash
cd frontend
npm install
```

### 4. Start Frontend Development Server
```bash
npm start
```

The frontend should start on port 3000 and open in your browser.

## Testing Functionality

1. **Data Entry Page**: 
   - Navigate to http://localhost:3000/entry
   - Fill out the form with item details (name, description, box info, location)
   - Click "Add Item" to submit

2. **Data Browsing**:
   - Navigate to http://localhost:3000/items or main page
   - View all items in a table format
   - See item details including name, description, box information, and location

3. **Search Functionality**:
   - Use the search bar on the items page
   - Search by item name, description, box number, box description, or location

## API Testing (Optional)

You can test the backend API directly using curl commands:

```bash
# Get all items
curl http://localhost:5000/api/items

# Create a new item
curl -X POST http://localhost:5000/api/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hammer",
    "description": "Claw hammer",
    "boxNumber": "B123",
    "boxDescription": "Tools box",
    "location": "Garage Shelf A"
  }'

# Search items
curl http://localhost:5000/api/items/search/hammer
```

## Expected Results

- Items should be stored in MongoDB database
- All CRUD operations should work properly
- Search functionality should return matching results
- Frontend should display data correctly