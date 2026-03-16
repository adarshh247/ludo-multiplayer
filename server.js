import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url'; // Needed to replace __dirname
import { Server } from 'socket.io';
import cors from 'cors';
/*
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
*/
const app = express();
app.use(cors());

// In ES Modules, __dirname is not available by default. 
// Use this code to recreate it:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);

// Configure Socket.io with CORS to allow your frontend port
const io = new Server(server, {
//const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    //origin: ["http://localhost:5173", "http://127.0.0.1:5173"], // Add your Vite/React dev port
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

console.log("Serving files from:", path.join(__dirname, 'dist'));

// Serve static files from the root or 'dist' folder
//app.use(express.static(path.resolve("./")));
app.use(express.static(path.join(__dirname, 'dist')));

app.get("/{*splat}", (req, res) => {
  console.log(`[HTTP] Root route accessed by: ${req.ip}`);
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const rooms = new Map();

io.on('connection', (socket) => {
  // 1. Log the initial connection
  console.log(`\n[Socket.io] New Connection established!`);
  console.log(`ID: ${socket.id}`);
  console.log(`Transport: ${socket.conn.transport.name}`); // Tells you if it's 'websocket' or 'polling'
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ user, roomCode }) => {
    const room = {
      code: roomCode,
      hostId: user.id,
      participants: [{
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isHost: true,
        isReady: true,
        socketId: socket.id
      }],
      gameState: null
    };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    io.to(roomCode).emit('room_updated', room);
    console.log(`Room created: ${roomCode} by ${user.name}`);
  });

  socket.on('join_room', ({ user, roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', 'Room not found. Check the host code.');
      return;
    }
    if (room.participants.length >= 4) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    const existingIndex = room.participants.findIndex(p => p.id === user.id);
    if (existingIndex === -1) {
        const participant = {
          id: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl,
          isHost: false,
          isReady: true,
          socketId: socket.id
        };
        room.participants.push(participant);
    } else {
        room.participants[existingIndex].socketId = socket.id;
    }
    
    socket.join(roomCode);
    io.to(roomCode).emit('room_updated', room);
    console.log(`${user.name} joined room: ${roomCode}`);
  });

  socket.on('start_game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (room && room.participants.length === 4) {
      io.to(roomCode).emit('game_started');
    } else if (room) {
      socket.emit('error', 'Exactly 4 players required to start.');
    }
  });

  socket.on('dice_rolled', ({ roomCode, value, playerIndex }) => {
    io.to(roomCode).emit('sync_dice', { value, playerIndex });
  });

  socket.on('move_pawn', ({ roomCode, pawnId, finalLocation, playerIndex }) => {
    io.to(roomCode).emit('sync_move', { pawnId, finalLocation, playerIndex });
  });

  socket.on('next_turn', ({ roomCode, nextIndex }) => {
    io.to(roomCode).emit('sync_turn', nextIndex);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    rooms.forEach((room, code) => {
      const index = room.participants.findIndex(p => p.socketId === socket.id);
      if (index !== -1) {
        room.participants.splice(index, 1);
        if (room.participants.length === 0) {
          rooms.delete(code);
        } else {
          if (index === 0 && room.participants.length > 0) {
            room.hostId = room.participants[0].id;
            room.participants[0].isHost = true;
          }
          io.to(code).emit('room_updated', room);
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
  console.log(`--- Server Status ---`);
  console.log(`✅ Real Backend running on port: ${PORT}`);
});