const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const emailLogPath = path.join(__dirname, 'sent_emails.json');

// Ensure the log file exists and is empty or initialized as a JSON array
if (!fs.existsSync(emailLogPath)) {
  fs.writeFileSync(emailLogPath, JSON.stringify([]));
}

// Global variable for Ethereal SMTP transporter
let transporter = null;

// Initialize Ethereal account for testing
async function initTransporter() {
  try {
    // We create a test account on Ethereal
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log('Mock Nodemailer transporter initialized with Ethereal account:', testAccount.user);
  } catch (error) {
    console.warn('Could not initialize Ethereal SMTP transporter, falling back to local simulation only:', error.message);
  }
}

// Initialize on startup
initTransporter();

async function sendInvoiceEmail({ to, subject, html, attachments = [] }) {
  const emailRecord = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    to,
    subject,
    html,
    attachments: attachments.map(a => ({ filename: a.filename, path: a.path ? 'Attached Document' : 'Inline Content' }))
  };

  // 1. Log the email to our local simulator JSON file
  try {
    const data = fs.readFileSync(emailLogPath, 'utf8');
    const logs = JSON.parse(data || '[]');
    logs.unshift(emailRecord); // Add to the top
    fs.writeFileSync(emailLogPath, JSON.stringify(logs, null, 2));
    console.log(`[Email Simulator] Email logged successfully to ${emailLogPath}`);
  } catch (err) {
    console.error('Error logging email to simulator:', err);
  }

  // 2. Actually try to send via Ethereal SMTP if available
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: '"VendorBridge ERP" <no-reply@vendorbridge.com>',
        to,
        subject,
        html,
        attachments
      });
      console.log('Email sent successfully via SMTP:', nodemailer.getTestMessageUrl(info));
      return {
        success: true,
        previewUrl: nodemailer.getTestMessageUrl(info),
        localRecord: emailRecord
      };
    } catch (error) {
      console.error('SMTP Delivery failed, email logged to simulator only:', error);
    }
  }

  return {
    success: true,
    previewUrl: null,
    localRecord: emailRecord
  };
}

module.exports = {
  sendInvoiceEmail,
  emailLogPath
};
