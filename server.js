const express = require('express');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbHelper = require('./db');
const mailer = require('./mailer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Setup Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'vendorbridge-erp-secret-key-12345',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Serve client-side static assets
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB and Seed Mock Data
dbHelper.initDb().catch(err => {
  console.error('Database initialization failed:', err);
});

// Socket.io connection logging
io.on('connection', (socket) => {
  console.log('Socket.io client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Socket.io client disconnected:', socket.id);
  });
});

// Helper: Require Login Middleware
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).send('Unauthorized: Login required');
  }
  next();
}

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name, role, vendor_id } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).send('All fields are required');
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    await dbHelper.runQuery(`
      INSERT INTO users (email, password_hash, name, role, vendor_id)
      VALUES (?, ?, ?, ?, ?)
    `, [email, passwordHash, name, role, role === 'Vendor' ? vendor_id : null]);

    const user = await dbHelper.getQuery(`SELECT id, email, name, role, vendor_id FROM users WHERE email = ?`, [email]);
    
    // Set Session
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    req.session.vendorId = user.vendor_id;

    // Log Activity
    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'User Registration', ?)
    `, [user.id, `User ${name} registered with role: ${role}.`]);

    res.json(user);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).send('Email already registered');
    }
    console.error(err);
    res.status(500).send('Database error during signup');
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send('Email and password required');
  }

  try {
    const user = await dbHelper.getQuery(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).send('Invalid email or password');
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    req.session.vendorId = user.vendor_id;

    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'User Login', ?)
    `, [user.id, `User ${user.name} logged into the ERP.`]);

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, vendor_id: user.vendor_id });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error during login');
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.session.userId) {
    dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'User Logout', ?)
    `, [req.session.userId, `User ${req.session.userName} logged out.`]).catch(() => {});
  }
  req.session.destroy(() => {
    res.send('Logged out');
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('Not logged in');
  }
  res.json({
    id: req.session.userId,
    role: req.session.userRole,
    name: req.session.userName,
    vendor_id: req.session.vendorId
  });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  console.log(`[Forgot Password Reset Triggered] sending to: ${email}`);
  mailer.sendInvoiceEmail({
    to: email,
    subject: 'VendorBridge ERP - Password Reset Link',
    html: `
      <h2>Reset Your ERP Password</h2>
      <p>Click the link below to configure a new password for VendorBridge:</p>
      <a href="#" style="background:#504bc0;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Reset Password</a>
    `
  });
  res.send('Password reset instructions processed');
});

// Demo helper: allows switching roles on the fly without entering passwords
app.post('/api/auth/switch-role', requireLogin, async (req, res) => {
  const { role } = req.body;
  if (!role) return res.status(400).send('Role required');

  req.session.userRole = role;
  
  // If switching to Vendor, map to the first vendor in database for testing
  if (role === 'Vendor') {
    const firstVendor = await dbHelper.getQuery(`SELECT id FROM vendors LIMIT 1`);
    req.session.vendorId = firstVendor ? firstVendor.id : null;
  } else {
    req.session.vendorId = null;
  }

  await dbHelper.runQuery(`
    INSERT INTO activity_logs (user_id, action, details)
    VALUES (?, 'Role Swap', ?)
  `, [req.session.userId, `User switched session workspace view to role: ${role}.`]);

  res.json({ id: req.session.userId, role: req.session.userRole, name: req.session.userName, vendor_id: req.session.vendorId });
});

// ==========================================
// 2. DASHBOARD ENDPOINTS
// ==========================================

app.get('/api/dashboard/stats', requireLogin, async (req, res) => {
  try {
    const pendingApprovalsRow = await dbHelper.getQuery(`SELECT COUNT(*) as count FROM quotations WHERE status = 'Under Review'`);
    const activeRfqsRow = await dbHelper.getQuery(`SELECT COUNT(*) as count FROM rfqs WHERE status = 'Active'`);
    
    // Spend from approved purchase orders
    const spendRow = await dbHelper.getQuery(`SELECT SUM(total_amount) as total FROM purchase_orders WHERE status != 'Closed'`);
    const newQuotationsRow = await dbHelper.getQuery(`SELECT COUNT(*) as count FROM quotations WHERE status = 'Submitted'`);

    res.json({
      pendingApprovals: pendingApprovalsRow.count,
      activeRfqs: activeRfqsRow.count,
      totalSpend: spendRow.total || 0,
      newQuotations: newQuotationsRow.count
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching dashboard stats');
  }
});

// ==========================================
// 3. VENDOR ENDPOINTS
// ==========================================

app.get('/api/vendors', async (req, res) => {
  try {
    const rows = await dbHelper.allQuery(`SELECT * FROM vendors ORDER BY rating DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).send('Error fetching vendors');
  }
});

