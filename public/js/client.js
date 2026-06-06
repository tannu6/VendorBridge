// client.js - Front-end JavaScript logic for VendorBridge ERP

// 1. Global Socket.io Initialization
const socket = io();

// Listen for real-time events
socket.on('rfq_created', (data) => {
  showToast(`📢 New RFQ Created: "${data.title}" by ${data.created_by_name}`, 'info');
  if (window.location.pathname.includes('/rfqs') || window.location.pathname === '/' || window.location.pathname.includes('/dashboard')) {
    refreshCurrentPageData();
  }
});

socket.on('quotation_submitted', (data) => {
  showToast(`💰 Quote Submitted: ${data.vendor_name} quoted $${data.price} for RFQ #${data.rfq_id}`, 'success');
  if (window.location.pathname.includes('/quotations') || window.location.pathname === '/' || window.location.pathname.includes('/dashboard')) {
    refreshCurrentPageData();
  }
});

socket.on('approval_requested', (data) => {
  showToast(`⚡ Approval Needed: Quote from ${data.vendor_name} ($${data.price}) awaits review.`, 'warning');
  if (window.location.pathname === '/' || window.location.pathname.includes('/dashboard')) {
    refreshCurrentPageData();
  }
});

socket.on('approval_done', (data) => {
  const statusColor = data.action === 'Approve' ? 'success' : 'error';
  showToast(`✅ Approval Decision: Manager has ${data.action}d Quote #${data.quotation_id} (${data.remarks || 'No remarks'})`, statusColor);
  if (window.location.pathname.includes('/orders') || window.location.pathname === '/' || window.location.pathname.includes('/dashboard')) {
    refreshCurrentPageData();
  }
});

socket.on('po_generated', (data) => {
  showToast(`📄 Purchase Order Generated: PO #${data.po_number} for $${data.total_amount}`, 'success');
  if (window.location.pathname.includes('/orders') || window.location.pathname === '/' || window.location.pathname.includes('/dashboard')) {
    refreshCurrentPageData();
  }
});

socket.on('invoice_updated', (data) => {
  showToast(`💳 Invoice #${data.invoice_number} marked as ${data.status.toUpperCase()}`, 'success');
  if (window.location.pathname.includes('/orders') || window.location.pathname === '/' || window.location.pathname.includes('/dashboard')) {
    refreshCurrentPageData();
  }
});

