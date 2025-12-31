const mongoose = require('mongoose');

/**
 * MongoDB Database Connection
 * Connects to MongoDB using Mongoose with optimized settings
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1); // Exit with failure
  }
};

module.exports = connectDB;