app.post('/api/vendors', async (req, res) => {
  const { name, category, gst_number, contact_email, contact_phone, address } = req.body;
  if (!name || !category || !gst_number || !contact_email || !contact_phone || !address) {
    return res.status(400).send('Missing vendor registration details');
  }

  try {
    await dbHelper.runQuery(`
      INSERT INTO vendors (name, category, gst_number, contact_email, contact_phone, address, status, rating)
      VALUES (?, ?, ?, ?, ?, ?, 'Approved', 5.0)
    `, [name, category, gst_number, contact_email, contact_phone, address]);

    const row = await dbHelper.getQuery(`SELECT last_insert_rowid() as id`);
    
    // Create activity log
    if (req.session.userId) {
      await dbHelper.runQuery(`
        INSERT INTO activity_logs (user_id, action, details)
        VALUES (?, 'Vendor Registered', ?)
      `, [req.session.userId, `Registered new supplier: ${name} (${category})`]);
    }

    res.json({ id: row.id, name, status: 'Approved' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).send('Vendor contact email already registered');
    }
    console.error(err);
    res.status(500).send('Error saving vendor record');
  }
});

// ==========================================
// 4. RFQ ENDPOINTS
// ==========================================

app.get('/api/rfqs', requireLogin, async (req, res) => {
  try {
    let rows;
    if (req.session.userRole === 'Vendor') {
      // Vendors only see RFQs they are assigned to
      rows = await dbHelper.allQuery(`
        SELECT r.* FROM rfqs r
        JOIN rfq_assignments a ON r.id = a.rfq_id
        WHERE a.vendor_id = ?
        ORDER BY r.id DESC
      `, [req.session.vendorId]);
    } else {
      rows = await dbHelper.allQuery(`SELECT * FROM rfqs ORDER BY id DESC`);
    }
    res.json(rows);
  } catch (err) {
    res.status(500).send('Error loading RFQs');
  }
});