// Toast Helper
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined">
      ${type === 'success' ? 'check_circle' : type === 'warning' ? 'warning' : type === 'error' ? 'error' : 'info'}
    </span>
    <div>${message}</div>
  `;
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 50);

  // Remove toast
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// 2. Session & Authentication logic
let currentUser = null;

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      currentUser = await res.json();
      setupPageForUser();
    } else {
      showLoginOverlay();
    }
  } catch (err) {
    console.error('Session check failed:', err);
    showLoginOverlay();
  }
}

function showLoginOverlay() {
  let overlay = document.getElementById('auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <div class="flex items-center gap-3 mb-6 justify-center">
          <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-on-primary">
            <span class="material-symbols-outlined text-headline-sm" style="font-variation-settings: 'FILL' 1;">account_balance</span>
          </div>
          <h1 class="text-2xl font-black text-white">VendorBridge</h1>
        </div>
        <h2 class="text-xl font-bold text-center mb-6" id="auth-title">Log In to ERP</h2>
        
        <form id="auth-form" class="space-y-4">
          <div id="name-group" class="hidden">
            <label class="block text-sm text-secondary mb-1">Full Name</label>
            <input type="text" id="auth-name" class="auth-input" placeholder="e.g. John Doe">
          </div>
          <div>
            <label class="block text-sm text-secondary mb-1">Email Address</label>
            <input type="email" id="auth-email" class="auth-input" required placeholder="e.g. officer@vendorbridge.com">
          </div>
          <div>
            <label class="block text-sm text-secondary mb-1">Password</label>
            <input type="password" id="auth-password" class="auth-input" required placeholder="••••••••">
          </div>
          <div id="role-group" class="hidden">
            <label class="block text-sm text-secondary mb-1">Select Role</label>
            <select id="auth-role" class="auth-input">
              <option value="Procurement Officer">Procurement Officer</option>
              <option value="Vendor">Vendor Representative</option>
              <option value="Manager">Manager / Approver</option>
              <option value="Admin">Administrator (All Access)</option>
            </select>
          </div>
          <div id="vendor-group" class="hidden">
            <label class="block text-sm text-secondary mb-1">Select Vendor Association</label>
            <select id="auth-vendor" class="auth-input">
              <!-- Populated dynamically -->
            </select>
          </div>
          
          <button type="submit" class="auth-btn mt-2" id="auth-submit-btn">Log In</button>
        </form>
        
        <div class="mt-6 text-center text-sm text-secondary">
          <span id="auth-switch-text">Don't have an account?</span>
          <span class="auth-link ml-1 font-bold" id="auth-switch-link" onclick="toggleAuthMode()">Sign Up</span>
        </div>
        <div class="mt-4 text-center text-xs text-secondary">
          <span class="auth-link" onclick="forgotPassword()">Forgot Password?</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Fetch vendors to populate vendor selection for signup
    fetch('/api/vendors')
      .then(r => r.json())
      .then(vendors => {
        const select = document.getElementById('auth-vendor');
        if (select) {
          vendors.forEach(v => {
            select.innerHTML += `<option value="${v.id}">${v.name}</option>`;
          });
        }
      });

    // Setup submit handler
    document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
  }
  overlay.classList.add('active');
}

let isSignUpMode = false;
function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  document.getElementById('auth-title').innerText = isSignUpMode ? 'Create ERP Account' : 'Log In to ERP';
  document.getElementById('name-group').className = isSignUpMode ? 'block' : 'hidden';
  document.getElementById('role-group').className = isSignUpMode ? 'block' : 'hidden';
  document.getElementById('auth-submit-btn').innerText = isSignUpMode ? 'Sign Up' : 'Log In';
  document.getElementById('auth-switch-text').innerText = isSignUpMode ? 'Already registered?' : "Don't have an account?";
  document.getElementById('auth-switch-link').innerText = isSignUpMode ? 'Log In' : 'Sign Up';

  const roleSelect = document.getElementById('auth-role');
  const vendorGroup = document.getElementById('vendor-group');
  if (isSignUpMode) {
    roleSelect.addEventListener('change', () => {
      vendorGroup.className = roleSelect.value === 'Vendor' ? 'block' : 'hidden';
    });
  } else {
    vendorGroup.className = 'hidden';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value;
  const role = document.getElementById('auth-role').value;
  const vendorId = document.getElementById('auth-vendor').value;

  const endpoint = isSignUpMode ? '/api/auth/signup' : '/api/auth/login';
  const body = isSignUpMode
    ? { email, password, name, role, vendor_id: role === 'Vendor' ? vendorId : null }
    : { email, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      currentUser = await res.json();
      document.getElementById('auth-overlay').classList.remove('active');
      showToast(`Welcome back, ${currentUser.name}!`, 'success');
      setTimeout(() => window.location.reload(), 800);
    } else {
      const errText = await res.text();
      showToast(errText || 'Authentication failed', 'error');
    }
  } catch (err) {
    showToast('Network error during login', 'error');
  }
}

function forgotPassword() {
  const email = prompt('Enter your registered email to reset password:');
  if (!email) return;
  fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
    .then(res => res.ok ? alert('Password reset link sent to your email (simulated).') : alert('Failed to send reset email.'));
}

// 3. User Role Switcher Badge (for local simulation/testing)
function injectRoleSwitcher() {
  let badge = document.getElementById('role-switcher-badge');
  if (!badge && currentUser) {
    badge = document.createElement('div');
    badge.id = 'role-switcher-badge';
    badge.className = 'role-switcher-badge';
    badge.innerHTML = `
      <span class="material-symbols-outlined text-[16px]">swap_horiz</span>
      <span>Testing as: <strong>${currentUser.role}</strong></span>
    `;
    badge.onclick = async () => {
      const roles = ['Procurement Officer', 'Vendor', 'Manager', 'Admin'];
      const nextIdx = (roles.indexOf(currentUser.role) + 1) % roles.length;
      const nextRole = roles[nextIdx];
      
      // Request role update endpoint
      const res = await fetch('/api/auth/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole })
      });
      if (res.ok) {
        showToast(`Switched workspace perspective to: ${nextRole}`, 'warning');
        setTimeout(() => window.location.reload(), 600);
      }
    };
    document.body.appendChild(badge);
  }
}

// 4. Light/Dark Mode Switcher Injection
function injectThemeSwitcher() {
  if (document.getElementById('theme-switcher-btn')) return;

  const headerRight = document.querySelector('header .flex.items-center.gap-4') || document.querySelector('header .flex.items-center.gap-stack-md');
  if (headerRight) {
    // Check local storage for theme
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.className = currentTheme;

    const themeBtn = document.createElement('button');
    themeBtn.id = 'theme-switcher-btn';
    themeBtn.className = 'w-10 h-10 flex items-center justify-center text-secondary hover:bg-surface-container-low rounded-full transition-colors';
    themeBtn.title = 'Toggle Dark/Light Mode';
    themeBtn.innerHTML = `
      <span class="material-symbols-outlined">${currentTheme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
    `;
    
    themeBtn.onclick = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const nextTheme = isDark ? 'light' : 'dark';
      document.documentElement.className = nextTheme;
      localStorage.setItem('theme', nextTheme);
      themeBtn.innerHTML = `
        <span class="material-symbols-outlined">${nextTheme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
      `;
      showToast(`Toggled ${nextTheme.toUpperCase()} mode!`, 'info');
    };

    // Prepend next to notifications or user block
    headerRight.insertBefore(themeBtn, headerRight.firstChild);
  }
}

// 5. Setup page routes and customizations
function setupPageForUser() {
  if (!currentUser) return;

  injectRoleSwitcher();
  setupSidebarLinks();
  setupHeaderUserBlock();
  injectThemeSwitcher();

  // Initialize specific screens
  const path = window.location.pathname;
  if (path === '/' || path.includes('/dashboard')) {
    initDashboardView();
  } else if (path.includes('/quotations')) {
    initQuotationsView();
  } else if (path.includes('/orders') || path.includes('/invoices')) {
    initInvoicesView();
  } else if (path.includes('/rfqs')) {
    initRFQView();
  }
}

function setupHeaderUserBlock() {
  const headerName = document.querySelector('header .text-right p:first-child') || document.querySelector('header .text-right p');
  const headerRole = document.querySelector('header .text-right p:last-child');
  if (headerName) {
    headerName.innerText = currentUser.name;
  }
  if (headerRole) {
    headerRole.innerText = currentUser.role;
  }
}

function setupSidebarLinks() {
  const links = document.querySelectorAll('aside nav a');
  const path = window.location.pathname;

  links.forEach(link => {
    const text = link.querySelector('span:last-child').innerText.trim().toLowerCase();
    
    // Rewrite path targets
    if (text === 'dashboard') link.href = '/dashboard';
    else if (text === 'vendors') link.href = '#'; // Handled via modal/popup
    else if (text === 'rfqs') link.href = '/rfqs';
    else if (text === 'quotations') link.href = '/quotations';
    else if (text === 'orders' || text === 'invoices') link.href = '/orders';
    else if (text === 'analytics') link.href = '#'; // Toggles charts modal
    else if (text === 'settings') link.href = '#';

    // Highlight active link
    let isActive = false;
    if (text === 'dashboard' && (path === '/' || path.includes('/dashboard'))) isActive = true;
    else if (text === 'rfqs' && path.includes('/rfqs')) isActive = true;
    else if (text === 'quotations' && path.includes('/quotations')) isActive = true;
    else if (text === 'orders' && (path.includes('/orders') || path.includes('/invoices'))) isActive = true;

    if (isActive) {
      link.className = 'flex items-center gap-3 px-4 py-3 bg-primary-container text-on-primary-container rounded-lg mx-2 my-1 transition-transform active:scale-95';
    } else {
      link.className = 'flex items-center gap-3 px-4 py-3 text-on-surface-variant dark:text-surface-variant hover:bg-surface-variant rounded-lg mx-2 my-1 transition-all';
    }
  });

  // Inject Email Simulator into the sidebar menu
  let nav = document.querySelector('aside nav');
  if (nav && !document.getElementById('nav-email-sim')) {
    const simLink = document.createElement('a');
    simLink.id = 'nav-email-sim';
    simLink.className = 'flex items-center gap-3 px-4 py-3 text-on-surface-variant dark:text-surface-variant hover:bg-surface-variant rounded-lg mx-2 my-1 transition-all';
    simLink.href = '#';
    simLink.innerHTML = `
      <span class="material-symbols-outlined">mail_lock</span>
      <span class="font-label-md text-label-md">Email Outbox</span>
    `;
    simLink.onclick = (e) => {
      e.preventDefault();
      openEmailSimulatorModal();
    };
    nav.appendChild(simLink);
  }

  // Inject Vendors Directory link handler
  const vendorsLink = Array.from(links).find(l => l.querySelector('span:last-child').innerText.trim().toLowerCase() === 'vendors');
  if (vendorsLink) {
    vendorsLink.onclick = (e) => {
      e.preventDefault();
      openVendorsModal();
    };
  }

  // Inject Analytics link handler
  const analyticsLink = Array.from(links).find(l => l.querySelector('span:last-child').innerText.trim().toLowerCase() === 'analytics');
  if (analyticsLink) {
    analyticsLink.onclick = (e) => {
      e.preventDefault();
      openAnalyticsModal();
    };
  }

  // Bind logout button (Procure logout route)
  const logoutBtn = document.querySelector('aside a[href*="logout"]') || Array.from(document.querySelectorAll('aside a')).find(a => a.textContent.includes('Log Out'));
  if (logoutBtn) {
    logoutBtn.href = '#';
    logoutBtn.onclick = async (e) => {
      e.preventDefault();
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        showToast('Logged out successfully', 'info');
        setTimeout(() => window.location.reload(), 500);
      }
    };
  }
}

// 6. Dashboard View Setup (Populated from SQLite)
async function initDashboardView() {
  try {
    // A. Fetch statistics
    const statsRes = await fetch('/api/dashboard/stats');
    if (statsRes.ok) {
      const stats = await statsRes.json();
      
      const cards = document.querySelectorAll('.grid > div');
      if (cards.length >= 4) {
        // Pending Approvals
        cards[0].querySelector('p:last-child').innerText = stats.pendingApprovals;
        // Active RFQs
        cards[1].querySelector('p:last-child').innerText = stats.activeRfqs;
        // Total Spend
        cards[2].querySelector('p:last-child').innerText = `$${(stats.totalSpend / 1000).toFixed(1)}k`;
        // New Quotations
        cards[3].querySelector('p:last-child').innerText = stats.newQuotations;
      }
    }

    // B. Populate Pending Approvals Table
    const approvalsRes = await fetch('/api/approvals/pending');
    if (approvalsRes.ok) {
      const pending = await approvalsRes.json();
      const tbody = document.querySelector('table tbody');
      if (tbody) {
        tbody.innerHTML = '';
        if (pending.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-secondary">No pending quotations require your approval.</td></tr>`;
        } else {
          pending.forEach(item => {
            const initials = item.vendor_name.split(' ').map(n => n[0]).join('').substr(0,2).toUpperCase();
            tbody.innerHTML += `
              <tr class="hover:bg-primary/5 transition-colors">
                <td class="px-6 py-4 font-data-tabular text-data-tabular">#RFQ-${item.rfq_id}-${item.id}</td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded bg-primary/10 flex items-center justify-center font-bold text-xs text-primary">${initials}</div>
                    <span class="font-body-md text-body-md">${item.vendor_name}</span>
                  </div>
                </td>
                <td class="px-6 py-4 font-data-tabular text-data-tabular">$${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td class="px-6 py-4 font-body-sm text-body-sm text-secondary">${new Date(item.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</td>
                <td class="px-6 py-4 text-right">
                  <button onclick="viewQuotationDetails(${item.rfq_id})" class="text-primary font-label-md text-label-md px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary hover:text-white transition-all">Compare & Review</button>
                </td>
              </tr>
            `;
          });
        }
      }
    }

    // C. Populate Recent Activity
    const logsRes = await fetch('/api/activity-logs');
    if (logsRes.ok) {
      const logs = await logsRes.json();
      const activityContainer = document.querySelector('aside .bg-surface-container-lowest') || document.querySelector('aside .relative.overflow-hidden');
      if (activityContainer) {
        activityContainer.innerHTML = `<div class="absolute left-[33px] top-6 bottom-6 w-px bg-border-low-contrast"></div>`;
        
        logs.forEach(log => {
          let dotColor = 'bg-status-info';
          if (log.action.toLowerCase().includes('approve')) dotColor = 'bg-status-approved';
          else if (log.action.toLowerCase().includes('reject') || log.action.toLowerCase().includes('canc')) dotColor = 'bg-status-rejected';
          else if (log.action.toLowerCase().includes('quote')) dotColor = 'bg-status-pending';

          const timeFormatted = formatTimeAgo(new Date(log.created_at));

          activityContainer.innerHTML += `
            <div class="relative flex gap-4">
              <div class="w-4 h-4 rounded-full ${dotColor} border-4 border-surface-container-lowest z-10 mt-1"></div>
              <div class="flex-1">
                <p class="font-body-md text-body-md text-on-surface">${log.action}</p>
                <p class="text-secondary text-body-sm">${log.details}</p>
                <p class="text-[11px] text-secondary-fixed-dim uppercase mt-1">${timeFormatted}</p>
              </div>
            </div>
          `;
        });
      }
    }

    // D. Bind Create RFQ quick action
    const h2 = document.querySelector('main h2');
    if (h2) {
      h2.innerText = `Welcome back, ${currentUser.name}`;
    }

    const newRfqBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create New RFQ'));
    if (newRfqBtn) {
      newRfqBtn.onclick = () => {
        if (currentUser.role === 'Vendor') {
          showToast('Vendors cannot create RFQs', 'error');
        } else {
          window.location.href = '/rfqs';
        }
      };
    }

    const regVendorQuickAction = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Register Vendor'));
    if (regVendorQuickAction) {
      regVendorQuickAction.onclick = openRegisterVendorModal;
    }

  } catch (err) {
    console.error('Failed to populate dashboard:', err);
  }
}

