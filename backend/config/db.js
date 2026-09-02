const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Connection string is configurable via MONGODB_URI so the same code works
    // with a local mongod (default), Docker Compose (mongodb://mongodb:27017/...),
    // or any external MongoDB deployment.
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/junktracker';
    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;