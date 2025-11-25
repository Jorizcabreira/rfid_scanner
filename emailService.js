const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Warn if SendGrid key is missing so logs show the problem immediately
if (!process.env.SENDGRID_API_KEY) {
  console.warn('⚠️ SENDGRID_API_KEY is not set in environment. Emails will fail until this is configured.');
}

// Debug endpoint to check environment and service status (safe: does NOT return secrets)
app.get('/api/debug', (req, res) => {
  res.json({
    success: true,
    env: {
      SENDGRID_SET: !!process.env.SENDGRID_API_KEY,
      FROM_EMAIL_SET: !!process.env.FROM_EMAIL,
      NODE_ENV: process.env.NODE_ENV || 'undefined'
    },
    endpoints: ['/api/send-otp', '/api/verify-otp', '/api/health']
  });
});

// Echo endpoint to help debug incoming requests (does not send email)
app.post('/api/debug-echo', (req, res) => {
  console.log('📥 /api/debug-echo received body:', req.body);
  res.json({ success: true, received: req.body });
});

// Validate SendGrid API key by making a minimal authenticated request
app.get('/api/sendgrid-validate', async (req, res) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ success: false, message: 'SENDGRID_API_KEY not configured' });
    }

    // Use the SendGrid user/account endpoint to verify the key without exposing response body
    const fetchOptions = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const resp = await fetch('https://api.sendgrid.com/v3/user/account', fetchOptions);
    const status = resp.status;

    if (status >= 200 && status < 300) {
      return res.json({ success: true, status, message: 'SendGrid API key appears valid' });
    }

    // Do not return SendGrid response body (may contain sensitive info). Give concise message.
    return res.status(status).json({ success: false, status, message: `SendGrid responded with status ${status}` });
  } catch (error) {
    console.error('❌ Error validating SendGrid API key:', error);
    return res.status(500).json({ success: false, message: 'Error validating SendGrid API key' });
  }
});

// OTP Storage (in-memory)
const otpStorage = {};

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP Email
async function sendOTPEmail(email, parentUid, parentName = 'Parent') {
  console.log(`📧 Attempting to send OTP to ${email}...`);
  
  try {
    const otp = generateOTP();
    
    // Store OTP with expiration (5 minutes)
    otpStorage[email] = {
      otp: otp,
      expires: Date.now() + 5 * 60 * 1000,
      parentUid: parentUid,
      verified: false
    };

    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL || 'noreply@rfid-school.com',
        name: 'RFID Attendance System'
      },
      subject: '🔐 Your Login OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #1999e8 0%, #1488d0 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🔐 Login Verification</h1>
                      <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">RFID Attendance System</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #333333; margin: 0 0 15px 0; font-size: 20px;">Hello, ${parentName}!</h2>
                      <p style="color: #666666; margin: 0 0 25px 0; font-size: 15px; line-height: 1.6;">
                        You requested to login to your parent account. Please use the verification code below to complete your login:
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center" style="background-color: #f8f9fa; border-radius: 8px; padding: 25px;">
                            <div style="font-size: 14px; color: #666666; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Your OTP Code</div>
                            <div style="font-size: 42px; font-weight: bold; color: #1999e8; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</div>
                          </td>
                        </tr>
                      </table>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                        <tr>
                          <td style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                            <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;">
                              ⏱️ <strong>Important:</strong> This code will expire in <strong>5 minutes</strong>. Do not share this code with anyone.
                            </p>
                          </td>
                        </tr>
                      </table>
                      <p style="color: #666666; margin: 25px 0 0 0; font-size: 14px; line-height: 1.6;">
                        If you didn't request this code, please ignore this email and ensure your account is secure.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef;">
                      <p style="color: #999999; margin: 0; font-size: 12px; line-height: 1.6;">
                        This is an automated message from RFID Attendance System.<br>
                        Please do not reply to this email.
                      </p>
                      <p style="color: #999999; margin: 10px 0 0 0; font-size: 11px;">
                        © ${new Date().getFullYear()} RFID Attendance System. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `
RFID Attendance System - Login Verification

Hello, ${parentName}!

Your OTP verification code is: ${otp}

This code will expire in 5 minutes.

If you didn't request this code, please ignore this email.

© ${new Date().getFullYear()} RFID Attendance System
      `
    };
    // Attach optional reply-to if configured
    if (process.env.REPLY_TO_EMAIL) {
      msg.reply_to = { email: process.env.REPLY_TO_EMAIL };
    }

    const sgResponse = await sgMail.send(msg);

    // sgMail.send returns an array for legacy compatibility; take first item
    const firstResp = Array.isArray(sgResponse) ? sgResponse[0] : sgResponse;

    // Log concise SendGrid response info (status and headers) to help track delivery
    try {
      const statusCode = firstResp && (firstResp.statusCode || firstResp.status);
      const headers = firstResp && firstResp.headers ? firstResp.headers : {};
      console.log(`✅ OTP sent successfully to ${email} (status: ${statusCode})`);
      // Log message id if available in headers (don't log API keys)
      if (headers['x-message-id'] || headers['x-msg-id'] || headers['x-sendgrid-request-id'] || headers['x-request-id']) {
        console.log('   SendGrid headers:', {
          'x-message-id': headers['x-message-id'] || headers['x-msg-id'],
          'x-request-id': headers['x-sendgrid-request-id'] || headers['x-request-id']
        });
      }
    } catch (err) {
      console.log('✅ OTP sent (response parsing failed):', err);
    }
    
    return {
      success: true,
      message: 'OTP sent successfully'
    };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    let errorMsg = '';
    if (typeof error.message === 'string') {
      errorMsg = error.message;
    } else if (error.response?.body) {
      errorMsg = JSON.stringify(error.response.body);
    } else {
      errorMsg = JSON.stringify(error);
    }
    return {
      success: false,
      message: errorMsg
    };
  }
}