// 7. Quotation Comparison View Setup
let activeRfqId = 1; // HVAC RFQ
async function initQuotationsView() {
  try {
    const res = await fetch(`/api/quotations/compare/${activeRfqId}`);
    if (!res.ok) return;

    const data = await res.json();
    
    // Update headers
    const rfqTitleH2 = document.querySelector('h2');
    const rfqDescP = document.querySelector('main p') || document.querySelector('main .text-on-surface-variant');
    if (rfqTitleH2) rfqTitleH2.innerText = `RFQ #${data.rfq.id}: ${data.rfq.title}`;
    if (rfqDescP) rfqDescP.innerText = data.rfq.description;

    const table = document.querySelector('table');
    if (!table || data.quotations.length === 0) return;

    // We have unit price, total price, timeline, score, terms, warranty
    const prices = data.quotations.map(q => q.price);
    const timelines = data.quotations.map(q => q.delivery_timeline);
    
    const minPrice = Math.min(...prices);
    const minTimeline = Math.min(...timelines);

    // Build the table header dynamically
    let theadTr = table.querySelector('thead tr');
    theadTr.innerHTML = `
      <th class="p-6 text-left w-64 min-w-[200px] align-top">
        <div class="flex flex-col">
          <span class="font-label-md text-primary uppercase tracking-wider mb-2">Comparison Matrix</span>
          <div class="p-4 bg-surface-container-high rounded-xl">
            <p class="text-body-sm font-semibold">Weightage</p>
            <ul class="text-xs text-on-surface-variant mt-2 space-y-1">
              <li class="flex justify-between"><span>Price:</span> <span>40%</span></li>
              <li class="flex justify-between"><span>Lead Time:</span> <span>30%</span></li>
              <li class="flex justify-between"><span>Tech Score:</span> <span>30%</span></li>
            </ul>
          </div>
        </div>
      </th>
    `;

    data.quotations.forEach(q => {
      const isLowest = q.price === minPrice;
      const isFastest = q.delivery_timeline === minTimeline;
      
      let badge = 'VERIFIED VENDOR';
      let badgeClass = 'bg-status-info/10 text-status-info';
      if (isLowest) {
        badge = 'LOWEST PRICE';
        badgeClass = 'bg-status-approved/10 text-status-approved';
      } else if (isFastest) {
        badge = 'FASTEST SHIPPER';
        badgeClass = 'bg-status-pending/10 text-status-pending';
      }

      theadTr.innerHTML += `
        <th class="p-6 min-w-[240px] border-l border-border-low-contrast text-left align-top">
          <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div class="w-12 h-12 bg-surface-container rounded-xl flex items-center justify-center">
                <span class="material-symbols-outlined text-primary text-2xl">precision_manufacturing</span>
              </div>
              <div class="px-2 py-1 rounded ${badgeClass} font-label-md text-[10px]">${badge}</div>
            </div>
            <div>
              <h3 class="font-headline-sm text-[18px] text-on-surface">${q.vendor_name}</h3>
              <div class="flex items-center gap-1 mt-1">
                <span class="material-symbols-outlined text-status-pending text-sm" style="font-variation-settings: 'FILL' 1;">star</span>
                <span class="text-label-md font-bold">${q.vendor_rating.toFixed(1)}</span>
                <span class="text-label-md text-secondary ml-1">(Active Vendor)</span>
              </div>
            </div>
          </div>
        </th>
      `;
    });

    // Build the table body
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    // Row 1: Unit Price
    let rowHtml = `<tr class="hover:bg-primary/5 transition-colors group">
      <td class="p-6 font-label-md text-secondary group-hover:text-primary transition-colors">Unit Price (Average)</td>`;
    data.quotations.forEach(q => {
      const averagePrice = q.price / data.rfq.quantity;
      const isLowest = q.price === minPrice;
      const cellClass = isLowest ? 'text-status-approved highlight-best' : '';
      rowHtml += `<td class="p-6 font-data-tabular text-headline-sm ${cellClass}">$${averagePrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>`;
    });
    rowHtml += '</tr>';
    tbody.innerHTML += rowHtml;

    // Row 2: Total Price
    rowHtml = `<tr class="hover:bg-primary/5 transition-colors group">
      <td class="p-6 font-label-md text-secondary group-hover:text-primary transition-colors">Total Price (${data.rfq.quantity} Units)</td>`;
    data.quotations.forEach(q => {
      const total = q.price;
      const isLowest = q.price === minPrice;
      const cellClass = isLowest ? 'text-status-approved highlight-best' : '';
      rowHtml += `<td class="p-6 font-data-tabular text-headline-sm ${cellClass}">$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>`;
    });
    rowHtml += '</tr>';
    tbody.innerHTML += rowHtml;

    // Row 3: Delivery Timeline
    rowHtml = `<tr class="hover:bg-primary/5 transition-colors group">
      <td class="p-6 font-label-md text-secondary group-hover:text-primary transition-colors">Lead Time</td>`;
    data.quotations.forEach(q => {
      const isFastest = q.delivery_timeline === minTimeline;
      const cellClass = isFastest ? 'font-bold text-status-approved highlight-best' : '';
      rowHtml += `<td class="p-6 text-body-lg ${cellClass}">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-sm">schedule</span>
          ${q.delivery_timeline} Days
        </div>
      </td>`;
    });
    rowHtml += '</tr>';
    tbody.innerHTML += rowHtml;

    // Row 4: Items Breakdown (Fetched from DB)
    rowHtml = `<tr class="hover:bg-primary/5 transition-colors group">
      <td class="p-6 font-label-md text-secondary group-hover:text-primary transition-colors">Line Items Detail</td>`;
    data.quotations.forEach(q => {
      let itemsListHtml = '<ul class="text-xs list-disc pl-4 space-y-1">';
      q.items.forEach(itm => {
        itemsListHtml += `<li>${itm.description} (${itm.quantity}x @ $${itm.unit_price})</li>`;
      });
      itemsListHtml += '</ul>';
      rowHtml += `<td class="p-6 text-body-md">${itemsListHtml}</td>`;
    });
    rowHtml += '</tr>';
    tbody.innerHTML += rowHtml;

    // Row 5: Notes/Warranties
    rowHtml = `<tr class="hover:bg-primary/5 transition-colors group">
      <td class="p-6 font-label-md text-secondary group-hover:text-primary transition-colors">Terms & Notes</td>`;
    data.quotations.forEach(q => {
      rowHtml += `<td class="p-6 text-body-md">${q.notes || 'N/A'}</td>`;
    });
    rowHtml += '</tr>';
    tbody.innerHTML += rowHtml;

    // Row 6: Actions
    rowHtml = `<tr><td class="p-6 bg-surface-container-lowest"></td>`;
    data.quotations.forEach(q => {
      const isLowest = q.price === minPrice;
      const btnClass = isLowest
        ? 'bg-primary text-on-primary hover:shadow-lg ring-4 ring-primary/10'
        : 'bg-surface-container-high text-on-surface-variant hover:bg-primary hover:text-white';
      
      let approvalActionHtml = `
        <button onclick="submitApprovalAction(${q.id}, 'Approve')" class="w-full py-4 px-6 rounded-xl ${btnClass} transition-all font-bold flex items-center justify-center gap-2">
          Select &amp; Approve
          <span class="material-symbols-outlined">check_circle</span>
        </button>
      `;

      if (currentUser.role === 'Vendor') {
        approvalActionHtml = `<button disabled class="w-full py-4 px-6 rounded-xl bg-secondary-container text-secondary font-bold cursor-not-allowed">Viewer Only</button>`;
      } else if (currentUser.role === 'Procurement Officer') {
        approvalActionHtml = `
          <button onclick="submitApprovalAction(${q.id}, 'Request')" class="w-full py-4 px-6 rounded-xl ${btnClass} transition-all font-bold flex items-center justify-center gap-2">
            Submit for Review
            <span class="material-symbols-outlined">send</span>
          </button>
        `;
      } else if (currentUser.role === 'Admin') {
        // Admin sees direct actions
        approvalActionHtml = `
          <button onclick="submitApprovalAction(${q.id}, 'Approve')" class="w-full py-4 px-6 rounded-xl ${btnClass} transition-all font-bold flex items-center justify-center gap-2">
            Admin Approve
            <span class="material-symbols-outlined">verified</span>
          </button>
        `;
      }

      rowHtml += `
        <td class="p-6 border-l border-border-low-contrast bg-surface-container-lowest">
          ${approvalActionHtml}
        </td>
      `;
    });
    rowHtml += '</tr>';
    tbody.innerHTML += rowHtml;

  } catch (err) {
    console.error('Failed to load quotation comparison matrix:', err);
  }
}

