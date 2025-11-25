// otpServer.js - OTP Email Server
const express = require('express');
const cors = require('cors');
const { setupOTPRoutes } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: '🔐 OTP Email Service is active',
    timestamp: new Date().toISOString()
  });
});

// Setup OTP routes
setupOTPRoutes(app);

// Start server
app.listen(PORT, () => {
  console.log('🚀 OTP Email Server Started');
  console.log(`📡 Server running on port ${PORT}`);
  console.log('✅ Ready to send OTP emails');
  console.log('\nEndpoints:');
  console.log(`  POST http://localhost:${PORT}/api/send-otp`);
  console.log(`  POST http://localhost:${PORT}/api/verify-otp`);
});
