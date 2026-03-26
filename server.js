const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'src')));

// Store connected clients
const clients = new Map(); // socketId -> { userId, socket }

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Register user
  socket.on('register', (userId) => {
    clients.set(socket.id, { userId, socket });
    console.log(`User registered: ${userId}`);
    
    // Send list of connected users
    const users = [];
    clients.forEach((client, id) => {
      if (id !== socket.id) {
        users.push(client.userId);
      }
    });
    socket.emit('users_list', users);
    
    // Broadcast new user to all others
    socket.broadcast.emit('user_connected', userId);
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    const { target, offer } = data;
    const targetClient = findClientByUserId(target);
    if (targetClient) {
      targetClient.socket.emit('offer', {
        offer,
        from: findUserIdBySocket(socket.id)
      });
    }
  });

  socket.on('answer', (data) => {
    const { target, answer } = data;
    const targetClient = findClientByUserId(target);
    if (targetClient) {
      targetClient.socket.emit('answer', {
        answer,
        from: findUserIdBySocket(socket.id)
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { target, candidate } = data;
    const targetClient = findClientByUserId(target);
    if (targetClient) {
      targetClient.socket.emit('ice-candidate', {
        candidate,
        from: findUserIdBySocket(socket.id)
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const userId = findUserIdBySocket(socket.id);
    if (userId) {
      clients.delete(socket.id);
      socket.broadcast.emit('user_disconnected', userId);
      console.log(`User disconnected: ${userId}`);
    }
  });

  // Helper functions
  function findClientByUserId(userId) {
    for (let [id, client] of clients) {
      if (client.userId === userId) {
        return client;
      }
    }
    return null;
  }

  function findUserIdBySocket(socketId) {
    const client = clients.get(socketId);
    return client ? client.userId : null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});