// 8. Purchase Order & Invoice View Setup (PO & Invoice fetched from Database)
let currentInvoiceNum = 'INV-20231025-9011';
async function initInvoicesView() {
  try {
    const res = await fetch('/api/orders/active-document');
    if (!res.ok) {
      console.warn('Could not fetch dynamic document, showing static fallback.');
      return;
    }

    const { invoice, quotation, items } = await res.json();
    currentInvoiceNum = invoice.invoice_number;

    // Update PO details dynamically from SQLite
    const poNumberEl = document.querySelector('#content-po h1 + p span');
    const poDateEl = document.querySelector('#content-po p:last-child span');
    if (poNumberEl) poNumberEl.innerText = `#${invoice.po_number}`;
    if (poDateEl) poDateEl.innerText = new Date(invoice.po_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});

    // Update Vendor details dynamically from SQLite
    const vendorDetailsContainer = document.querySelectorAll('#content-po .grid-cols-2 > div');
    if (vendorDetailsContainer.length >= 2) {
      vendorDetailsContainer[1].innerHTML = `
        <h4 class="font-label-md text-label-md uppercase text-secondary border-b border-border-low-contrast pb-2 mb-3">Vendor</h4>
        <div class="text-body-md leading-relaxed text-on-surface">
          <p class="font-bold">${quotation.vendor_name}</p>
          <p>${quotation.vendor_address}</p>
          <p class="mt-2 text-primary font-medium underline">${quotation.vendor_email}</p>
        </div>
      `;
    }

    // Populate PO Items Tbody dynamically from SQLite
    const poTbody = document.querySelector('#content-po table tbody');
    if (poTbody) {
      poTbody.innerHTML = '';
      items.forEach(itm => {
        const itemTotal = itm.quantity * itm.unit_price;
        poTbody.innerHTML += `
          <tr>
            <td class="py-4 px-4 border-b border-border-low-contrast">
              <p class="font-bold">${itm.description}</p>
            </td>
            <td class="py-4 px-4 border-b border-border-low-contrast text-center">${itm.quantity}</td>
            <td class="py-4 px-4 border-b border-border-low-contrast text-right">$${itm.unit_price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td class="py-4 px-4 border-b border-border-low-contrast text-right font-medium">$${itemTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          </tr>
        `;
      });
    }

    // Recalculate and update PO Totals dynamically
    const subtotal = quotation.price;
    const tax = invoice.tax_amount;
    const total = invoice.total_amount;

    const poTotalsContainer = document.querySelector('#content-po .space-y-3');
    if (poTotalsContainer) {
      poTotalsContainer.innerHTML = `
        <div class="flex justify-between text-body-md">
          <span class="text-secondary">Subtotal</span>
          <span class="font-medium">$${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        </div>
        <div class="flex justify-between text-body-md">
          <span class="text-secondary">Tax (8.25%)</span>
          <span class="font-medium">$${tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        </div>
        <div class="flex justify-between text-body-md">
          <span class="text-secondary">Shipping</span>
          <span class="font-medium text-status-approved">FREE</span>
        </div>
        <div class="flex justify-between pt-3 border-t border-border-low-contrast">
          <span class="font-headline-sm text-headline-sm text-on-surface">Grand Total</span>
          <span class="font-headline-sm text-headline-sm text-primary">$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        </div>
      `;
    }

    // ----------------------------------------
    // Update Invoice details dynamically from SQLite
    // ----------------------------------------
    const invHeaderBlock = document.querySelector('#content-invoice h1 + p span');
    const invPoRef = document.querySelector('#content-invoice p:last-child span');
    if (invHeaderBlock) invHeaderBlock.innerText = `#${invoice.invoice_number}`;
    if (invPoRef) invPoRef.innerText = invoice.po_number;

    const invDetailsBlock = document.querySelectorAll('#content-invoice .grid-cols-2 > div');
    if (invDetailsBlock.length >= 2) {
      invDetailsBlock[0].innerHTML = `
        <h4 class="font-label-md text-label-md uppercase text-secondary border-b border-border-low-contrast pb-2 mb-3">Bill To</h4>
        <div class="text-body-md leading-relaxed text-on-surface">
          <p class="font-bold">VendorBridge HQ</p>
          <p>Accounts Payable Dept.</p>
          <p>4521 Innovation Way</p>
          <p>Austin, TX 78701</p>
        </div>
      `;
      invDetailsBlock[1].innerHTML = `
        <h4 class="font-label-md text-label-md uppercase text-secondary border-b border-border-low-contrast pb-2 mb-3">Details</h4>
        <div class="text-body-md leading-relaxed text-on-surface space-y-1">
          <p><span class="text-secondary">Issue Date:</span> ${new Date(invoice.created_at).toLocaleDateString()}</p>
          <p><span class="text-secondary">Due Date:</span> ${new Date(new Date(invoice.created_at).getTime() + 5*24*60*60*1000).toLocaleDateString()}</p>
          <p><span class="text-secondary">Payment Method:</span> ACH / Wire</p>
        </div>
      `;
    }

    const invVendorName = document.querySelector('#content-invoice h3');
    if (invVendorName) invVendorName.innerText = quotation.vendor_name.toUpperCase();

    // Populate Invoice items Tbody dynamically from SQLite
    const invTbody = document.querySelector('#content-invoice table tbody');
    if (invTbody) {
      invTbody.innerHTML = '';
      items.forEach(itm => {
        const itemTotal = itm.quantity * itm.unit_price;
        invTbody.innerHTML += `
          <tr>
            <td class="py-4 px-4 border-b border-border-low-contrast">${itm.description}</td>
            <td class="py-4 px-4 border-b border-border-low-contrast text-center">${itm.quantity}</td>
            <td class="py-4 px-4 border-b border-border-low-contrast text-right">$${itm.unit_price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td class="py-4 px-4 border-b border-border-low-contrast text-right font-medium">$${itemTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          </tr>
        `;
      });
    }

    // Populate Invoice totals dynamically
    const invTotals = document.querySelector('#content-invoice .w-80.space-y-3');
    if (invTotals) {
      invTotals.innerHTML = `
        <div class="flex justify-between text-body-md">
          <span class="text-secondary">Subtotal</span>
          <span class="font-medium">$${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        </div>
        <div class="flex justify-between text-body-md">
          <span class="text-secondary">Tax (8.25%)</span>
          <span class="font-medium">$${tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        </div>
        <div class="flex justify-between pt-3 border-t border-border-low-contrast">
          <span class="font-headline-sm text-headline-sm text-on-surface">Total Amount</span>
          <span class="font-headline-sm text-headline-sm text-on-surface">$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        </div>
        <div class="flex justify-between py-2 px-3 bg-surface-container-low rounded-lg mt-4">
          <span class="font-bold text-label-md text-on-surface">Balance Due</span>
          <span class="font-bold text-label-md text-on-surface" id="balance-value">$${invoice.status === 'Paid' ? '0.00' : total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        </div>
      `;
    }

    // Load initial paid state
    const badge = document.getElementById('paid-badge');
    const btn = document.getElementById('pay-btn');
    const balance = document.getElementById('balance-value');
    if (invoice.status === 'Paid') {
      if (badge) badge.className = "absolute top-12 right-12 border-4 border-status-approved text-status-approved font-black text-4xl px-8 py-3 rotate-[15deg] opacity-40 uppercase pointer-events-none";
      if (btn) {
        btn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Payment Confirmed';
        btn.className = "w-full py-3 bg-secondary text-white rounded-xl font-label-md text-label-md cursor-default flex items-center justify-center gap-2";
        btn.disabled = true;
      }
      if (balance) {
        balance.innerText = '$0.00';
        balance.className = "font-bold text-label-md text-status-approved";
      }
    }

  } catch (err) {
    console.error('Error binding dynamic active PO/Invoice details:', err);
  }

  // Hook up print, pdf and email handlers
  const printBtn = document.querySelector('main header button, main div button[onclick*="print"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Print'));
  if (printBtn) {
    printBtn.onclick = () => {
      window.print();
    };
  }

  const pdfBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Download PDF'));
  if (pdfBtn) {
    pdfBtn.onclick = downloadInvoicePDF;
  }

  const emailBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Send via Email'));
  if (emailBtn) {
    emailBtn.onclick = sendInvoiceByEmail;
  }
}