app.post('/api/rfqs', requireLogin, async (req, res) => {
  const { title, description, quantity, deadline, vendorIds } = req.body;
  if (!title || !description || !quantity || !deadline || !vendorIds || !Array.from(vendorIds).length) {
    return res.status(400).send('All fields and at least one vendor assignment is required.');
  }

  try {
    await dbHelper.runQuery(`
      INSERT INTO rfqs (title, description, quantity, deadline, status, created_by)
      VALUES (?, ?, ?, ?, 'Active', ?)
    `, [title, description, quantity, deadline, req.session.userId]);

    const rfqRow = await dbHelper.getQuery(`SELECT last_insert_rowid() as id`);
    const rfqId = rfqRow.id;

    // Add Vendor Assignments
    for (const vId of vendorIds) {
      await dbHelper.runQuery(`
        INSERT INTO rfq_assignments (rfq_id, vendor_id)
        VALUES (?, ?)
      `, [rfqId, vId]);
    }

    // Activity Log
    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'RFQ Created', ?)
    `, [req.session.userId, `Created RFQ #${rfqId}: "${title}" with ${vendorIds.length} assigned vendors.`]);

    // Broadcast Socket.io event
    io.emit('rfq_created', {
      id: rfqId,
      title,
      created_by_name: req.session.userName
    });

    res.json({ id: rfqId, title, status: 'Active' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating RFQ');
  }
});

// ==========================================
// 5. QUOTATION ENDPOINTS (VENDOR ONLY INSERTS ITEMS)
// ==========================================

app.post('/api/quotations', requireLogin, async (req, res) => {
  const { rfq_id, delivery_timeline, notes, items } = req.body;
  
  if (req.session.userRole !== 'Vendor' || !req.session.vendorId) {
    return res.status(403).send('Only registered vendor accounts can submit quotations and add items.');
  }

  if (!rfq_id || !delivery_timeline || !items || !items.length) {
    return res.status(400).send('RFQ ID, delivery timeline, and at least one item are required.');
  }

  try {
    // Check if vendor is assigned to this RFQ
    const assignment = await dbHelper.getQuery(`
      SELECT 1 FROM rfq_assignments WHERE rfq_id = ? AND vendor_id = ?
    `, [rfq_id, req.session.vendorId]);

    if (!assignment) {
      return res.status(403).send('Your company is not assigned/invited to bid on this RFQ.');
    }

    // Calculate quotation total price as the sum of all item costs (qty * unit price)
    const calculatedTotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);

    // 1. Save main quotation
    await dbHelper.runQuery(`
      INSERT INTO quotations (rfq_id, vendor_id, price, delivery_timeline, notes, status)
      VALUES (?, ?, ?, ?, ?, 'Submitted')
    `, [rfq_id, req.session.vendorId, calculatedTotal, delivery_timeline, notes]);

    const qRow = await dbHelper.getQuery(`SELECT last_insert_rowid() as id`);
    const quotationId = qRow.id;

    // 2. Save items (Only the vendor can add items to database)
    for (const item of items) {
      await dbHelper.runQuery(`
        INSERT INTO quotation_items (quotation_id, description, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `, [quotationId, item.description, parseInt(item.quantity), parseFloat(item.unit_price)]);
    }

    // Activity Log
    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'Quotation Submitted', ?)
    `, [req.session.userId, `Vendor submitted Quote #${quotationId} with ${items.length} items totaling $${calculatedTotal}.`]);

    // Broadcast
    io.emit('quotation_submitted', {
      id: quotationId,
      rfq_id,
      vendor_name: req.session.userName,
      price: calculatedTotal
    });

    res.json({ id: quotationId, rfq_id, price: calculatedTotal });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error submitting quotation');
  }
});

app.get('/api/quotations/compare/:rfqId', requireLogin, async (req, res) => {
  const rfqId = req.params.rfqId;
  try {
    const rfq = await dbHelper.getQuery(`SELECT * FROM rfqs WHERE id = ?`, [rfqId]);
    if (!rfq) return res.status(404).send('RFQ not found');

    const quotations = await dbHelper.allQuery(`
      SELECT q.*, v.name as vendor_name, v.rating as vendor_rating
      FROM quotations q
      JOIN vendors v ON q.vendor_id = v.id
      WHERE q.rfq_id = ?
    `, [rfqId]);

    // Fetch items for each quotation
    for (const q of quotations) {
      q.items = await dbHelper.allQuery(`SELECT * FROM quotation_items WHERE quotation_id = ?`, [q.id]);
    }

    res.json({ rfq, quotations });
  } catch (err) {
    res.status(500).send('Error comparing quotations');
  }
});

// ==========================================
// 6. APPROVAL ENDPOINTS
// ==========================================

app.get('/api/approvals/pending', requireLogin, async (req, res) => {
  try {
    const rows = await dbHelper.allQuery(`
      SELECT q.*, v.name as vendor_name, r.title as rfq_title
      FROM quotations q
      JOIN vendors v ON q.vendor_id = v.id
      JOIN rfqs r ON q.rfq_id = r.id
      WHERE q.status = 'Under Review'
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).send('Error loading pending approvals');
  }
});

// Procurement Officer requests approval
app.post('/api/approvals/request', requireLogin, async (req, res) => {
  const { quotation_id, remarks } = req.body;
  if (!quotation_id) return res.status(400).send('Quotation ID is required');

  try {
    await dbHelper.runQuery(`
      UPDATE quotations SET status = 'Under Review' WHERE id = ?
    `, [quotation_id]);

    const quote = await dbHelper.getQuery(`
      SELECT q.*, v.name as vendor_name FROM quotations q
      JOIN vendors v ON q.vendor_id = v.id
      WHERE q.id = ?
    `, [quotation_id]);

    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'Approval Requested', ?)
    `, [req.session.userId, `Sent quotation from ${quote.vendor_name} (RFQ #${quote.rfq_id}) for Manager approval: "${remarks || ''}"`]);

    io.emit('approval_requested', {
      quotation_id,
      rfq_id: quote.rfq_id,
      vendor_name: quote.vendor_name,
      price: quote.price
    });

    res.send('Approval request registered');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error initiating approval workflow');
  }
});