// Verify OTP
function verifyOTP(email, otp) {
  try {
    const storedOTP = otpStorage[email];
    
    if (!storedOTP) {
      return { success: false, message: 'No OTP found. Please request a new one.' };
    }

    // Check if OTP has expired
    if (Date.now() > storedOTP.expires) {
      delete otpStorage[email];
      return { success: false, message: 'OTP has expired. Please request a new one.' };
    }

    // Check if OTP matches
    if (storedOTP.otp !== otp) {
      return { success: false, message: 'Invalid OTP code. Please try again.' };
    }

    // Mark OTP as verified
    storedOTP.verified = true;
    
    // Delete OTP after 1 minute even if verified
    setTimeout(() => {
      delete otpStorage[email];
    }, 60000);

    return { success: true, message: 'OTP verified successfully!' };
  } catch (error) {
    console.error('❌ Error verifying OTP:', error);
    return { success: false, message: 'Error verifying OTP. Please try again.' };
  }
}

// API Routes

// Send OTP endpoint
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email, parentUid, parentName } = req.body;

    if (!email || !parentUid) {
      return res.status(400).json({
        success: false,
        message: 'Email and parent UID are required'
      });
    }

    console.log(`📨 Received OTP request for: ${email}, UID: ${parentUid}`);

    const result = await sendOTPEmail(email, parentUid, parentName);

    if (result.success) {
      res.json({
        success: true,
        message: 'OTP sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('❌ Error in send-otp endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Verify OTP endpoint
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    console.log(`🔍 Verifying OTP for: ${email}`);

    const result = verifyOTP(email, otp);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('❌ Error in verify-otp endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'OTP Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RFID OTP Email Server',
    endpoints: {
      'POST /api/send-otp': 'Send OTP to email',
      'POST /api/verify-otp': 'Verify OTP code',
      'GET /api/health': 'Health check',
      'GET /api/debug': 'Environment debug (safe)',
      'GET /api/sendgrid-validate': 'Validate SendGrid API key (no secret exposure)'
    }
  });
});

// Start server
// Global error handler to ensure all errors return JSON
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    success: false,
    message: typeof err === 'string' ? err : (err.message || 'Internal server error')
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 OTP Email Server Started`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`✅ Ready to send OTP emails`);
  console.log(`\nEndpoints:`);
  console.log(`  POST http://localhost:${PORT}/api/send-otp`);
  console.log(`  POST http://localhost:${PORT}/api/verify-otp`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  GET  http://localhost:${PORT}/api/debug`);
  console.log(`  GET  http://localhost:${PORT}/api/sendgrid-validate`);
});

module.exports = app;