function downloadInvoicePDF() {
  const activeTab = document.getElementById('content-po').classList.contains('hidden') ? 'invoice' : 'po';
  const element = activeTab === 'po' ? document.querySelector('#content-po > div') : document.querySelector('#content-invoice > div.lg\\:col-span-2 > div');

  if (!element) {
    showToast('Failed to identify printable document', 'error');
    return;
  }

  showToast('Preparing PDF download...', 'info');

  const opt = {
    margin:       10,
    filename:     activeTab === 'po' ? 'Purchase_Order_PO-2024-0892.pdf' : `Invoice_${currentInvoiceNum}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save()
    .then(() => showToast('PDF downloaded successfully!', 'success'))
    .catch(err => {
      console.error(err);
      showToast('PDF download failed. Try using your browser Print (Ctrl+P)', 'error');
    });
}

async function sendInvoiceByEmail() {
  // PRE-POPULATE THE RECIPIENT INPUT WITH THE USER-REQUESTED EMAIL tsharma4563@gmail.com
  const email = prompt('Enter recipient email:', 'tsharma4563@gmail.com');
  if (!email) return;

  showToast('Sending Invoice to vendor...', 'info');

  try {
    const res = await fetch('/api/invoices/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, invoice_number: currentInvoiceNum })
    });

    if (res.ok) {
      const info = await res.json();
      showToast('Email sent and logged successfully!', 'success');
      if (info.previewUrl) {
        console.log('Test email preview URL:', info.previewUrl);
      }
    } else {
      showToast('Failed to dispatch email', 'error');
    }
  } catch (err) {
    showToast('Network error while dispatching invoice email', 'error');
  }
}

async function markPaid() {
  try {
    const res = await fetch('/api/invoices/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_number: currentInvoiceNum })
    });

    if (res.ok) {
      const badge = document.getElementById('paid-badge');
      const btn = document.getElementById('pay-btn');
      const balance = document.getElementById('balance-value');
      
      if (badge) {
        badge.classList.remove('opacity-0');
        badge.classList.add('opacity-40');
      }
      
      if (btn) {
        btn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Payment Confirmed';
        btn.className = "w-full py-3 bg-secondary text-white rounded-xl font-label-md text-label-md cursor-default flex items-center justify-center gap-2";
        btn.disabled = true;
      }

      if (balance) {
        balance.innerText = '$0.00';
        balance.classList.add('text-status-approved');
      }

      // Atmospheric flash effect
      const flash = document.createElement('div');
      flash.className = 'fixed inset-0 bg-status-approved pointer-events-none z-[100] opacity-0 transition-opacity duration-300';
      document.body.appendChild(flash);
      setTimeout(() => flash.classList.add('opacity-5'), 50);
      setTimeout(() => flash.classList.remove('opacity-5'), 400);

      showToast('Invoice marked as paid in DB', 'success');
    }
  } catch (e) {
    console.error(e);
  }
}

// 9. RFQ View setup (Dynamic view loader for the empty RFQ.html template)
function initRFQView() {
  const main = document.querySelector('main');
  if (main) {
    main.className = 'ml-64 min-h-screen flex flex-col overflow-hidden';
    main.innerHTML = `
      <header class="flex justify-between items-center h-16 px-gutter w-full sticky top-0 z-40 bg-surface-container-lowest border-b border-border-low-contrast">
        <div class="flex items-center gap-4 flex-1">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">RFQ Creation & Management</h2>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right">
            <p class="font-label-md text-on-surface">${currentUser.name}</p>
            <p class="text-[10px] text-secondary uppercase font-bold">${currentUser.role}</p>
          </div>
        </div>
      </header>

      <div class="flex-1 p-stack-lg overflow-y-auto max-w-[1280px] mx-auto w-full space-y-8">
        <div class="flex justify-between items-end">
          <div>
            <h3 class="text-xl font-bold">Request for Quotations</h3>
            <p class="text-secondary text-sm">Issue procurement bids and assign suppliers.</p>
          </div>
          ${currentUser.role !== 'Vendor' ? `
            <button onclick="openCreateRFQModal()" class="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-label-md text-label-md flex items-center gap-2 shadow-sm hover:opacity-90 transition-all">
              <span class="material-symbols-outlined text-[20px]">add</span> Create RFQ
            </button>
          ` : ''}
        </div>

        <div class="bg-white rounded-xl border border-border-low-contrast overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-surface-subtle border-b border-border-low-contrast">
                <tr>
                  <th class="px-6 py-4 font-label-md text-secondary uppercase">RFQ ID</th>
                  <th class="px-6 py-4 font-label-md text-secondary uppercase">Title</th>
                  <th class="px-6 py-4 font-label-md text-secondary uppercase">Quantity</th>
                  <th class="px-6 py-4 font-label-md text-secondary uppercase">Deadline</th>
                  <th class="px-6 py-4 font-label-md text-secondary uppercase">Status</th>
                  <th class="px-6 py-4 font-label-md text-secondary uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="rfq-table-body" class="divide-y divide-border-low-contrast">
                <!-- Loaded Dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    loadRFQs();
  }
}

