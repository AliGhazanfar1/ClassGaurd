const crypto = require('crypto');
const QRCode = require('qrcode');

// Stateful memory to securely store tiny QR strings without cryptographic bloat
const activeTokens = new Map(); 

exports.generateDynamicQR = async (sessionId) => {
  // Generate a tiny 10-character hex code and append the sessionId
  const secret = crypto.randomBytes(5).toString('hex'); 
  const token = `${sessionId}:${secret}`; 
  
  // Save it mathematically in short-term memory (keeping the previous one briefly valid for cross-over scans)
  const sessionTokens = activeTokens.get(sessionId) || { current: null, previous: null };
  sessionTokens.previous = sessionTokens.current;
  sessionTokens.current = token;
  activeTokens.set(sessionId, sessionTokens);

  try {
    // Generate the incredibly crisp, blocky QR Code
    const qrDataUrl = await QRCode.toDataURL(token, {
      margin: 2,
      width: 400,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return { token, qrDataUrl };
  } catch (err) {
    console.error("QR Generation Error:", err);
    return null;
  }
};

exports.validateToken = (sessionId, token) => {
    const sessionTokens = activeTokens.get(sessionId);
    if (!sessionTokens) return false;
    return sessionTokens.current === token || sessionTokens.previous === token;
};
