const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'db.sqlite3');
const db = new sqlite3.Database(dbPath);

function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initDb() {
  console.log('Initializing database...');

  // Create tables
  await runQuery(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      gst_number TEXT NOT NULL,
      contact_email TEXT UNIQUE NOT NULL,
      contact_phone TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      rating REAL DEFAULT 5.0
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      vendor_id INTEGER,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS rfqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS rfq_assignments (
      rfq_id INTEGER NOT NULL,
      vendor_id INTEGER NOT NULL,
      PRIMARY KEY (rfq_id, vendor_id),
      FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfq_id INTEGER NOT NULL,
      vendor_id INTEGER NOT NULL,
      price REAL NOT NULL,
      delivery_timeline INTEGER NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Submitted',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    )
  `);

  // Vendor quotation items table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL,
      approver_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT UNIQUE NOT NULL,
      quotation_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      purchase_order_id INTEGER NOT NULL,
      tax_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Unpaid',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Check if users already exist, if not seed the database
  const userCount = await getQuery(`SELECT COUNT(*) as count FROM users`);
  if (userCount.count === 0) {
    console.log('Seeding mock database...');

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('password123', salt);

    // 1. Insert Vendors
    const vendors = [
      { name: 'TechFlow Solutions', category: 'IT Hardware', gst_number: '29AAAAA1111A1Z1', contact_email: 'sales@techflow.com', contact_phone: '+1-555-0199', address: '100 Silicon Blvd, San Jose, CA', status: 'Approved', rating: 4.8 },
      { name: 'Global Dynamics', category: 'IT Hardware', gst_number: '29BBBBB2222B2Z2', contact_email: 'sales@globaldynamics.com', contact_phone: '+1-555-0288', address: '200 Industrial Way, Austin, TX', status: 'Approved', rating: 4.2 },
      { name: 'Rapid Industrial', category: 'IT Hardware', gst_number: '29CCCCC3333C3Z3', contact_email: 'sales@rapidind.com', contact_phone: '+1-555-0377', address: '300 Logistics Rd, Chicago, IL', status: 'Approved', rating: 4.5 },
      { name: 'Global Networks Inc.', category: 'Networking', gst_number: '29DDDDD4444D4Z4', contact_email: 'info@globalnetworks.com', contact_phone: '+1-555-0466', address: '400 Connectivity St, New York, NY', status: 'Approved', rating: 4.6 },
      { name: 'Swift Logistics', category: 'Logistics', gst_number: '29EEEEE5555E5Z5', contact_email: 'contact@swiftlog.com', contact_phone: '+1-555-0555', address: '500 Delivery Lane, Seattle, WA', status: 'Approved', rating: 4.4 },
      { name: 'Advanced Polymers', category: 'Chemicals', gst_number: '29FFFFF6666F6Z6', contact_email: 'sales@advpolymers.com', contact_phone: '+1-555-0644', address: '600 Chemical Rd, Houston, TX', status: 'Approved', rating: 4.0 },
      { name: 'BioPharma Supplies LLC', category: 'Medical', gst_number: '29GGGGG7777G7Z7', contact_email: 'docs@biopharmasupplies.com', contact_phone: '+1-555-0733', address: '700 Lab Way, Boston, MA', status: 'Pending', rating: 5.0 }
    ];

    const vendorIds = {};
    for (const v of vendors) {
      await runQuery(`
        INSERT INTO vendors (name, category, gst_number, contact_email, contact_phone, address, status, rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [v.name, v.category, v.gst_number, v.contact_email, v.contact_phone, v.address, v.status, v.rating]);
      
      const row = await getQuery(`SELECT last_insert_rowid() as id`);
      vendorIds[v.name] = row.id;
    }

    // 2. Insert Users
    const users = [
      { email: 'officer@vendorbridge.com', name: 'Alex Rivera', role: 'Procurement Officer', vendor_id: null },
      { email: 'manager@vendorbridge.com', name: 'Sarah Jenkins', role: 'Manager', vendor_id: null },
      { email: 'admin@vendorbridge.com', name: 'Marcus Chen', role: 'Admin', vendor_id: null },
      // Vendor users
      { email: 'sales@techflow.com', name: 'Robert Flow', role: 'Vendor', vendor_id: vendorIds['TechFlow Solutions'] },
      { email: 'sales@globaldynamics.com', name: 'Jessica Dy', role: 'Vendor', vendor_id: vendorIds['Global Dynamics'] },
      { email: 'sales@rapidind.com', name: 'Tom Rapid', role: 'Vendor', vendor_id: vendorIds['Rapid Industrial'] }
    ];

    const userIds = {};
    for (const u of users) {
      await runQuery(`
        INSERT INTO users (email, password_hash, name, role, vendor_id)
        VALUES (?, ?, ?, ?, ?)
      `, [u.email, passwordHash, u.name, u.role, u.vendor_id]);

      const row = await getQuery(`SELECT last_insert_rowid() as id`);
      userIds[u.email] = row.id;
    }

    // 3. Insert RFQs
    const rfqs = [
      { id: 1, title: 'Industrial HVAC Units', description: 'High-efficiency cooling systems for Phase II Data Center expansion.', quantity: 10, deadline: '2026-06-30', status: 'Active', created_by: userIds['officer@vendorbridge.com'] },
      { id: 2, title: 'Enterprise Servers - Model X200', description: 'Enterprise Server Rack - Model X200 with modular cooling.', quantity: 4, deadline: '2026-06-15', status: 'Completed', created_by: userIds['officer@vendorbridge.com'] },
      { id: 3, title: 'Optic Fiber Pack & Connections', description: 'High-speed 100Gbps multi-mode fiber connections (10m).', quantity: 15, deadline: '2026-06-20', status: 'Completed', created_by: userIds['officer@vendorbridge.com'] },
      { id: 4, title: 'Network Switch Upgrade', description: 'Layer 3 Managed PoE Switches, 48 Ports.', quantity: 8, deadline: '2026-07-05', status: 'Active', created_by: userIds['officer@vendorbridge.com'] }
    ];

    for (const r of rfqs) {
      await runQuery(`
        INSERT INTO rfqs (id, title, description, quantity, deadline, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [r.id, r.title, r.description, r.quantity, r.deadline, r.status, r.created_by]);
    }

    // 4. Assign RFQ 1 (HVAC) to TechFlow, Global Dynamics, Rapid Industrial
    const assignments = [
      { rfq_id: 1, vendor_id: vendorIds['TechFlow Solutions'] },
      { rfq_id: 1, vendor_id: vendorIds['Global Dynamics'] },
      { rfq_id: 1, vendor_id: vendorIds['Rapid Industrial'] },
      { rfq_id: 2, vendor_id: vendorIds['TechFlow Solutions'] }
    ];

    for (const a of assignments) {
      await runQuery(`
        INSERT INTO rfq_assignments (rfq_id, vendor_id)
        VALUES (?, ?)
      `, [a.rfq_id, a.vendor_id]);
    }

    // 5. Insert Quotations
    const quotations = [
      // For RFQ 1 (Industrial HVAC Units)
      { id: 1, rfq_id: 1, vendor_id: vendorIds['TechFlow Solutions'], price: 12450.00, delivery_timeline: 22, notes: 'Net 30. 24 Months Extended Warranty.', status: 'Submitted' },
      { id: 2, rfq_id: 1, vendor_id: vendorIds['Global Dynamics'], price: 11800.00, delivery_timeline: 35, notes: 'Net 15. 12 Months Standard Warranty. Lowest price guarantee.', status: 'Submitted' },
      { id: 3, rfq_id: 1, vendor_id: vendorIds['Rapid Industrial'], price: 13100.00, delivery_timeline: 14, notes: '50% Advance. 18 Months Standard Warranty. Fast logistics.', status: 'Submitted' },
      
      // For RFQ 2 (Enterprise Servers) - Approved quotation which led to PO
      { id: 4, rfq_id: 2, vendor_id: vendorIds['TechFlow Solutions'], price: 12500.00, delivery_timeline: 10, notes: 'Awaiting purchase order generation.', status: 'Approved' }
    ];

    for (const q of quotations) {
      await runQuery(`
        INSERT INTO quotations (id, rfq_id, vendor_id, price, delivery_timeline, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [q.id, q.rfq_id, q.vendor_id, q.price, q.delivery_timeline, q.notes, q.status]);
    }

    // 6. Insert Quotation Items (Dynamically fetched instead of hardcoded layouts)
    const quoteItems = [
      // Quotation 1 (Industrial HVAC)
      { quotation_id: 1, description: 'Industrial High-Efficiency HVAC Unit Model A1', quantity: 10, unit_price: 12450.00 },
      // Quotation 2 (Industrial HVAC)
      { quotation_id: 2, description: 'Global HVAC Air Flow Controller Systems', quantity: 10, unit_price: 11800.00 },
      // Quotation 3 (Industrial HVAC)
      { quotation_id: 3, description: 'Rapid Heavy Duty HVAC System 1000', quantity: 10, unit_price: 13100.00 },
      
      // Quotation 4 (Approved Enterprise Servers)
      { quotation_id: 4, description: 'Enterprise Server Rack - Model X200', quantity: 4, unit_price: 12500.00 },
      { quotation_id: 4, description: 'Optic Fiber Connectivity Pack', quantity: 15, unit_price: 450.00 },
      { quotation_id: 4, description: 'Installation & Setup Service', quantity: 1, unit_price: 2500.00 }
    ];

    for (const qi of quoteItems) {
      await runQuery(`
        INSERT INTO quotation_items (quotation_id, description, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `, [qi.quotation_id, qi.description, qi.quantity, qi.unit_price]);
    }

    // 7. Insert Approvals
    await runQuery(`
      INSERT INTO approvals (quotation_id, approver_id, action, remarks)
      VALUES (?, ?, ?, ?)
    `, [4, userIds['manager@vendorbridge.com'], 'Approve', 'Approved quotation as it satisfies our immediate criteria and timeline.']);

    // 8. Insert Purchase Orders
    const poDateStr = '20231024';
    // Grand subtotal = 4 * 12500 + 15 * 450 + 1 * 2500 = 50000 + 6750 + 2500 = 59250
    await runQuery(`
      INSERT INTO purchase_orders (id, po_number, quotation_id, total_amount, status)
      VALUES (?, ?, ?, ?, ?)
    `, [1, `PO-20231024-0892`, 4, 59250.00, 'Sent']);

    // 9. Insert Invoices
    await runQuery(`
      INSERT INTO invoices (id, invoice_number, purchase_order_id, tax_amount, total_amount, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [1, 'INV-20231025-9011', 1, 4888.13, 64138.13, 'Unpaid']);

    // 10. Insert Activity Logs
    const logs = [
      { user_id: userIds['manager@vendorbridge.com'], action: 'RFQ Approved', details: 'RFQ #2024-012 Approved by Procurement Lead Sarah J.' },
      { user_id: userIds['officer@vendorbridge.com'], action: 'Vendor Registered', details: 'BioPharma Supplies LLC submitted registration documents.' },
      { user_id: userIds['sales@techflow.com'], action: 'Quotation Submitted', details: 'TechFlow Solutions submitted pricing for Industrial HVAC Units.' },
      { user_id: userIds['admin@vendorbridge.com'], action: 'User Created', details: 'Added Jessica Dy as Vendor User for Global Dynamics.' }
    ];

    for (const l of logs) {
      await runQuery(`
        INSERT INTO activity_logs (user_id, action, details)
        VALUES (?, ?, ?)
      `, [l.user_id, l.action, l.details]);
    }

    console.log('Mock database seeding completed.');
  } else {
    console.log('Database already seeded.');
  }
}

module.exports = {
  db,
  initDb,
  runQuery,
  allQuery,
  getQuery
};