// Manager submits approval/rejection decision
app.post('/api/approvals/submit', requireLogin, async (req, res) => {
  const { quotation_id, action, remarks } = req.body; // action: Approve / Reject
  if (!quotation_id || !action) {
    return res.status(400).send('Quotation ID and action selection required');
  }

  if (req.session.userRole !== 'Manager' && req.session.userRole !== 'Admin') {
    return res.status(403).send('Only managers or admins can sign-off approvals.');
  }

  try {
    // 1. Insert Approval log
    await dbHelper.runQuery(`
      INSERT INTO approvals (quotation_id, approver_id, action, remarks)
      VALUES (?, ?, ?, ?)
    `, [quotation_id, req.session.userId, action, remarks]);

    // 2. Update quotation status
    const statusVal = action === 'Approve' ? 'Approved' : 'Rejected';
    await dbHelper.runQuery(`
      UPDATE quotations SET status = ? WHERE id = ?
    `, [statusVal, quotation_id]);

    const quote = await dbHelper.getQuery(`
      SELECT q.*, v.name as vendor_name, r.title as rfq_title, r.quantity as rfq_qty
      FROM quotations q
      JOIN vendors v ON q.vendor_id = v.id
      JOIN rfqs r ON q.rfq_id = r.id
      WHERE q.id = ?
    `, [quotation_id]);

    // 3. Update RFQ status to Closed if Approved
    if (action === 'Approve') {
      await dbHelper.runQuery(`UPDATE rfqs SET status = 'Completed' WHERE id = ?`, [quote.rfq_id]);
      
      // Auto-Generate Purchase Order!
      const totalAmt = quote.price; // Already calculated sum of items
      const poNumber = `PO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random()*9000)}`;
      
      await dbHelper.runQuery(`
        INSERT INTO purchase_orders (po_number, quotation_id, total_amount, status)
        VALUES (?, ?, ?, 'Sent')
      `, [poNumber, quotation_id, totalAmt]);

      const poRow = await dbHelper.getQuery(`SELECT last_insert_rowid() as id`);
      
      // Auto-Generate Invoice!
      const taxAmt = totalAmt * 0.0825; // 8.25% Tax
      const grandTotal = totalAmt + taxAmt;
      const invNumber = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random()*9000)}`;

      await dbHelper.runQuery(`
        INSERT INTO invoices (invoice_number, purchase_order_id, tax_amount, total_amount, status)
        VALUES (?, ?, ?, ?, 'Unpaid')
      `, [invNumber, poRow.id, taxAmt, grandTotal]);

      // Broadcast PO generation
      io.emit('po_generated', {
        po_number: poNumber,
        total_amount: grandTotal
      });
    }

    // Activity Log
    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'Quotation Decision', ?)
    `, [req.session.userId, `Manager ${req.session.userName} ${action}d quote from ${quote.vendor_name} for RFQ "${quote.rfq_title}": "${remarks || ''}"`]);

    io.emit('approval_done', {
      quotation_id,
      action,
      remarks
    });

    res.send('Workflow updated successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error resolving approval');
  }
});

// ==========================================
// 7. DYNAMIC PURCHASE ORDER & INVOICE DETAILS API
// ==========================================

