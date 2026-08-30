const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // For local development, we'll use a local MongoDB instance
    // In production, you would use an environment variable for the connection string
    const conn = await mongoose.connect('mongodb://127.0.0.1:27017/junktracker', {
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