async function loadRFQs() {
  try {
    const res = await fetch('/api/rfqs');
    if (res.ok) {
      const rfqs = await res.json();
      const tbody = document.getElementById('rfq-table-body');
      if (tbody) {
        tbody.innerHTML = '';
        if (rfqs.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-secondary">No active RFQs found.</td></tr>`;
        } else {
          rfqs.forEach(rfq => {
            let statusColor = 'text-status-info bg-status-info/10';
            if (rfq.status === 'Completed') statusColor = 'text-status-approved bg-status-approved/10';
            else if (rfq.status === 'Closed') statusColor = 'text-status-rejected bg-status-rejected/10';

            // Show submit quotation button for vendors if Active
            let actionsHtml = `<button onclick="viewQuotationDetails(${rfq.id})" class="text-primary font-label-md text-label-md px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary hover:text-white transition-all">View Quotes</button>`;
            
            if (currentUser.role === 'Vendor') {
              if (rfq.status === 'Active') {
                actionsHtml = `<button onclick="openSubmitQuotationModal(${rfq.id})" class="bg-status-approved text-white font-label-md text-label-md px-3 py-1.5 rounded-lg hover:opacity-90 transition-all">Submit Quote (Add Items)</button>`;
              } else {
                actionsHtml = `<span class="text-secondary text-sm">Completed</span>`;
              }
            }

            tbody.innerHTML += `
              <tr class="hover:bg-primary/5 transition-colors">
                <td class="px-6 py-4 font-data-tabular">#RFQ-${rfq.id}</td>
                <td class="px-6 py-4">
                  <p class="font-bold text-on-surface">${rfq.title}</p>
                  <p class="text-secondary text-xs">${rfq.description}</p>
                </td>
                <td class="px-6 py-4 font-data-tabular">${rfq.quantity} units</td>
                <td class="px-6 py-4 font-body-sm text-secondary">${rfq.deadline}</td>
                <td class="px-6 py-4">
                  <span class="px-2 py-0.5 rounded-full font-label-md text-[10px] uppercase ${statusColor}">${rfq.status}</span>
                </td>
                <td class="px-6 py-4 text-right">
                  ${actionsHtml}
                </td>
              </tr>
            `;
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to load RFQs:', err);
  }
}

// 10. Modals Implementation
function createModal(id, contentHtml) {
  let modal = document.getElementById(id);
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-window relative max-w-xl">
      <button onclick="closeModal('${id}')" class="absolute top-4 right-4 text-secondary hover:text-on-surface">
        <span class="material-symbols-outlined">close</span>
      </button>
      ${contentHtml}
    </div>
  `;
  document.body.appendChild(modal);
  
  // Trigger animation
  setTimeout(() => modal.classList.add('active'), 50);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
}

// A. Create RFQ Modal
async function openCreateRFQModal() {
  // Fetch vendors to assign
  const res = await fetch('/api/vendors');
  const vendors = await res.json();

  let vendorsChecklist = '';
  vendors.forEach(v => {
    if (v.status === 'Approved') {
      vendorsChecklist += `
        <label class="flex items-center gap-2 p-2 hover:bg-surface rounded cursor-pointer">
          <input type="checkbox" name="assigned_vendors" value="${v.id}" class="rounded border-border-low-contrast text-primary focus:ring-primary/20">
          <span class="text-sm font-medium text-on-surface">${v.name} (${v.category})</span>
        </label>
      `;
    }
  });

  const formHtml = `
    <h3 class="text-xl font-bold mb-4">Create Request for Quotation (RFQ)</h3>
    <form id="create-rfq-form" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold mb-1">RFQ Title</label>
        <input type="text" id="rfq-title" required class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="e.g. Server Rack Purchases">
      </div>
      <div>
        <label class="block text-sm font-semibold mb-1">Description</label>
        <textarea id="rfq-desc" required rows="3" class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="Details about specific models or specifications..."></textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold mb-1">Required Quantity</label>
          <input type="number" id="rfq-qty" required min="1" class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="10">
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">Deadline Date</label>
          <input type="date" id="rfq-deadline" required class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm">
        </div>
      </div>
      <div>
        <label class="block text-sm font-semibold mb-2">Assign Supplier / Vendors</label>
        <div class="border border-border-low-contrast rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
          ${vendorsChecklist}
        </div>
      </div>
      
      <button type="submit" class="w-full py-3 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 transition-opacity">Submit RFQ</button>
    </form>
  `;

  createModal('create-rfq-modal', formHtml);

  document.getElementById('create-rfq-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('rfq-title').value;
    const description = document.getElementById('rfq-desc').value;
    const quantity = parseInt(document.getElementById('rfq-qty').value);
    const deadline = document.getElementById('rfq-deadline').value;

    const checkboxes = document.querySelectorAll('input[name="assigned_vendors"]:checked');
    const vendorIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (vendorIds.length === 0) {
      alert('Please assign at least one vendor to this RFQ.');
      return;
    }

    try {
      const res = await fetch('/api/rfqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, quantity, deadline, vendorIds })
      });

      if (res.ok) {
        closeModal('create-rfq-modal');
        showToast('RFQ successfully created and suppliers notified!', 'success');
        if (window.location.pathname.includes('/rfqs')) {
          loadRFQs();
        }
      } else {
        alert('Failed to save RFQ');
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// B. Submit Quotation Modal (VENDORS ONLY CAN ADD ITEMS)
function openSubmitQuotationModal(rfqId) {
  if (currentUser.role !== 'Vendor') {
    showToast('Only vendors can submit quotations and add items', 'error');
    return;
  }

  const formHtml = `
    <h3 class="text-xl font-bold mb-4">Submit Quotation & Add Items</h3>
    <p class="text-xs text-secondary mb-4">Add your itemized list. The quotation total will be calculated automatically.</p>
    
    <form id="submit-quote-form" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold mb-1">Delivery Lead Time (Days)</label>
        <input type="number" id="quote-timeline" required min="1" class="w-full border border-border-low-contrast rounded-lg p-2 text-sm" placeholder="14">
      </div>
      <div>
        <label class="block text-sm font-semibold mb-1">Terms, Warranty & Notes</label>
        <input type="text" id="quote-notes" class="w-full border border-border-low-contrast rounded-lg p-2 text-sm" placeholder="Net 30, 24 Months Warranty">
      </div>

      <div class="border-t pt-4">
        <div class="flex justify-between items-center mb-2">
          <label class="block text-sm font-bold">Line Items List</label>
          <button type="button" onclick="addQuoteItemRow()" class="text-xs bg-primary text-white px-2 py-1 rounded hover:bg-primary-container">➕ Add Item</button>
        </div>
        
        <div id="quote-items-container" class="space-y-2 max-h-48 overflow-y-auto">
          <!-- Items Rows Go Here -->
          <div class="flex gap-2 items-center quote-item-row bg-surface p-2 rounded">
            <input type="text" placeholder="Item Name / Desc" required class="flex-1 text-xs border rounded p-1 item-desc">
            <input type="number" placeholder="Qty" required min="1" class="w-16 text-xs border rounded p-1 item-qty" onchange="calculateQuoteModalTotal()">
            <input type="number" step="0.01" placeholder="Rate ($)" required class="w-20 text-xs border rounded p-1 item-rate" onchange="calculateQuoteModalTotal()">
            <button type="button" onclick="this.parentNode.remove(); calculateQuoteModalTotal();" class="text-error text-xs">❌</button>
          </div>
        </div>
      </div>

      <div class="flex justify-between items-center bg-surface-container-low p-3 rounded-lg mt-2">
        <span class="font-bold text-sm">Calculated Quotation Total:</span>
        <span class="font-black text-primary text-lg" id="modal-quote-total">$0.00</span>
      </div>
      
      <button type="submit" class="w-full py-3 bg-status-approved text-white rounded-xl font-bold hover:opacity-90 transition-opacity">Submit Quotation</button>
    </form>
  `;

  createModal('submit-quote-modal', formHtml);
  calculateQuoteModalTotal();

  document.getElementById('submit-quote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const delivery_timeline = parseInt(document.getElementById('quote-timeline').value);
    const notes = document.getElementById('quote-notes').value;

    const rows = document.querySelectorAll('.quote-item-row');
    const items = [];
    rows.forEach(r => {
      const desc = r.querySelector('.item-desc').value;
      const qty = parseInt(r.querySelector('.item-qty').value);
      const rate = parseFloat(r.querySelector('.item-rate').value);
      if (desc && qty && rate) {
        items.push({ description: desc, quantity: qty, unit_price: rate });
      }
    });

    if (items.length === 0) {
      alert('You must add at least one item.');
      return;
    }

    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfq_id: rfqId, delivery_timeline, notes, items })
      });

      if (res.ok) {
        closeModal('submit-quote-modal');
        showToast('Your quotation with items has been submitted!', 'success');
        loadRFQs();
      } else {
        const txt = await res.text();
        alert(txt || 'Failed to submit quote');
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// Global functions for quote items modal
window.addQuoteItemRow = function() {
  const container = document.getElementById('quote-items-container');
  if (container) {
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center quote-item-row bg-surface p-2 rounded';
    row.innerHTML = `
      <input type="text" placeholder="Item Name / Desc" required class="flex-1 text-xs border rounded p-1 item-desc">
      <input type="number" placeholder="Qty" required min="1" class="w-16 text-xs border rounded p-1 item-qty" onchange="calculateQuoteModalTotal()">
      <input type="number" step="0.01" placeholder="Rate ($)" required class="w-20 text-xs border rounded p-1 item-rate" onchange="calculateQuoteModalTotal()">
      <button type="button" onclick="this.parentNode.remove(); calculateQuoteModalTotal();" class="text-error text-xs">❌</button>
    `;
    container.appendChild(row);
  }
};

window.calculateQuoteModalTotal = function() {
  const rows = document.querySelectorAll('.quote-item-row');
  let total = 0;
  rows.forEach(r => {
    const qty = parseInt(r.querySelector('.item-qty').value) || 0;
    const rate = parseFloat(r.querySelector('.item-rate').value) || 0;
    total += qty * rate;
  });
  const totalEl = document.getElementById('modal-quote-total');
  if (totalEl) {
    totalEl.innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  }
};

// C. Register Vendor Modal
function openRegisterVendorModal() {
  const formHtml = `
    <h3 class="text-xl font-bold mb-4">Register New Supplier / Vendor</h3>
    <form id="reg-vendor-form" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold mb-1">Company Name</label>
          <input type="text" id="vend-name" required class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="Global Logistics Inc.">
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">Category</label>
          <select id="vend-cat" class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm">
            <option value="IT Hardware">IT Hardware</option>
            <option value="Networking">Networking</option>
            <option value="Logistics">Logistics</option>
            <option value="Chemicals">Chemicals</option>
            <option value="Medical">Medical Supplies</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold mb-1">GST/Tax Registration ID</label>
          <input type="text" id="vend-gst" required class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="29AAAAA1111A1Z1">
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">Contact Email</label>
          <input type="email" id="vend-email" required class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="sales@globallog.com">
        </div>
      </div>
      <div>
        <label class="block text-sm font-semibold mb-1">Contact Phone</label>
        <input type="text" id="vend-phone" required class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="+1-555-0811">
      </div>
      <div>
        <label class="block text-sm font-semibold mb-1">Corporate Address</label>
        <textarea id="vend-address" required rows="2" class="w-full border border-border-low-contrast rounded-lg p-2.5 text-sm" placeholder="Street name, suite, city, state"></textarea>
      </div>
      
      <button type="submit" class="w-full py-3 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 transition-opacity">Submit Registration</button>
    </form>
  `;

  createModal('reg-vendor-modal', formHtml);

  document.getElementById('reg-vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('vend-name').value;
    const category = document.getElementById('vend-cat').value;
    const gst_number = document.getElementById('vend-gst').value;
    const contact_email = document.getElementById('vend-email').value;
    const contact_phone = document.getElementById('vend-phone').value;
    const address = document.getElementById('vend-address').value;

    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, gst_number, contact_email, contact_phone, address })
      });

      if (res.ok) {
        closeModal('reg-vendor-modal');
        showToast('Vendor registration request submitted successfully!', 'success');
        refreshCurrentPageData();
      } else {
        const text = await res.text();
        alert(text || 'Failed to register vendor');
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// D. Vendors Directory List Modal
async function openVendorsModal() {
  const res = await fetch('/api/vendors');
  const vendors = await res.json();

  let vendorsRows = '';
  vendors.forEach(v => {
    let statBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] bg-status-approved/10 text-status-approved uppercase font-bold">Approved</span>`;
    if (v.status === 'Pending') {
      statBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] bg-status-pending/10 text-status-pending uppercase font-bold">Pending</span>`;
    } else if (v.status === 'Rejected') {
      statBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] bg-status-rejected/10 text-status-rejected uppercase font-bold">Rejected</span>`;
    }

    vendorsRows += `
      <tr class="border-b border-border-low-contrast">
        <td class="py-3 px-2 font-bold text-on-surface">${v.name}</td>
        <td class="py-3 px-2 text-sm text-secondary">${v.category}</td>
        <td class="py-3 px-2 text-xs font-mono text-secondary">${v.gst_number}</td>
        <td class="py-3 px-2 text-sm text-on-surface">${v.contact_email}</td>
        <td class="py-3 px-2 text-center text-sm font-bold text-status-pending">★ ${v.rating.toFixed(1)}</td>
        <td class="py-3 px-2 text-center">${statBadge}</td>
      </tr>
    `;
  });

  const contentHtml = `
    <h3 class="text-xl font-bold mb-4">Vendor Directory</h3>
    <div class="overflow-y-auto max-h-[400px]">
      <table class="w-full text-left border-collapse">
        <thead class="bg-surface-subtle border-b border-border-low-contrast">
          <tr>
            <th class="py-2 px-2 text-xs text-secondary uppercase font-bold">Vendor Name</th>
            <th class="py-2 px-2 text-xs text-secondary uppercase font-bold">Category</th>
            <th class="py-2 px-2 text-xs text-secondary uppercase font-bold">GST Number</th>
            <th class="py-2 px-2 text-xs text-secondary uppercase font-bold">Email</th>
            <th class="py-2 px-2 text-xs text-secondary uppercase font-bold text-center">Rating</th>
            <th class="py-2 px-2 text-xs text-secondary uppercase font-bold text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${vendorsRows}
        </tbody>
      </table>
    </div>
    <div class="mt-6 flex justify-end">
      <button onclick="closeModal('vendors-modal'); openRegisterVendorModal();" class="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md">Register New Vendor</button>
    </div>
  `;

  createModal('vendors-modal', contentHtml);
}

// E. Analytics Charts Modal
function openAnalyticsModal() {
  const contentHtml = `
    <h3 class="text-xl font-bold mb-4">Procurement & Spent Analytics</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h4 class="font-bold text-sm text-secondary mb-2 uppercase">Spending per Vendor Category</h4>
        <canvas id="catSpendChart" class="max-h-60"></canvas>
      </div>
      <div>
        <h4 class="font-bold text-sm text-secondary mb-2 uppercase">Procurement Activity Trends (2026)</h4>
        <canvas id="monthlyTrendChart" class="max-h-60"></canvas>
      </div>
    </div>
    <div class="mt-6 flex justify-end">
      <button onclick="closeModal('analytics-modal')" class="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md">Close Analytics</button>
    </div>
  `;

  createModal('analytics-modal', contentHtml);

  // Initialize charts on next tick
  setTimeout(() => {
    const ctx1 = document.getElementById('catSpendChart').getContext('2d');
    new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['IT Hardware', 'Networking', 'Logistics', 'Consulting'],
        datasets: [{
          data: [65, 20, 10, 5],
          backgroundColor: ['#504bc0', '#3B82F6', '#10B981', '#F59E0B'],
          borderWidth: 1
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    const ctx2 = document.getElementById('monthlyTrendChart').getContext('2d');
    new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Spend ($k)',
          data: [45, 80, 55, 120, 95, 64],
          backgroundColor: '#6965db',
          borderRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }, 100);
}

// F. Email Simulator Outbox Modal
async function openEmailSimulatorModal() {
  try {
    const res = await fetch('/api/emails');
    const emails = await res.json();

    let emailCards = '';
    if (emails.length === 0) {
      emailCards = `<p class="text-center text-secondary py-8">No emails generated yet.</p>`;
    } else {
      emails.forEach(e => {
        emailCards += `
          <div class="email-sim-card">
            <div class="flex justify-between items-start text-xs text-secondary border-b border-border-low-contrast pb-2 mb-2">
              <div>
                <span class="font-bold">TO:</span> ${e.to}<br>
                <span class="font-bold">DATE:</span> ${new Date(e.timestamp).toLocaleString()}
              </div>
              <span class="px-2 py-0.5 bg-primary/10 text-primary rounded font-bold uppercase text-[9px]">SENT</span>
            </div>
            <p class="font-bold text-sm text-on-surface mb-2">${e.subject}</p>
            <div class="email-sim-body-preview text-on-surface">
              ${e.html}
            </div>
          </div>
        `;
      });
    }

    const contentHtml = `
      <div class="flex justify-between items-center mb-4 border-b pb-3">
        <h3 class="text-xl font-bold">Email Simulator (Outbox Outflow)</h3>
        <button onclick="clearSimulatedEmails()" class="text-xs text-error font-bold flex items-center gap-1 hover:underline">
          <span class="material-symbols-outlined text-[14px]">delete</span> Clear Logs
        </button>
      </div>
      <div class="email-sim-list custom-scrollbar">
        ${emailCards}
      </div>
      <div class="mt-6 flex justify-end">
        <button onclick="closeModal('email-sim-modal')" class="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md">Close Simulator</button>
      </div>
    `;

    createModal('email-sim-modal', contentHtml);
  } catch (err) {
    console.error(err);
  }
}

async function clearSimulatedEmails() {
  if (confirm('Clear simulated email logs?')) {
    const res = await fetch('/api/emails/clear', { method: 'POST' });
    if (res.ok) {
      showToast('Simulator outbox logs cleared', 'info');
      closeModal('email-sim-modal');
    }
  }
}

// 11. Core Utility Functions
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function refreshCurrentPageData() {
  setupPageForUser();
}

// 12. Run checks on file load
window.addEventListener('DOMContentLoaded', checkSession);