// Fetches the dynamic active PO and Invoice details including line items from database
app.get('/api/orders/active-document', requireLogin, async (req, res) => {
  try {
    // Fetch the latest invoice as the active document
    const invoice = await dbHelper.getQuery(`
      SELECT i.*, p.po_number, p.created_at as po_date, p.quotation_id
      FROM invoices i
      JOIN purchase_orders p ON i.purchase_order_id = p.id
      ORDER BY i.id DESC LIMIT 1
    `);

    if (!invoice) {
      return res.status(404).send('No active PO/Invoice documents generated yet.');
    }

    // Fetch the quote details, vendor details, and rfq details
    const quotation = await dbHelper.getQuery(`
      SELECT q.*, v.name as vendor_name, v.address as vendor_address, v.contact_email as vendor_email, r.title as rfq_title
      FROM quotations q
      JOIN vendors v ON q.vendor_id = v.id
      JOIN rfqs r ON q.rfq_id = r.id
      WHERE q.id = ?
    `, [invoice.quotation_id]);

    // Fetch the line items dynamically from database
    const items = await dbHelper.allQuery(`
      SELECT * FROM quotation_items WHERE quotation_id = ?
    `, [invoice.quotation_id]);

    res.json({
      invoice,
      quotation,
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error fetching active document details');
  }
});

app.post('/api/invoices/pay', requireLogin, async (req, res) => {
  const { invoice_number } = req.body;
  if (!invoice_number) return res.status(400).send('Invoice number is required');

  try {
    await dbHelper.runQuery(`
      UPDATE invoices SET status = 'Paid' WHERE invoice_number = ?
    `, [invoice_number]);

    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'Invoice Paid', ?)
    `, [req.session.userId, `Invoice #${invoice_number} was marked as Paid.`]);

    io.emit('invoice_updated', {
      invoice_number,
      status: 'Paid'
    });

    res.send('Invoice status marked as paid');
  } catch (e) {
    res.status(500).send('Error paying invoice');
  }
});

// ==========================================
// 8. EMAIL SIMULATOR & OUTBOX ENDPOINTS
// ==========================================

app.get('/api/emails', requireLogin, (req, res) => {
  try {
    const raw = fs.readFileSync(mailer.emailLogPath, 'utf8');
    res.json(JSON.parse(raw || '[]'));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/emails/clear', requireLogin, (req, res) => {
  try {
    fs.writeFileSync(mailer.emailLogPath, JSON.stringify([]));
    res.send('Logs cleared');
  } catch (err) {
    res.status(500).send('Error clearing email simulator outbox');
  }
});

app.post('/api/invoices/send-email', requireLogin, async (req, res) => {
  const { email, invoice_number } = req.body;
  const targetEmail = email || 'tsharma4563@gmail.com'; // Default to user specified tsharma4563@gmail.com

  if (!invoice_number) return res.status(400).send('Invoice identification required');

  try {
    // Generate beautiful email layout
    const htmlEmail = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0;">
        <h2 style="color: #504bc0;">VendorBridge Procurement</h2>
        <p>Dear Partner,</p>
        <p>Please find attached the official invoice generated for billing record <strong>#${invoice_number}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr style="background-color: #f8f9ff;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Invoice Number</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${invoice_number}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Balance Due</th>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #504bc0;">$64,138.13 USD</td>
          </tr>
          <tr style="background-color: #f8f9ff;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Status</th>
            <td style="padding: 10px; border: 1px solid #ddd; color: #F59E0B; font-weight: bold;">PENDING PAYMENT</td>
          </tr>
        </table>
        
        <p style="margin-top: 25px;">You can view the full documents, track deliveries, or process payments directly in your VendorBridge ERP dashboard.</p>
        <p style="color: #888; font-size: 12px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 10px;">This is a system generated notification, please do not reply directly.</p>
      </div>
    `;

    const result = await mailer.sendInvoiceEmail({
      to: targetEmail,
      subject: `VendorBridge ERP - Invoice Alert #${invoice_number}`,
      html: htmlEmail
    });

    await dbHelper.runQuery(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, 'Invoice Emailed', ?)
    `, [req.session.userId, `Sent email transmission invoice #${invoice_number} to recipient ${targetEmail}`]);

    io.emit('invoice_updated', {
      invoice_number,
      status: 'emailed'
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error mailing invoice');
  }
});

// ==========================================
// 9. ACTIVITY LOGS ENDPOINT
// ==========================================

app.get('/api/activity-logs', requireLogin, async (req, res) => {
  try {
    const rows = await dbHelper.allQuery(`
      SELECT l.*, u.name as user_name, u.role as user_role
      FROM activity_logs l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.id DESC LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).send('Error reading activity logs');
  }
});

// ==========================================
// 10. DYNAMIC ROUTE SERVERS (TEMPLATE LOADER & INJECTOR)
// ==========================================

// Route mapping helper
const routeMapping = {
  '/': 'vendor_dashboard.html',
  '/dashboard': 'vendor_dashboard.html',
  '/quotations': 'quotation.html',
  '/orders': 'invoice_management.html',
  '/invoices': 'invoice_management.html',
  '/rfqs': 'RFQ.html'
};

app.get(['/', '/dashboard', '/quotations', '/orders', '/invoices', '/rfqs'], (req, res) => {
  const matchedTemplate = routeMapping[req.path];
  const templatePath = path.join(__dirname, 'Vendors', 'templates', matchedTemplate);

  if (!fs.existsSync(templatePath)) {
    return res.status(404).send('Template file not found on server.');
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf8');

  // SPECIAL CASE: RFQ.html is completely empty. We supply a basic boilerplate structure
  if (matchedTemplate === 'RFQ.html' && htmlContent.trim() === '') {
    htmlContent = `
      <!DOCTYPE html>
      <html class="light" lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
        <title>RFQ Management | VendorBridge</title>
        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
        <style>
          .material-symbols-outlined {
              font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
              vertical-align: middle;
          }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #dee2ed; border-radius: 10px; }
        </style>
      </head>
      <body class="bg-background text-on-surface font-body-md overflow-hidden">
        <!-- Sidebar Navigation Shell -->
        <aside class="fixed left-0 top-0 bottom-0 flex flex-col z-50 overflow-y-auto bg-surface-subtle border-r border-border-low-contrast w-64">
          <div class="px-6 py-8">
            <h1 class="font-headline-sm text-headline-sm font-black text-primary leading-tight">VendorBridge</h1>
            <p class="font-label-md text-label-md text-secondary mt-1">Procurement Portal</p>
          </div>
          <nav class="flex-1 flex flex-col px-2 space-y-1">
            <a class="flex items-center gap-3 px-4 py-2 hover:bg-surface-variant rounded-lg mx-2" href="/dashboard">
              <span class="material-symbols-outlined">dashboard</span>
              <span class="font-label-md text-label-md">Dashboard</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-2 hover:bg-surface-variant rounded-lg mx-2" href="#">
              <span class="material-symbols-outlined">group</span>
              <span class="font-label-md text-label-md">Vendors</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-2 hover:bg-surface-variant rounded-lg mx-2" href="/rfqs">
              <span class="material-symbols-outlined">request_quote</span>
              <span class="font-label-md text-label-md">RFQs</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-2 hover:bg-surface-variant rounded-lg mx-2" href="/quotations">
              <span class="material-symbols-outlined">description</span>
              <span class="font-label-md text-label-md">Quotations</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-2 hover:bg-surface-variant rounded-lg mx-2" href="/orders">
              <span class="material-symbols-outlined">shopping_cart</span>
              <span class="font-label-md text-label-md">Orders</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-2 hover:bg-surface-variant rounded-lg mx-2" href="/orders">
              <span class="material-symbols-outlined">receipt_long</span>
              <span class="font-label-md text-label-md">Invoices</span>
            </a>
          </nav>
          <div class="px-2 py-6 border-t border-border-low-contrast mt-auto">
            <a class="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:bg-surface-variant transition-all rounded-lg mx-2 my-1" href="/logout">
              <span class="material-symbols-outlined">logout</span>
              <span class="font-label-md text-label-md">Log Out</span>
            </a>
          </div>
        </aside>
        <!-- Main Content Area -->
        <main class="ml-64 flex flex-col h-screen"></main>
      </body>
      </html>
    `;
  }

  // Inject Socket.io, Chart.js, html2pdf and client.js directly before the ending </body> tag
  const injectScripts = `
    <!-- Injected ERP Application dependencies & client script -->
    <link rel="stylesheet" href="/css/client.css">
    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script src="/js/client.js" defer></script>
  `;

  const modifiedHtml = htmlContent.replace('</body>', `${injectScripts}</body>`);
  res.send(modifiedHtml);
});

// Start the HTTP & Websocket Server
server.listen(PORT, () => {
  console.log(`===========================================================`);
  console.log(`  VendorBridge ERP Server running at http://localhost:${PORT}`);
  console.log(`===========================================================`);
});
