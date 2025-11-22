const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  // Check for token in auth object first, then cookies
  const token = socket.handshake.auth.token || 
                (socket.handshake.headers.cookie && 
                 socket.handshake.headers.cookie.split(';').find(c => c.trim().startsWith('authToken='))?.split('=')[1]);
  
  if (!token) {
    // Allow anonymous connections
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.user = decoded;
    next();
  } catch (err) {
    // Allow connection even if token is invalid (anonymous)
    next();
  }
});

// Store active rooms (movements being viewed)
const activeRooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}${socket.userId ? ` (User: ${socket.userId})` : ' (Anonymous)'}`);

  // Join movement room when viewing a movement
  socket.on('join:movement', (movementId) => {
    socket.join(`movement:${movementId}`);
    activeRooms.set(`movement:${movementId}`, (activeRooms.get(`movement:${movementId}`) || 0) + 1);
    socket.to(`movement:${movementId}`).emit('user:joined', { 
      userId: socket.userId,
      count: activeRooms.get(`movement:${movementId}`)
    });
  });

  // Leave movement room
  socket.on('leave:movement', (movementId) => {
    socket.leave(`movement:${movementId}`);
    const count = Math.max(0, (activeRooms.get(`movement:${movementId}`) || 1) - 1);
    activeRooms.set(`movement:${movementId}`, count);
    socket.to(`movement:${movementId}`).emit('user:left', { 
      userId: socket.userId,
      count
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Export io for use in routes
app.set('io', io);

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: { message: 'Too many authentication attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: { message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow Socket.IO connections
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const movementRoutes = require('./routes/movements');
const ideaRoutes = require('./routes/ideas');
const donationRoutes = require('./routes/donations');
const searchRoutes = require('./routes/search');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/ideas', ideaRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/search', searchRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

server.listen(PORT, () => {
  console.log(`🚀 Plot API running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket server ready`);
});

module.exports = { app, server, io };
