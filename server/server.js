require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const initializeSocketHandlers = require('./socket/chatHandler');

// Import routes
const authRoutes = require('./routes/auth');
const friendsRoutes = require('./routes/friends');
const chatRoutes = require('./routes/chat');
const profileRoutes = require('./routes/profile');
const notificationRoutes = require('./routes/notifications');
const groupRoutes = require('./routes/groups');
const storyRoutes = require('./routes/stories');
const activityRoutes = require('./routes/activities');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Connect to MongoDB
connectDB();

// Trigger restart
// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'WhoRU server is running!',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/group-messages', require('./routes/groupMessages'));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Make Socket.io accessible to routes
app.set('io', io);

// Initialize Socket.io handlers
initializeSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🚀 WhoRU Server is running!        ║
║   📡 Port: ${PORT}                       ║
║   🌐 Environment: ${process.env.NODE_ENV || 'development'}        ║
║   ⚡ Socket.io: Enabled               ║
╚═══════════════════════════════════════╝
  `);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
