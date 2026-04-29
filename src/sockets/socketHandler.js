const qrService = require('../services/qrService');
const { Session } = require('../models');

// Map to store active intervals per session so they can be cleared
const activeIntervals = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`New socket connection: ${socket.id}`);

    // Admin joins their session room to receive QR codes
    socket.on('join-session', async (sessionId) => {
      const roomName = `session_${sessionId}`;
      socket.join(roomName);
      console.log(`Socket ${socket.id} joined room ${roomName}`);

      // If there's already an active interval for this session, clear it to prevent duplicates
      if (activeIntervals.has(sessionId)) {
        clearInterval(activeIntervals.get(sessionId));
      }

      // Generate and emit immediately upon joining
      const initialQr = await qrService.generateDynamicQR(sessionId);
      if (initialQr) {
        io.to(roomName).emit('new-qr', { qrDataUrl: initialQr.qrDataUrl, token: initialQr.token });
      }

      // Start an interval to regenerate QR every 10 seconds
      const intervalId = setInterval(async () => {
        try {
          // Double check if session is still active in DB
          const session = await Session.findByPk(sessionId);
          if (!session || !session.isActive) {
            clearInterval(intervalId);
            activeIntervals.delete(sessionId);
            io.to(roomName).emit('session-ended');
            return;
          }

          const qrData = await qrService.generateDynamicQR(sessionId);
          if (qrData) {
            io.to(roomName).emit('new-qr', { qrDataUrl: qrData.qrDataUrl, token: qrData.token });
          }
        } catch (err) {
          console.error(err);
        }
      }, 4000); // 4 seconds

      activeIntervals.set(sessionId, intervalId);
    });

    socket.on('leave-session', (sessionId) => {
      const roomName = `session_${sessionId}`;
      socket.leave(roomName);
      if (activeIntervals.has(sessionId)) {
        clearInterval(activeIntervals.get(sessionId));
        activeIntervals.delete(sessionId);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
