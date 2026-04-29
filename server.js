require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { sequelize } = require('./src/models');

const apiRouter = require('./src/routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Pass IO to routes implicitly via app
app.set('io', io);

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());

// Limit requests from same API
const limiter = rateLimit({
  max: 200,
  windowMs: 15 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (Frontend UI)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRouter);

// Start Server and setup DB
const PORT = process.env.PORT || 3000;

// Initialize Socket.io globally
require('./src/sockets/socketHandler')(io);

sequelize.sync({ force: false }).then(() => {
  console.log('Database synced');
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => console.log('Database Error:', err));
