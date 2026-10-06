/**
 * Marriage Hall Manager — 100% Offline Single Page & PWA Engine
 * Developed by PK-RajWolrd
 */

class MarriageHallApp {
  constructor() {
    this.db = null;
    this.currentView = 'dashboard';
    this.currentCalendarDate = new Date();
    this.selectedCalendarDate = this.getLocalDateString(new Date());
    this.enteredPin = '';
    this.pinSetupMode = false;
    this.pendingPin = '';
    this.reportTimeframe = 'all';
    this.deferredPwaPrompt = null;
    this.notificationTimer = null;
    this.audioContext = null;
    this.lastRefreshAt = 0;

    // State caches
    this.halls = [];
    this.customers = [];
    this.bookings = [];
    this.payments = [];
    this.expenses = [];
    this.catering = [];
    this.decorations = [];
    this.staff = [];
    this.settings = {
      hallName: 'Royal Palace Banquet',
      address: 'Club Road, G-6, Islamabad',
      phone: '0300-1234567',
      whatsapp: '0300-1234567',
      currency: 'Rs.',
      taxRate: 0,
      invoiceFooter: 'Thank you for choosing our Marriage Hall. We wish you a blissful celebration!',
      pinEnabled: true,
      pinCode: '1234',
      soundEnabled: true,
      theme: 'light'
    };

    this.init();
  }

  async init() {
    this.initTheme();
    // Ask the browser to keep this app's local data from automatic storage eviction.
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    await this.initIndexedDB();
    await this.loadAllData();
    this.setupEventListeners();
    this.checkPinLockOnLaunch();
    this.renderAll();
    this.startNotificationMonitor();
    this.initPwaInstall();
    this.detectPlatform();
    this.setupBackPressHandler();
    this.registerServiceWorker();
  }

  // --- IndexedDB Storage Engine ---
  initIndexedDB() {
    return new Promise((resolve) => {
      const request = indexedDB.open('MarriageHallDB_v1', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        const stores = ['halls', 'customers', 'bookings', 'payments', 'expenses', 'catering', 'decorations', 'staff', 'settings'];
        stores.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id' });
          }
        });
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = () => {
        console.warn('IndexedDB fallback to localStorage');
        resolve(null);
      };
    });
  }

  async getAllFromStore(storeName) {
    const readLocalBackup = () => {
      try {
        const data = localStorage.getItem(`mhm_${storeName}`);
        return data ? JSON.parse(data) : [];
      } catch (err) {
        console.warn(`Could not read local backup for ${storeName}`, err);
        return [];
      }
    };
    if (!this.db) {
      return readLocalBackup();
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => {
          const records = req.result || [];
          if (records.length) {
            try { localStorage.setItem(`mhm_${storeName}`, JSON.stringify(records)); } catch (err) {
              console.warn(`Could not update local backup for ${storeName}`, err);
            }
            resolve(records);
            return;
          }

          // Recover records from the local backup if IndexedDB was cleared or recreated.
          const backup = readLocalBackup();
          if (backup.length) {
            try {
              const restoreTx = this.db.transaction(storeName, 'readwrite');
              backup.forEach(item => restoreTx.objectStore(storeName).put(item));
            } catch (err) {
              console.warn(`Could not restore ${storeName} to IndexedDB`, err);
            }
          }
          resolve(backup);
        };
        req.onerror = () => resolve(readLocalBackup());
      } catch (err) {
        resolve(readLocalBackup());
      }
    });
  }

  async saveToStore(storeName, item) {
    const saveLocalBackup = () => {
      const list = this.getLocalStoreList(storeName);
      const idx = list.findIndex(x => x.id === item.id);
      if (idx >= 0) list[idx] = item; else list.push(item);
      localStorage.setItem(`mhm_${storeName}`, JSON.stringify(list));
    };
    if (!this.db) {
      saveLocalBackup();
      return item;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(item);
        req.onsuccess = () => {
          try { saveLocalBackup(); } catch (err) {
            console.warn(`Could not back up ${storeName} to local storage`, err);
          }
          resolve(item);
        };
        req.onerror = (e) => {
          try { saveLocalBackup(); resolve(item); } catch (backupError) { reject(e); }
        };
      } catch (err) {
        try { saveLocalBackup(); resolve(item); } catch (backupError) { reject(err); }
      }
    });
  }

  getLocalStoreList(storeName) {
    try {
      return JSON.parse(localStorage.getItem(`mhm_${storeName}`) || '[]');
    } catch (err) {
      return [];
    }
  }

  async deleteFromStore(storeName, id) {
    const removeLocalBackup = () => {
      const list = this.getLocalStoreList(storeName).filter(x => x.id !== id);
      localStorage.setItem(`mhm_${storeName}`, JSON.stringify(list));
    };
    if (!this.db) {
      removeLocalBackup();
      return true;
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(id);
        req.onsuccess = () => {
          try { removeLocalBackup(); } catch (err) { console.warn(`Could not update local backup for ${storeName}`, err); }
          resolve(true);
        };
        req.onerror = () => resolve(false);
      } catch (err) {
        try { removeLocalBackup(); resolve(true); } catch (backupError) { resolve(false); }
      }
    });
  }

  async loadAllData() {
    const [halls, customers, bookings, payments, expenses, catering, decorations, staff, savedSettings] = await Promise.all([
      this.getAllFromStore('halls'),
      this.getAllFromStore('customers'),
      this.getAllFromStore('bookings'),
      this.getAllFromStore('payments'),
      this.getAllFromStore('expenses'),
      this.getAllFromStore('catering'),
      this.getAllFromStore('decorations'),
      this.getAllFromStore('staff'),
      this.getAllFromStore('settings')
    ]);

    this.halls = halls;
    this.customers = customers;
    this.bookings = bookings;
    this.payments = payments;
    this.expenses = expenses;
    this.catering = catering;
    this.decorations = decorations;
    this.staff = staff;

    if (savedSettings && savedSettings.length) {
      savedSettings.forEach(s => { this.settings[s.id] = s.value; });
    }

    const pinMigrationKey = 'mhm_pin_default_1234_v1';
    if (localStorage.getItem(pinMigrationKey) !== 'done') {
      this.settings.pinCode = '1234';
      localStorage.setItem(pinMigrationKey, 'done');
    }
    if (!/^\d{4}$/.test(String(this.settings.pinCode || ''))) this.settings.pinCode = '1234';
    const pinEnabledChanged = this.settings.pinEnabled !== true;
    this.settings.pinEnabled = true;
    const pinCodeSaved = savedSettings?.some(s => s.id === 'pinCode' && s.value === this.settings.pinCode);
    const pinEnabledSaved = savedSettings?.some(s => s.id === 'pinEnabled' && s.value === true);
    if (!pinCodeSaved) await this.saveToStore('settings', { id: 'pinCode', value: this.settings.pinCode });
    if (pinEnabledChanged && !pinEnabledSaved) await this.saveToStore('settings', { id: 'pinEnabled', value: true });

  }

  async refreshSavedData() {
    const now = Date.now();
    if (now - this.lastRefreshAt < 1000) return;
    this.lastRefreshAt = now;
    const activeElement = document.activeElement;
    if (activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(activeElement.tagName)) return;
    const openModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (openModal) return;
    await this.loadAllData();
    this.renderAll();
  }

  async removeBuiltInDemoData() {
    const collections = [
      ['halls', this.halls],
      ['customers', this.customers],
      ['bookings', this.bookings],
      ['payments', this.payments],
      ['expenses', this.expenses],
      ['catering', this.catering],
      ['decorations', this.decorations],
      ['staff', this.staff]
    ];
    for (const [storeName, items] of collections) {
      const demoItems = items.filter(item => String(item.id || '').includes('demo'));
      for (const item of demoItems) await this.deleteFromStore(storeName, item.id);
      if (demoItems.length) {
        const remaining = items.filter(item => !String(item.id || '').includes('demo'));
        if (storeName === 'halls') this.halls = remaining;
        if (storeName === 'customers') this.customers = remaining;
        if (storeName === 'bookings') this.bookings = remaining;
        if (storeName === 'payments') this.payments = remaining;
        if (storeName === 'expenses') this.expenses = remaining;
        if (storeName === 'catering') this.catering = remaining;
        if (storeName === 'decorations') this.decorations = remaining;
        if (storeName === 'staff') this.staff = remaining;
      }
    }
  }

  // --- UI Theme & Setup ---
  initTheme() {
    const saved = localStorage.getItem('mhm_theme') || this.settings.theme || 'light';
    document.body.setAttribute('data-theme', saved);
    this.updateThemeToggleIcon(saved);
  }

  toggleTheme() {
    const current = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', current);
    localStorage.setItem('mhm_theme', current);
    this.settings.theme = current;
    this.saveToStore('settings', { id: 'theme', value: current });
    this.updateThemeToggleIcon(current);
    this.renderCharts();
  }

  updateThemeToggleIcon(theme) {
    const lightIcon = document.querySelector('.theme-icon-light');
    const darkIcon = document.querySelector('.theme-icon-dark');
    if (theme === 'dark') {
      lightIcon?.classList.add('hidden');
      darkIcon?.classList.remove('hidden');
    } else {
      lightIcon?.classList.remove('hidden');
      darkIcon?.classList.add('hidden');
    }
  }

  setupEventListeners() {
    document.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button, a, select, input[type="checkbox"], input[type="radio"]')) {
        this.playClickSound();
      }
    });
    document.addEventListener('change', (event) => {
      if (!event.target.classList.contains('row-select')) return;
      const target = event.target.closest('tbody') || event.target.closest('[data-selection-ready="true"]');
      const toolbar = target?.closest('table')?.previousElementSibling || target?.previousElementSibling;
      if (target && toolbar?.classList.contains('selection-toolbar')) this.updateSelectionToolbar(target, toolbar);
    });
    document.getElementById('custCNIC')?.addEventListener('input', (event) => {
      event.target.value = this.formatCnicInput(event.target.value);
    });
    ['custPhone', 'custWhatsApp', 'bookingPhone', 'settingPhone', 'settingWhatsApp', 'stfPhone', 'waPhoneInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', (event) => {
        event.target.value = this.formatPhoneInput(event.target.value);
      });
    });
    ['reportStartDate', 'reportEndDate'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.applyCustomReportDates());
    });

    // Navigation routing
    window.addEventListener('hashchange', () => this.handleHashChange());
    window.addEventListener('pageshow', () => this.refreshSavedData());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.refreshSavedData();
    });
    document.querySelectorAll('.sidebar-nav .nav-item, .mobile-bottom-nav .bnav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const view = el.getAttribute('data-view');
        if (view) {
          this.navigate(view);
        }
      });
    });

    // Mobile sidebar toggle
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.add('open');
    });
    document.getElementById('sidebarCloseBtn')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.remove('open');
    });

    // Global Search
    const searchInput = document.getElementById('globalSearchInput');
    searchInput?.addEventListener('input', (e) => this.handleGlobalSearch(e.target.value));
    document.getElementById('globalSearchClear')?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      document.getElementById('globalSearchResults')?.classList.add('hidden');
      document.getElementById('globalSearchClear')?.classList.add('hidden');
    });

    // Notification dropdown
    document.getElementById('notificationBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderNotifications();
      const dropdown = document.getElementById('notificationDropdown');
      const button = document.getElementById('notificationBtn');
      const isHidden = dropdown?.classList.toggle('hidden');
      button?.setAttribute('aria-expanded', String(!isHidden));
    });
    document.addEventListener('click', () => {
      document.getElementById('notificationDropdown')?.classList.add('hidden');
      document.getElementById('notificationBtn')?.setAttribute('aria-expanded', 'false');
    });

    // Theme toggle button
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => this.toggleTheme());

    // Date / time conflict check on booking inputs
    ['bookingHallId', 'bookingDate', 'bookingStartTime', 'bookingEndTime'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.checkBookingConflict());
    });

    // Window Resize / Orientation Change Handler for Responsive Charts
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.currentView === 'dashboard') {
          this.renderDashboardCharts();
        } else if (this.currentView === 'reports') {
          this.renderReports();
        }
        this.detectPlatform();
      }, 250);
    });

    // Keyboard Shortcuts (PC / Desktop accessibility)
    window.addEventListener('keydown', (e) => {
      const pinOverlay = document.getElementById('pinLockOverlay');
      if (!pinOverlay?.classList.contains('hidden') && !pinOverlay.classList.contains('expired-state')) {
        if (/^\d$/.test(e.key)) {
          e.preventDefault();
          this.playClickSound();
          this.enterPin(e.key);
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          this.playClickSound();
          this.backspacePin();
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          this.playClickSound();
          this.clearPin();
          return;
        }
      }
      if (e.key === 'Escape') {
        window.handleAndroidBackPress && window.handleAndroidBackPress();
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.openBookingModal();
      }
    });
  }

  handleHashChange() {
    const hash = window.location.hash.replace('#', '');
    if (hash) this.navigate(hash);
  }

  navigate(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.mobile-bottom-nav .bnav-item').forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    const sideNav = document.querySelector(`.sidebar-nav .nav-item[data-view="${viewName}"]`);
    if (sideNav) sideNav.classList.add('active');

    const bNav = document.querySelector(`.mobile-bottom-nav .bnav-item[data-view="${viewName}"]`);
    if (bNav) bNav.classList.add('active');

    document.getElementById('sidebar')?.classList.remove('open');
    window.location.hash = viewName;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh specific view data
    if (viewName === 'calendar') this.renderCalendar();
    if (viewName === 'dashboard') this.renderDashboard();
    if (viewName === 'reports') this.renderReports();
    if (viewName === 'whatsapp') this.renderWhatsAppView();
    if (viewName === 'invoices') this.renderInvoicesView();
  }

  toggleMobileMoreMenu(force) {
    const sheet = document.getElementById('moreSheetOverlay');
    if (force === undefined) sheet?.classList.toggle('hidden');
    else if (force) sheet?.classList.remove('hidden');
    else sheet?.classList.add('hidden');
  }

  // --- Date Conflict Detection Engine (CRITICAL) ---
  checkBookingConflict(excludeBookingId = null) {
    const hallId = document.getElementById('bookingHallId')?.value;
    const date = document.getElementById('bookingDate')?.value;
    const start = document.getElementById('bookingStartTime')?.value;
    const end = document.getElementById('bookingEndTime')?.value;

    const alertBox = document.getElementById('bookingConflictAlert');
    const submitBtn = document.getElementById('bookingSubmitBtn');
    if (!alertBox) return false;

    if (!hallId || !date || !start || !end) {
      alertBox.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
      return false;
    }

    const editId = excludeBookingId || document.getElementById('bookingEditId')?.value;

    // Check conflict against existing bookings
    const conflict = this.bookings.find(b => {
      if (b.id === editId) return false;
      if (b.hallId !== hallId || b.date !== date) return false;
      // Overlap calculation
      const bStart = b.startTime || '00:00';
      const bEnd = b.endTime || '23:59';
      return (start < bEnd && end > bStart);
    });

    if (conflict) {
      alertBox.classList.remove('hidden');
      document.getElementById('bookingConflictMessage').textContent = 
        `This hall is already booked for this date and time (${conflict.customerName} - ${conflict.startTime} to ${conflict.endTime}).`;
      if (submitBtn) submitBtn.disabled = true;
      return true;
    } else {
      alertBox.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
      return false;
    }
  }

  // --- Render All Modules ---
  renderAll() {
    this.renderDashboard();
    this.renderBookingsTable();
    this.renderHalls();
    this.renderCustomers();
    this.renderPayments();
    this.renderExpenses();
    this.renderCatering();
    this.renderDecorations();
    this.renderStaff();
    this.renderCalendar();
    this.selectCalendarDate(this.selectedCalendarDate || this.getLocalDateString());
    this.renderInvoicesView();
    this.renderReports();
    this.renderNotifications();
    this.populateSelectDropdowns();
    this.renderSettings();
    this.refreshSelectionToolbars();
  }

  refreshSelectionToolbars() {
    document.querySelectorAll('[data-selection-ready="true"]').forEach(target => {
      const toolbar = target.closest('table')?.previousElementSibling || target.previousElementSibling;
      if (toolbar?.classList.contains('selection-toolbar')) this.updateSelectionToolbar(target, toolbar);
    });
  }

  ensureSelectionToolbar(targetId, type) {
    const target = document.getElementById(targetId);
    if (!target || target.dataset.selectionReady === 'true') return;
    const toolbar = document.createElement('div');
    toolbar.className = 'selection-toolbar hidden';
    toolbar.dataset.selectionType = type;
    toolbar.innerHTML = `
      <label class="selection-all-label"><input type="checkbox" class="select-all-checkbox"> Select All</label>
      <span class="selection-count">0 selected</span>
      <button type="button" class="btn btn-sm btn-danger bulk-delete-btn" disabled>Delete Selected</button>
    `;
    const toolbarHost = target.closest('table') || target;
    toolbarHost.parentNode.insertBefore(toolbar, toolbarHost);
    target.dataset.selectionReady = 'true';
    toolbar.querySelector('.select-all-checkbox').addEventListener('change', (event) => {
      target.querySelectorAll('.row-select').forEach(box => { box.checked = event.target.checked; });
      this.updateSelectionToolbar(target, toolbar);
    });
    toolbar.querySelector('.bulk-delete-btn').addEventListener('click', () => this.bulkDeleteSelected(type, target, toolbar));
  }

  updateSelectionToolbar(target, toolbar) {
    const boxes = [...target.querySelectorAll('.row-select')];
    const selected = boxes.filter(box => box.checked).length;
    toolbar.classList.toggle('hidden', boxes.length === 0);
    toolbar.querySelector('.selection-count').textContent = `${selected} selected`;
    const bulkDeleteBtn = toolbar.querySelector('.bulk-delete-btn');
    const isInvoiceOrReceipt = ['invoice', 'receipt'].includes(toolbar.dataset.selectionType);
    if (isInvoiceOrReceipt) {
      bulkDeleteBtn.classList.toggle('hidden', selected === 0);
      bulkDeleteBtn.disabled = false;
    } else {
      bulkDeleteBtn.disabled = selected === 0;
    }
    const selectAll = toolbar.querySelector('.select-all-checkbox');
    selectAll.checked = boxes.length > 0 && selected === boxes.length;
    selectAll.indeterminate = selected > 0 && selected < boxes.length;
    boxes.forEach(box => {
      box.onchange = () => this.updateSelectionToolbar(target, toolbar);
    });
  }

  async bulkDeleteSelected(type, target, toolbar) {
    const ids = [...target.querySelectorAll('.row-select:checked')].map(box => box.value);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected ${type} record(s)?`)) return;
    const storeMap = { booking: 'bookings', invoice: 'bookings', hall: 'halls', customer: 'customers', payment: 'payments', receipt: 'payments', expense: 'expenses', catering: 'catering', decoration: 'decorations', staff: 'staff' };
    const storeName = storeMap[type];
    for (const id of ids) await this.deleteFromStore(storeName, id);
    const listName = { booking: 'bookings', invoice: 'bookings', hall: 'halls', customer: 'customers', payment: 'payments', receipt: 'payments', expense: 'expenses', catering: 'catering', decoration: 'decorations', staff: 'staff' }[type];
    this[listName] = this[listName].filter(item => !ids.includes(item.id));
    this.showToast(`${ids.length} record(s) deleted successfully`, 'success');
    this.renderAll();
  }

  formatCurrency(num) {
    const sym = this.settings.currency || 'Rs.';
    return `${sym} ${(Number(num) || 0).toLocaleString()}`;
  }

  getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatTime12(time) {
    if (!time) return '';
    const match = String(time).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return time;
    let hour = Number(match[1]);
    const minutes = match[2];
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${String(hour).padStart(2, '0')}:${minutes} ${period}`;
  }

  formatEventPeriod(time) {
    const parts = String(time || '').split(':');
    const hour = Number(parts[0]);
    const minute = Number(parts[1] || 0);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
    const totalMinutes = (hour * 60) + minute;
    if (totalMinutes >= 300 && totalMinutes <= 719) return 'Good Morning';
    if (totalMinutes >= 720 && totalMinutes <= 1019) return 'Good Afternoon';
    if (totalMinutes >= 1020 && totalMinutes <= 1259) return 'Good Evening';
    return '';
  }

  formatDateDisplay(date) {
    if (!date) return '';
    const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return date;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${match[3]}-${months[Number(match[2]) - 1]}-${match[1]}`;
  }

  formatCnicInput(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }

  formatPhoneInput(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 13);
    if (digits.startsWith('92') && digits.length > 2) {
      const local = digits.slice(2);
      return local.length > 3 ? `92${local.slice(0, 3)}-${local.slice(3)}` : `92${local}`;
    }
    return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
  }

  playClickSound() {
    try {
      if (this.settings.soundEnabled === false) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.audioContext) this.audioContext = new AudioContextClass();
      if (this.audioContext.state === 'suspended') this.audioContext.resume();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(680, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0.045, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.055);
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.055);
    } catch (error) {
      // Audio is optional and may be unavailable in some browsers.
    }
  }

  // --- Dashboard Renderer ---
  renderDashboard() {
    const totalBookings = this.bookings.length;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEvents = this.bookings.filter(b => b.date === todayStr);
    const upcomingEvents = this.bookings.filter(b => b.date > todayStr);
    const totalCustomers = this.customers.length;

    let totalRevenue = 0;
    let totalAdvancePaid = 0;
    let totalRemaining = 0;

    this.bookings.forEach(b => {
      totalRevenue += Number(b.totalAmount) || 0;
      totalAdvancePaid += Number(b.advancePayment) || 0;
      totalRemaining += Number(b.remainingAmount) || 0;
    });

    // Add extra recorded payments to paid tally if any
    const extraPayments = this.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const effectivePaid = Math.max(totalAdvancePaid, extraPayments);

    const occupiedHallsCount = new Set(todayEvents.map(e => e.hallId)).size;
    const totalHallsCount = this.halls.length;
    const availableHallsCount = Math.max(0, totalHallsCount - occupiedHallsCount);

    // Update Elements
    document.getElementById('statTotalBookings').textContent = totalBookings;
    document.getElementById('statTodayEvents').textContent = todayEvents.length;
    document.getElementById('statUpcomingEvents').textContent = upcomingEvents.length;
    document.getElementById('statTotalCustomers').textContent = totalCustomers;
    document.getElementById('statTotalRevenue').textContent = this.formatCurrency(totalRevenue);
    document.getElementById('statPaidAmount').textContent = this.formatCurrency(effectivePaid);
    document.getElementById('statRemainingAmount').textContent = this.formatCurrency(totalRemaining);
    document.getElementById('statAvailableHalls').textContent = availableHallsCount;
    document.getElementById('statTotalHalls').textContent = totalHallsCount;
    document.getElementById('statOccupiedHalls').textContent = occupiedHallsCount;

    document.getElementById('sidebarBookingBadge').textContent = totalBookings;
    document.getElementById('currentHallDisplayName').textContent = this.settings.hallName || 'Royal Palace Banquet';

    const now = new Date();
    document.getElementById('heroTodayDate').textContent = this.formatDateDisplay(now.toISOString().split('T')[0]);

    // Render Today Schedule
    const schedContainer = document.getElementById('dashboardScheduleList');
    if (schedContainer) {
      if (todayEvents.length === 0) {
        schedContainer.innerHTML = `<div class="empty-state p-4 text-center text-muted">No events booked for today. All halls available!</div>`;
      } else {
        schedContainer.innerHTML = todayEvents.map(e => `
          <div class="event-timeline-item" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: var(--primary-gold);">${e.eventType}</strong> — ${this.escapeHtml(e.customerName)}
              <div class="text-xs text-muted">${this.formatDateDisplay(e.date)} | ${this.getHallName(e.hallId)} | ${this.formatTime12(e.startTime)} - ${this.formatTime12(e.endTime)} | ${e.guests} Guests</div>
            </div>
            <span class="badge badge-${e.paymentStatus === 'Paid' ? 'paid' : 'partial'}">${e.paymentStatus}</span>
          </div>
        `).join('');
      }
    }

    // Render Recent Bookings Table
    const recentTable = document.getElementById('dashboardRecentBookingsTable');
    if (recentTable) {
      const recent = [...this.bookings].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
      if (recent.length === 0) {
        recentTable.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-muted">No bookings found. Click "+ New Booking" to start.</td></tr>`;
      } else {
        recentTable.innerHTML = recent.map(b => `
          <tr>
            <td><strong>${b.code || b.id.substring(0, 8)}</strong></td>
            <td>${this.escapeHtml(b.customerName)}</td>
            <td><span class="badge badge-emerald">${b.eventType}</span></td>
            <td>${this.formatDateDisplay(b.date)}</td>
            <td><span class="badge badge-${b.paymentStatus === 'Paid' ? 'paid' : (b.paymentStatus === 'Partially Paid' ? 'partial' : 'pending')}">${b.paymentStatus}</span></td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="app.previewInvoice('${b.id}')">Invoice</button>
            </td>
          </tr>
        `).join('');
      }
    }

    this.renderCharts();
  }

  // --- Pure Offline Canvas Charts (Zero CDN, 100% Offline) ---
  renderCharts() {
    this.drawMonthlyRevenueChart();
    this.drawEventTypeChart();
    this.drawExpenseCategoryChart();
  }

  drawMonthlyRevenueChart() {
    const canvas = document.getElementById('revenueChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.body.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTotals = new Array(12).fill(0);

    this.bookings.forEach(b => {
      if (b.date) {
        const m = new Date(b.date).getMonth();
        if (m >= 0 && m < 12) monthlyTotals[m] += (Number(b.totalAmount) || 0) / 1000; // in thousands
      }
    });

    const maxVal = Math.max(...monthlyTotals, 50);
    const padding = 35;
    const chartW = canvas.width - padding * 2;
    const chartH = canvas.height - padding * 2;
    const barW = chartW / 12 - 8;

    // Grid lines
    ctx.strokeStyle = isDark ? '#24304f' : '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${Math.round(maxVal - (maxVal / 4) * i)}k`, 5, y + 3);
    }

    // Bars
    monthlyTotals.forEach((val, idx) => {
      const x = padding + idx * (chartW / 12) + 4;
      const h = (val / maxVal) * chartH;
      const y = padding + chartH - h;

      const grad = ctx.createLinearGradient(0, y, 0, padding + chartH);
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(1, '#b45309');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, h, [4, 4, 0, 0]) : ctx.fillRect(x, y, barW, h);
      ctx.fill();

      // Month Label
      ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(months[idx], x + barW / 2, canvas.height - 10);
    });
  }

  drawEventTypeChart() {
    const canvas = document.getElementById('eventTypeChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.body.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const counts = {};
    this.bookings.forEach(b => {
      counts[b.eventType] = (counts[b.eventType] || 0) + 1;
    });

    const entries = Object.entries(counts);
    if (entries.length === 0) {
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText('No booking event records', canvas.width / 2, canvas.height / 2);
      return;
    }

    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#64748b'];
    const total = entries.reduce((a, [, c]) => a + c, 0);

    const centerX = 100;
    const centerY = canvas.height / 2;
    const radius = 65;
    let startAngle = -0.5 * Math.PI;

    entries.forEach(([type, count], i) => {
      const slice = (count / total) * (Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fill();
      startAngle += slice;
    });

    // Donut hole
    ctx.fillStyle = isDark ? '#131b2e' : '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 36, 0, Math.PI * 2);
    ctx.fill();

    // Center text
    ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${total} Total`, centerX, centerY + 4);

    // Legend
    let legendY = 30;
    entries.slice(0, 5).forEach(([type, count], i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(190, legendY, 12, 12);
      ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${type} (${count})`, 210, legendY + 10);
      legendY += 24;
    });
  }

  drawExpenseCategoryChart() {
    const canvas = document.getElementById('expenseChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.body.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totals = {};
    this.expenses.forEach(e => {
      totals[e.category] = (totals[e.category] || 0) + (Number(e.amount) || 0);
    });

    const entries = Object.entries(totals);
    if (entries.length === 0) {
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText('No expenses recorded', canvas.width / 2, canvas.height / 2);
      return;
    }

    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#06b6d4'];
    const grandTotal = entries.reduce((a, [, val]) => a + val, 0);

    const centerX = 90;
    const centerY = canvas.height / 2;
    const radius = 60;
    let startAngle = -0.5 * Math.PI;

    entries.forEach(([cat, val], i) => {
      const slice = (val / grandTotal) * (Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fill();
      startAngle += slice;
    });

    // Donut hole
    ctx.fillStyle = isDark ? '#131b2e' : '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Legend
    let legendY = 25;
    entries.slice(0, 5).forEach(([cat, val], i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(175, legendY, 10, 10);
      ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${cat}: ${this.formatCurrency(val)}`, 192, legendY + 9);
      legendY += 22;
    });
  }

  // --- Bookings Management CRUD ---
  renderBookingsTable() {
    const tbody = document.getElementById('bookingsTableBody');
    if (!tbody) return;
    this.ensureSelectionToolbar('bookingsMainTable', 'booking');

    const filtered = this.getFilteredBookings();
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center p-4 text-muted">No bookings found matching filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(b => `
      <tr>
        <td><input type="checkbox" class="row-select" value="${b.id}" aria-label="Select booking"> <strong>${b.code || b.id.substring(0, 8)}</strong></td>
        <td>
          <div class="font-bold">${this.escapeHtml(b.customerName)}</div>
          <div class="text-xs text-muted">${b.phone || ''}</div>
        </td>
        <td><span class="badge badge-emerald">${b.eventType}</span></td>
        <td>${this.getHallName(b.hallId)}</td>
        <td>
          <div>${this.formatDateDisplay(b.date)}</div>
          <div class="text-xs text-muted">${this.formatTime12(b.startTime)} - ${this.formatTime12(b.endTime)}</div>
        </td>
        <td>${b.guests}</td>
        <td><strong>${this.formatCurrency(b.totalAmount)}</strong></td>
        <td class="text-success">${this.formatCurrency(b.advancePayment)}</td>
        <td class="${Number(b.remainingAmount) > 0 ? 'text-danger font-bold' : 'text-muted'}">${this.formatCurrency(b.remainingAmount)}</td>
        <td><span class="badge badge-${b.paymentStatus === 'Paid' ? 'paid' : (b.paymentStatus === 'Partially Paid' ? 'partial' : 'pending')}">${b.paymentStatus}</span></td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-icon-action" title="View & Print Invoice" onclick="app.previewInvoice('${b.id}')">📄</button>
            <button class="btn-icon-action" title="Edit Booking" onclick="app.editBooking('${b.id}')">✏️</button>
            <button class="btn-icon-action" title="WhatsApp Message" onclick="app.openWhatsAppForBooking('${b.id}')">💬</button>
            <button class="btn-icon-action danger" title="Delete Booking" onclick="app.confirmDelete('booking', '${b.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  getFilteredBookings() {
    const q = (document.getElementById('bookingFilterSearch')?.value || '').toLowerCase();
    const hallId = document.getElementById('bookingFilterHall')?.value;
    const eventType = document.getElementById('bookingFilterEvent')?.value;
    const status = document.getElementById('bookingFilterStatus')?.value;
    const date = document.getElementById('bookingFilterDate')?.value;

    return this.bookings.filter(b => {
      if (q && !(b.customerName?.toLowerCase().includes(q) || b.code?.toLowerCase().includes(q) || b.phone?.includes(q))) return false;
      if (hallId && b.hallId !== hallId) return false;
      if (eventType && b.eventType !== eventType) return false;
      if (status && b.paymentStatus !== status) return false;
      if (date && b.date !== date) return false;
      return true;
    }).sort((a, b) => (b.date > a.date ? 1 : -1));
  }

  filterBookings() {
    this.renderBookingsTable();
  }

  resetBookingFilters() {
    if (document.getElementById('bookingFilterSearch')) document.getElementById('bookingFilterSearch').value = '';
    if (document.getElementById('bookingFilterHall')) document.getElementById('bookingFilterHall').value = '';
    if (document.getElementById('bookingFilterEvent')) document.getElementById('bookingFilterEvent').value = '';
    if (document.getElementById('bookingFilterStatus')) document.getElementById('bookingFilterStatus').value = '';
    if (document.getElementById('bookingFilterDate')) document.getElementById('bookingFilterDate').value = '';
    this.renderBookingsTable();
  }

  openBookingModal(selectedDate = null) {
    document.getElementById('bookingForm')?.reset();
    document.getElementById('bookingEditId').value = '';
    document.getElementById('bookingModalTitle').textContent = 'Create New Booking';
    document.getElementById('bookingConflictAlert')?.classList.add('hidden');
    document.getElementById('bookingSubmitBtn').disabled = false;

    // Generate unique friendly booking code
    const code = `BK-${Date.now().toString().slice(-6)}`;
    document.getElementById('bookingCode').value = code;

    if (selectedDate) {
      document.getElementById('bookingDate').value = selectedDate;
    } else {
      document.getElementById('bookingDate').value = this.getLocalDateString();
    }

    this.populateSelectDropdowns();
    this.recalculateBookingTotals();
    this.openModal('bookingModal');
  }

  openBookingModalForSelectedDate() {
    this.openBookingModal(this.selectedCalendarDate || this.getLocalDateString());
  }

  onBookingCustomerChange() {
    const custId = document.getElementById('bookingCustomerId')?.value;
    const cust = this.customers.find(c => c.id === custId);
    if (cust) {
      document.getElementById('bookingPhone').value = cust.phone || '';
    }
  }

  onBookingHallOrTimeChange() {
    const hallId = document.getElementById('bookingHallId')?.value;
    const hall = this.halls.find(h => h.id === hallId);
    if (hall && !document.getElementById('bookingEditId')?.value) {
      document.getElementById('bookingHallRent').value = hall.rent || 0;
    }
    this.recalculateBookingTotals();
    this.checkBookingConflict();
  }

  recalculateBookingTotals() {
    const guests = Number(document.getElementById('bookingGuests')?.value) || 0;
    const hallRent = Number(document.getElementById('bookingHallRent')?.value) || 0;
    const decorId = document.getElementById('bookingDecorationId')?.value;
    const cateringId = document.getElementById('bookingCateringId')?.value;

    let foodPerPerson = 0;
    const cat = this.catering.find(c => c.id === cateringId);
    if (cat) foodPerPerson = Number(cat.pricePerPerson) || 0;

    let decorPrice = 0;
    const dec = this.decorations.find(d => d.id === decorId);
    if (dec) decorPrice = Number(dec.price) || 0;

    // Auto-calculate food charges = guests * pricePerPerson
    const foodCharges = guests * foodPerPerson;
    document.getElementById('bookingFoodCharges').value = foodCharges;
    document.getElementById('bookingFoodRateNote').textContent = foodPerPerson > 0 ? `(${this.formatCurrency(foodPerPerson)}/person × ${guests} guests)` : '';
    document.getElementById('bookingGuestRateNote').textContent = `Per Person Rate: ${this.formatCurrency(foodPerPerson)}`;

    document.getElementById('bookingDecorCharges').value = decorPrice;
    const otherCharges = Number(document.getElementById('bookingOtherCharges')?.value) || 0;

    const total = hallRent + foodCharges + decorPrice + otherCharges;
    document.getElementById('bookingTotalAmount').value = total;

    const advance = Number(document.getElementById('bookingAdvancePayment')?.value) || 0;
    const remaining = Math.max(0, total - advance);
    document.getElementById('bookingRemainingAmount').value = remaining;

    let status = 'Pending';
    if (advance >= total && total > 0) status = 'Paid';
    else if (advance > 0) status = 'Partially Paid';

    document.getElementById('bookingPaymentStatusDisplay').value = status;
  }

  async saveBooking(e) {
    e.preventDefault();
    if (this.checkBookingConflict()) {
      this.showToast('Please resolve booking conflict before saving!', 'error');
      return;
    }

    const editId = document.getElementById('bookingEditId')?.value;
    const custId = document.getElementById('bookingCustomerId')?.value;
    const cust = this.customers.find(c => c.id === custId);
    const customerName = cust ? cust.name : document.getElementById('bookingCustomerId')?.options[document.getElementById('bookingCustomerId').selectedIndex]?.text;

    const totalAmount = Number(document.getElementById('bookingTotalAmount')?.value) || 0;
    const advancePayment = Number(document.getElementById('bookingAdvancePayment')?.value) || 0;
    const remainingAmount = Math.max(0, totalAmount - advancePayment);

    let paymentStatus = 'Pending';
    if (advancePayment >= totalAmount && totalAmount > 0) paymentStatus = 'Paid';
    else if (advancePayment > 0) paymentStatus = 'Partially Paid';

    const booking = {
      id: editId || 'bk_' + Date.now(),
      code: document.getElementById('bookingCode')?.value || `BK-${Date.now().toString().slice(-6)}`,
      customerId: custId,
      customerName: customerName,
      phone: document.getElementById('bookingPhone')?.value || '',
      eventType: document.getElementById('bookingEventType')?.value || 'Wedding',
      hallId: document.getElementById('bookingHallId')?.value,
      date: document.getElementById('bookingDate')?.value,
      startTime: document.getElementById('bookingStartTime')?.value,
      endTime: document.getElementById('bookingEndTime')?.value,
      guests: Number(document.getElementById('bookingGuests')?.value) || 100,
      cateringId: document.getElementById('bookingCateringId')?.value || '',
      decorationId: document.getElementById('bookingDecorationId')?.value || '',
      hallRent: Number(document.getElementById('bookingHallRent')?.value) || 0,
      foodCharges: Number(document.getElementById('bookingFoodCharges')?.value) || 0,
      decorCharges: Number(document.getElementById('bookingDecorCharges')?.value) || 0,
      otherCharges: Number(document.getElementById('bookingOtherCharges')?.value) || 0,
      totalAmount,
      advancePayment,
      remainingAmount,
      paymentStatus,
      notes: document.getElementById('bookingNotes')?.value || '',
      createdAt: editId ? (this.bookings.find(b => b.id === editId)?.createdAt || Date.now()) : Date.now()
    };

    await this.saveToStore('bookings', booking);
    const idx = this.bookings.findIndex(b => b.id === booking.id);
    if (idx >= 0) this.bookings[idx] = booking; else this.bookings.push(booking);

    // If advance payment was made on fresh booking, record in payments store automatically
    if (!editId && advancePayment > 0) {
      const payment = {
        id: 'pay_' + Date.now(),
        bookingId: booking.id,
        customerName: booking.customerName,
        amount: advancePayment,
        date: booking.date,
        method: 'Cash',
        notes: 'Initial Advance Payment'
      };
      await this.saveToStore('payments', payment);
      this.payments.push(payment);
    }

    this.closeModal('bookingModal');
    this.showToast('Booking saved successfully!', 'success');
    this.renderAll();
  }

  editBooking(id) {
    const b = this.bookings.find(x => x.id === id);
    if (!b) return;

    this.populateSelectDropdowns();
    document.getElementById('bookingEditId').value = b.id;
    document.getElementById('bookingCode').value = b.code;
    document.getElementById('bookingCustomerId').value = b.customerId;
    document.getElementById('bookingPhone').value = b.phone;
    document.getElementById('bookingEventType').value = b.eventType;
    document.getElementById('bookingHallId').value = b.hallId;
    document.getElementById('bookingDate').value = b.date;
    document.getElementById('bookingStartTime').value = b.startTime;
    document.getElementById('bookingEndTime').value = b.endTime;
    document.getElementById('bookingGuests').value = b.guests;
    document.getElementById('bookingCateringId').value = b.cateringId || '';
    document.getElementById('bookingDecorationId').value = b.decorationId || '';
    document.getElementById('bookingHallRent').value = b.hallRent || 0;
    document.getElementById('bookingFoodCharges').value = b.foodCharges || 0;
    document.getElementById('bookingDecorCharges').value = b.decorCharges || 0;
    document.getElementById('bookingOtherCharges').value = b.otherCharges || 0;
    document.getElementById('bookingTotalAmount').value = b.totalAmount || 0;
    document.getElementById('bookingAdvancePayment').value = b.advancePayment || 0;
    document.getElementById('bookingRemainingAmount').value = b.remainingAmount || 0;
    document.getElementById('bookingPaymentStatusDisplay').value = b.paymentStatus;
    document.getElementById('bookingNotes').value = b.notes || '';

    this.recalculateBookingTotals();
    document.getElementById('bookingModalTitle').textContent = `Edit Booking (${b.code})`;
    this.openModal('bookingModal');
  }

  // --- Hall Management CRUD ---
  renderHalls() {
    const container = document.getElementById('hallsGridContainer');
    if (!container) return;
    this.ensureSelectionToolbar('hallsGridContainer', 'hall');

    const q = (document.getElementById('hallSearchInput')?.value || '').toLowerCase();
    const st = document.getElementById('hallStatusFilter')?.value;

    const filtered = this.halls.filter(h => {
      if (q && !(h.name?.toLowerCase().includes(q) || h.number?.toLowerCase().includes(q) || h.address?.toLowerCase().includes(q))) return false;
      if (st && h.status !== st) return false;
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="card p-4 text-center text-muted" style="grid-column: 1/-1;">No marriage halls found. Click "+ Add New Hall" to configure your venue.</div>`;
      return;
    }

    container.innerHTML = filtered.map(h => `
      <div class="hall-card"><input type="checkbox" class="row-select card-select" value="${h.id}" aria-label="Select hall">
        <div class="hall-card-header">
          <div>
            <h3 class="hall-card-title">${this.escapeHtml(h.name)}</h3>
            <span class="hall-card-num">Hall Code: ${this.escapeHtml(h.number || 'H-01')}</span>
          </div>
          <span class="badge badge-${h.status === 'Available' ? 'available' : (h.status === 'Booked' ? 'booked' : 'maintenance')}">${h.status}</span>
        </div>
        <p class="text-xs text-muted mb-2">${this.escapeHtml(h.address || 'Venue address')}</p>
        <div class="hall-stats-row">
          <div class="hall-stat-col">
            <span class="hall-stat-label">Capacity</span>
            <div class="hall-stat-val">${h.capacity} Guests</div>
          </div>
          <div class="hall-stat-col">
            <span class="hall-stat-label">Standard Rent</span>
            <div class="hall-stat-val text-gold">${this.formatCurrency(h.rent)}</div>
          </div>
        </div>
        <div class="hall-facilities-list">
          <strong>Facilities:</strong> ${this.escapeHtml(h.facilities || 'Air Conditioning, Executive Stage, Sound System')}
        </div>
        <div class="card-actions-row">
          <button class="btn btn-sm btn-secondary" onclick="app.editHall('${h.id}')">Edit</button>
          <button class="btn btn-sm btn-gold" onclick="app.bookSpecificHall('${h.id}')">Book Hall</button>
          <button class="btn-icon-action danger" onclick="app.confirmDelete('hall', '${h.id}')">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  filterHalls() {
    this.renderHalls();
  }

  openHallModal() {
    document.getElementById('hallForm')?.reset();
    document.getElementById('hallEditId').value = '';
    document.getElementById('hallModalTitle').textContent = 'Add Marriage Hall';
    this.openModal('hallModal');
  }

  editHall(id) {
    const h = this.halls.find(x => x.id === id);
    if (!h) return;
    document.getElementById('hallEditId').value = h.id;
    document.getElementById('hallName').value = h.name;
    document.getElementById('hallNumber').value = h.number;
    document.getElementById('hallCapacity').value = h.capacity;
    document.getElementById('hallRent').value = h.rent;
    document.getElementById('hallStatus').value = h.status;
    document.getElementById('hallFacilities').value = h.facilities;
    document.getElementById('hallAddress').value = h.address;
    document.getElementById('hallDescription').value = h.description;
    document.getElementById('hallModalTitle').textContent = 'Edit Marriage Hall';
    this.openModal('hallModal');
  }

  bookSpecificHall(hallId) {
    this.openBookingModal();
    const select = document.getElementById('bookingHallId');
    if (select) {
      select.value = hallId;
      this.onBookingHallOrTimeChange();
    }
  }

  async saveHall(e) {
    e.preventDefault();
    const editId = document.getElementById('hallEditId')?.value;
    const hall = {
      id: editId || 'hall_' + Date.now(),
      name: document.getElementById('hallName')?.value,
      number: document.getElementById('hallNumber')?.value,
      capacity: Number(document.getElementById('hallCapacity')?.value) || 500,
      rent: Number(document.getElementById('hallRent')?.value) || 100000,
      status: document.getElementById('hallStatus')?.value || 'Available',
      facilities: document.getElementById('hallFacilities')?.value || '',
      address: document.getElementById('hallAddress')?.value || '',
      description: document.getElementById('hallDescription')?.value || ''
    };

    await this.saveToStore('halls', hall);
    const idx = this.halls.findIndex(h => h.id === hall.id);
    if (idx >= 0) this.halls[idx] = hall; else this.halls.push(hall);

    this.closeModal('hallModal');
    this.showToast('Hall saved successfully!', 'success');
    this.renderAll();
  }

  // --- Customer Management CRUD ---
  renderCustomers() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;
    this.ensureSelectionToolbar('customersTable', 'customer');

    const q = (document.getElementById('customerSearchInput')?.value || '').toLowerCase();
    const filtered = this.customers.filter(c => {
      if (q && !(c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.cnic?.includes(q) || c.address?.toLowerCase().includes(q))) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-muted">No customer records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const custBookings = this.bookings.filter(b => b.customerId === c.id);
      return `
        <tr>
          <td><input type="checkbox" class="row-select" value="${c.id}" aria-label="Select customer"> <strong class="text-gold">${this.escapeHtml(c.name)}</strong></td>
          <td>${this.escapeHtml(c.fatherName || '—')}</td>
          <td>${c.phone || '—'}</td>
          <td>${c.whatsapp || c.phone || '—'}</td>
          <td>${c.cnic || '—'}</td>
          <td>${this.escapeHtml(c.address || '—')}</td>
          <td><span class="badge badge-emerald">${custBookings.length} Events</span></td>
          <td>
            <div class="action-buttons-cell">
              <button class="btn-icon-action" title="View Profile & Bookings" onclick="app.viewCustomerProfile('${c.id}')">👤</button>
              <button class="btn-icon-action" title="Edit Customer" onclick="app.editCustomer('${c.id}')">✏️</button>
              <button class="btn-icon-action danger" title="Delete Customer" onclick="app.confirmDelete('customer', '${c.id}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  filterCustomers() {
    this.renderCustomers();
  }

  openCustomerModal() {
    document.getElementById('customerForm')?.reset();
    document.getElementById('customerEditId').value = '';
    document.getElementById('customerModalTitle').textContent = 'Add Customer';
    this.openModal('customerModal');
  }

  editCustomer(id) {
    const c = this.customers.find(x => x.id === id);
    if (!c) return;
    document.getElementById('customerEditId').value = c.id;
    document.getElementById('custName').value = c.name;
    document.getElementById('custFather').value = c.fatherName || '';
    document.getElementById('custPhone').value = c.phone || '';
    document.getElementById('custWhatsApp').value = c.whatsapp || '';
    document.getElementById('custCNIC').value = c.cnic || '';
    document.getElementById('custAddress').value = c.address || '';
    document.getElementById('custNotes').value = c.notes || '';
    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    this.openModal('customerModal');
  }

  viewCustomerProfile(id) {
    const c = this.customers.find(x => x.id === id);
    if (!c) return;
    this.viewedCustomerId = c.id;
    const bList = this.bookings.filter(b => b.customerId === c.id);

    let html = `
      <div style="margin-bottom: 1rem;">
        <h4 style="font-size: 1.25rem; color: var(--primary-gold);">${this.escapeHtml(c.name)}</h4>
        <p class="text-sm text-muted">${c.fatherName ? 'S/O or D/O: ' + this.escapeHtml(c.fatherName) : ''}</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.75rem; font-size: 0.85rem;">
          <div><strong>Phone:</strong> ${c.phone}</div>
          <div><strong>WhatsApp:</strong> ${c.whatsapp || c.phone}</div>
          <div><strong>CNIC / Ref:</strong> ${c.cnic || 'N/A'}</div>
          <div><strong>Address:</strong> ${this.escapeHtml(c.address || 'N/A')}</div>
        </div>
      </div>
      <hr class="divider">
      <h5 class="font-bold text-sm mb-2">Booking History (${bList.length} events)</h5>
    `;

    if (bList.length === 0) {
      html += `<p class="text-muted text-sm">No bookings recorded for this client yet.</p>`;
    } else {
      html += `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Booking</th><th>Event</th><th>Date</th><th>Hall</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${bList.map(b => `
                <tr>
                  <td><strong>${b.code}</strong></td>
                  <td>${b.eventType}</td>
                  <td>${this.formatDateDisplay(b.date)}</td>
                  <td>${this.getHallName(b.hallId)}</td>
                  <td>${this.formatCurrency(b.totalAmount)}</td>
                  <td><span class="badge badge-${b.paymentStatus === 'Paid' ? 'paid' : 'partial'}">${b.paymentStatus}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    document.getElementById('customerDetailsContent').innerHTML = html;
    this.openModal('customerDetailsModal');
  }

  printCustomerProfile() {
    const customer = this.customers.find(c => c.id === this.viewedCustomerId);
    if (!customer) {
      this.showToast('Open a customer profile before printing.', 'error');
      return;
    }

    const bookings = this.bookings.filter(b => b.customerId === customer.id);
    const rows = bookings.length ? bookings.map(b => `
      <tr>
        <td>${this.escapeHtml(b.code || '')}</td>
        <td>${this.escapeHtml(b.eventType || '')}</td>
        <td>${this.escapeHtml(this.formatDateDisplay(b.date || ''))}</td>
        <td>${this.escapeHtml(this.getHallName(b.hallId))}</td>
        <td>${this.escapeHtml(this.formatCurrency(b.totalAmount))}</td>
        <td>${this.escapeHtml(b.paymentStatus || '')}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;">No bookings recorded.</td></tr>';

    const doc = `
      <div class="printable-document customer-copy-document">
        <div class="inv-header">
          <div>
            <h1 class="inv-hall-name">${this.escapeHtml(this.settings.hallName)}</h1>
            <p class="text-sm">${this.escapeHtml(this.settings.address)} | Phone: ${this.escapeHtml(this.settings.phone)}</p>
          </div>
          <div style="text-align:right;"><div class="inv-badge">CUSTOMER COPY</div><p class="text-xs">Generated: ${this.escapeHtml(this.formatDateDisplay(new Date().toISOString().split('T')[0]))}</p></div>
        </div>
        <h2>Customer Details</h2>
        <div class="inv-meta-grid">
          <div><strong>Name:</strong> ${this.escapeHtml(customer.name)}</div>
          <div><strong>Father Name:</strong> ${this.escapeHtml(customer.fatherName || 'N/A')}</div>
          <div><strong>Phone:</strong> ${this.escapeHtml(customer.phone || 'N/A')}</div>
          <div><strong>WhatsApp:</strong> ${this.escapeHtml(customer.whatsapp || customer.phone || 'N/A')}</div>
          <div><strong>CNIC / Ref:</strong> ${this.escapeHtml(customer.cnic || 'N/A')}</div>
          <div><strong>Address:</strong> ${this.escapeHtml(customer.address || 'N/A')}</div>
        </div>
        <h3 class="statement-section-title">Booking History (${bookings.length})</h3>
        <table class="inv-table"><thead><tr><th>Booking</th><th>Event</th><th>Date</th><th>Hall</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="inv-footer-note"><p>Customer copy generated by Marriage Hall Manager.</p></div>
      </div>
    `;
    document.getElementById('printableDocumentContainer').innerHTML = doc;
    document.getElementById('printViewModalTitle').textContent = 'Customer Copy';
    this.setPrintButtonLabel('Print Customer Copy');
    this.setPrintFormat(document.getElementById('printFormatSelect')?.value || 'a4');
    this.closeModal('customerDetailsModal');
    this.openModal('printViewModal');
  }

  async saveCustomer(e) {
    e.preventDefault();
    const editId = document.getElementById('customerEditId')?.value;
    const customer = {
      id: editId || 'cust_' + Date.now(),
      name: document.getElementById('custName')?.value,
      fatherName: document.getElementById('custFather')?.value || '',
      phone: document.getElementById('custPhone')?.value,
      whatsapp: document.getElementById('custWhatsApp')?.value || '',
      cnic: document.getElementById('custCNIC')?.value || '',
      address: document.getElementById('custAddress')?.value || '',
      notes: document.getElementById('custNotes')?.value || ''
    };

    await this.saveToStore('customers', customer);
    const idx = this.customers.findIndex(c => c.id === customer.id);
    if (idx >= 0) this.customers[idx] = customer; else this.customers.push(customer);

    this.closeModal('customerModal');
    this.showToast('Customer saved successfully!', 'success');
    this.renderAll();
  }

  // --- Payment Management CRUD ---
  renderPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;
    this.ensureSelectionToolbar('paymentsTableBody', 'payment');

    let totalRec = 0;
    this.payments.forEach(p => totalRec += Number(p.amount) || 0);

    let totalInv = 0;
    let totalRem = 0;
    this.bookings.forEach(b => {
      totalInv += Number(b.totalAmount) || 0;
      totalRem += Number(b.remainingAmount) || 0;
    });

    document.getElementById('paymentsTotalReceived').textContent = this.formatCurrency(totalRec);
    document.getElementById('paymentsTotalPending').textContent = this.formatCurrency(totalRem);
    document.getElementById('paymentsTotalInvoiced').textContent = this.formatCurrency(totalInv);

    const q = (document.getElementById('paymentSearchInput')?.value || '').toLowerCase();
    const method = document.getElementById('paymentMethodFilter')?.value;

    const filtered = this.payments.filter(p => {
      if (q && !(p.customerName?.toLowerCase().includes(q) || p.bookingId?.includes(q) || p.id?.includes(q))) return false;
      if (method && p.method !== method) return false;
      return true;
    }).sort((a, b) => b.id.localeCompare(a.id));

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center p-4 text-muted">No payments recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => `
      <tr>
        <td><input type="checkbox" class="row-select" value="${p.id}" aria-label="Select payment"> <strong>${p.id.substring(0, 10)}</strong></td>
        <td>${this.formatDateDisplay(p.date)}</td>
        <td>${this.getBookingCode(p.bookingId)}</td>
        <td>${this.escapeHtml(p.customerName)}</td>
        <td><strong class="text-success">${this.formatCurrency(p.amount)}</strong></td>
        <td><span class="badge badge-emerald">${p.method}</span></td>
        <td>${this.escapeHtml(p.notes || '—')}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="app.previewReceipt('${p.id}')">Receipt</button></td>
        <td>
          <button class="btn-icon-action danger" onclick="app.confirmDelete('payment', '${p.id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  filterPayments() {
    this.renderPayments();
  }

  openPaymentModal() {
    document.getElementById('paymentForm')?.reset();
    document.getElementById('paymentEditId').value = '';
    document.getElementById('paymentModalTitle').textContent = 'Record Payment';
    document.getElementById('payDate').value = new Date().toISOString().split('T')[0];
    this.populateSelectDropdowns();
    this.openModal('paymentModal');
  }

  onPaymentBookingSelected() {
    const bookingId = document.getElementById('payBookingId')?.value;
    const b = this.bookings.find(x => x.id === bookingId);
    if (b) {
      document.getElementById('payCustomerName').value = b.customerName;
      document.getElementById('payPrevTotal').textContent = this.formatCurrency(b.totalAmount);
      document.getElementById('payPrevPaid').textContent = this.formatCurrency(b.advancePayment);
      document.getElementById('payPrevRemaining').textContent = this.formatCurrency(b.remainingAmount);
      document.getElementById('payAmount').value = b.remainingAmount > 0 ? b.remainingAmount : '';
    }
  }

  async savePayment(e) {
    e.preventDefault();
    const bookingId = document.getElementById('payBookingId')?.value;
    const b = this.bookings.find(x => x.id === bookingId);
    const amount = Number(document.getElementById('payAmount')?.value) || 0;

    const payment = {
      id: 'pay_' + Date.now(),
      bookingId: bookingId,
      customerName: b ? b.customerName : document.getElementById('payCustomerName')?.value,
      amount: amount,
      date: document.getElementById('payDate')?.value,
      method: document.getElementById('payMethod')?.value || 'Cash',
      notes: document.getElementById('payNotes')?.value || ''
    };

    await this.saveToStore('payments', payment);
    this.payments.push(payment);

    // Update remaining and status of the booking
    if (b) {
      b.advancePayment = (Number(b.advancePayment) || 0) + amount;
      b.remainingAmount = Math.max(0, (Number(b.totalAmount) || 0) - b.advancePayment);
      if (b.remainingAmount === 0) b.paymentStatus = 'Paid';
      else if (b.advancePayment > 0) b.paymentStatus = 'Partially Paid';
      await this.saveToStore('bookings', b);
    }

    this.closeModal('paymentModal');
    this.showToast('Payment recorded successfully!', 'success');
    this.renderAll();
    this.previewReceipt(payment.id);
  }

  // --- Expense Management CRUD ---
  renderExpenses() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;
    this.ensureSelectionToolbar('expensesTableBody', 'expense');

    let total = 0;
    const catTotals = {};

    this.expenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      total += amt;
      catTotals[e.category] = (catTotals[e.category] || 0) + amt;
    });

    document.getElementById('expensesTotalValue').textContent = this.formatCurrency(total);

    // Render Category Expense Progress Bars
    const barsContainer = document.getElementById('expenseCategoryBars');
    if (barsContainer) {
      barsContainer.innerHTML = Object.entries(catTotals).map(([cat, amt]) => {
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        return `
          <div style="padding: 0.6rem 1.25rem; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
              <span><strong>${cat}</strong> (${pct}%)</span>
              <span class="text-danger font-bold">${this.formatCurrency(amt)}</span>
            </div>
            <div style="height: 6px; background: var(--bg-main); border-radius: 4px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: var(--rose);"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    const q = (document.getElementById('expenseSearchInput')?.value || '').toLowerCase();
    const cat = document.getElementById('expenseCategoryFilter')?.value;

    const filtered = this.expenses.filter(e => {
      if (q && !(e.title?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q))) return false;
      if (cat && e.category !== cat) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-muted">No expenses recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => `
      <tr>
        <td><input type="checkbox" class="row-select" value="${e.id}" aria-label="Select expense"> <strong>${e.id.substring(0, 10)}</strong></td>
        <td>${this.formatDateDisplay(e.date)}</td>
        <td><strong>${this.escapeHtml(e.title)}</strong></td>
        <td><span class="badge badge-rose">${e.category}</span></td>
        <td><strong class="text-danger">${this.formatCurrency(e.amount)}</strong></td>
        <td>${this.escapeHtml(e.description || '—')}</td>
        <td>
          <button class="btn-icon-action danger" onclick="app.confirmDelete('expense', '${e.id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  filterExpenses() {
    this.renderExpenses();
  }

  openExpenseModal() {
    document.getElementById('expenseForm')?.reset();
    document.getElementById('expenseEditId').value = '';
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
    this.openModal('expenseModal');
  }

  async saveExpense(e) {
    e.preventDefault();
    const expense = {
      id: 'exp_' + Date.now(),
      title: document.getElementById('expTitle')?.value,
      category: document.getElementById('expCategory')?.value || 'Other',
      amount: Number(document.getElementById('expAmount')?.value) || 0,
      date: document.getElementById('expDate')?.value,
      description: document.getElementById('expDescription')?.value || ''
    };

    await this.saveToStore('expenses', expense);
    this.expenses.push(expense);

    this.closeModal('expenseModal');
    this.showToast('Expense recorded successfully!', 'success');
    this.renderAll();
  }

  // --- Catering & Food Packages CRUD ---
  renderCatering() {
    const container = document.getElementById('cateringGridContainer');
    if (!container) return;
    this.ensureSelectionToolbar('cateringGridContainer', 'catering');

    if (this.catering.length === 0) {
      container.innerHTML = `<div class="card p-4 text-center text-muted" style="grid-column: 1/-1;">No food packages added yet. Click "+ Add Menu Package".</div>`;
      return;
    }

    container.innerHTML = this.catering.map(c => `
      <div class="catering-card"><input type="checkbox" class="row-select card-select" value="${c.id}" aria-label="Select catering package">
        <div class="catering-card-header">
          <div>
            <h3 class="hall-card-title">${this.escapeHtml(c.name)}</h3>
            <span class="badge badge-emerald mt-1">${this.formatCurrency(c.pricePerPerson)} / person</span>
          </div>
        </div>
        <div style="margin: 0.75rem 0; font-size: 0.85rem; flex: 1;">
          <strong style="color: var(--primary-gold);">Menu Items:</strong>
          <p class="text-muted mt-1" style="line-height: 1.6;">${this.escapeHtml(c.items)}</p>
        </div>
        <p class="text-xs text-muted mb-3">${this.escapeHtml(c.description || '')}</p>
        <div class="card-actions-row">
          <button class="btn btn-sm btn-secondary" onclick="app.editCatering('${c.id}')">Edit</button>
          <button class="btn-icon-action danger" onclick="app.confirmDelete('catering', '${c.id}')">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  openCateringModal() {
    document.getElementById('cateringForm')?.reset();
    document.getElementById('cateringEditId').value = '';
    this.openModal('cateringModal');
  }

  editCatering(id) {
    const c = this.catering.find(x => x.id === id);
    if (!c) return;
    document.getElementById('cateringEditId').value = c.id;
    document.getElementById('catName').value = c.name;
    document.getElementById('catPrice').value = c.pricePerPerson;
    document.getElementById('catItems').value = c.items;
    document.getElementById('catDescription').value = c.description || '';
    this.openModal('cateringModal');
  }

  async saveCatering(e) {
    e.preventDefault();
    const editId = document.getElementById('cateringEditId')?.value;
    const cat = {
      id: editId || 'cat_' + Date.now(),
      name: document.getElementById('catName')?.value,
      pricePerPerson: Number(document.getElementById('catPrice')?.value) || 0,
      items: document.getElementById('catItems')?.value,
      description: document.getElementById('catDescription')?.value || ''
    };

    await this.saveToStore('catering', cat);
    const idx = this.catering.findIndex(x => x.id === cat.id);
    if (idx >= 0) this.catering[idx] = cat; else this.catering.push(cat);

    this.closeModal('cateringModal');
    this.showToast('Catering package saved!', 'success');
    this.renderAll();
  }

  // --- Decoration Packages CRUD ---
  renderDecorations() {
    const container = document.getElementById('decorationsGridContainer');
    if (!container) return;
    this.ensureSelectionToolbar('decorationsGridContainer', 'decoration');

    if (this.decorations.length === 0) {
      container.innerHTML = `<div class="card p-4 text-center text-muted" style="grid-column: 1/-1;">No decoration packages found. Click "+ Add Decoration Package".</div>`;
      return;
    }

    container.innerHTML = this.decorations.map(d => `
      <div class="decor-card"><input type="checkbox" class="row-select card-select" value="${d.id}" aria-label="Select decoration package">
        <div class="decor-card-header">
          <div>
            <h3 class="hall-card-title">${this.escapeHtml(d.name)}</h3>
            <span class="badge badge-gold mt-1">${this.formatCurrency(d.price)}</span>
          </div>
        </div>
        <p class="text-sm text-secondary my-3" style="flex: 1; line-height: 1.5;">${this.escapeHtml(d.description)}</p>
        <div class="card-actions-row">
          <button class="btn btn-sm btn-secondary" onclick="app.editDecoration('${d.id}')">Edit</button>
          <button class="btn-icon-action danger" onclick="app.confirmDelete('decoration', '${d.id}')">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  openDecorationModal() {
    document.getElementById('decorationForm')?.reset();
    document.getElementById('decorationEditId').value = '';
    this.openModal('decorationModal');
  }

  editDecoration(id) {
    const d = this.decorations.find(x => x.id === id);
    if (!d) return;
    document.getElementById('decorationEditId').value = d.id;
    document.getElementById('decName').value = d.name;
    document.getElementById('decPrice').value = d.price;
    document.getElementById('decDescription').value = d.description;
    this.openModal('decorationModal');
  }

  async saveDecoration(e) {
    e.preventDefault();
    const editId = document.getElementById('decorationEditId')?.value;
    const decor = {
      id: editId || 'dec_' + Date.now(),
      name: document.getElementById('decName')?.value,
      price: Number(document.getElementById('decPrice')?.value) || 0,
      description: document.getElementById('decDescription')?.value
    };

    await this.saveToStore('decorations', decor);
    const idx = this.decorations.findIndex(x => x.id === decor.id);
    if (idx >= 0) this.decorations[idx] = decor; else this.decorations.push(decor);

    this.closeModal('decorationModal');
    this.showToast('Decoration package saved!', 'success');
    this.renderAll();
  }

  // --- Staff Management CRUD ---
  renderStaff() {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;
    this.ensureSelectionToolbar('staffTableBody', 'staff');

    const q = (document.getElementById('staffSearchInput')?.value || '').toLowerCase();
    const pos = document.getElementById('staffPositionFilter')?.value;

    const filtered = this.staff.filter(s => {
      if (q && !(s.name?.toLowerCase().includes(q) || s.phone?.includes(q) || s.position?.toLowerCase().includes(q))) return false;
      if (pos && s.position !== pos) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-muted">No staff personnel found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => `
      <tr>
        <td><input type="checkbox" class="row-select" value="${s.id}" aria-label="Select staff member"> <strong class="text-gold">${this.escapeHtml(s.name)}</strong></td>
        <td><span class="badge badge-emerald">${s.position}</span></td>
        <td>${s.phone}</td>
        <td><strong>${this.formatCurrency(s.salary)}</strong></td>
        <td>${s.joiningDate || '—'}</td>
        <td>${this.escapeHtml(s.address || '—')}</td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-icon-action" title="Edit Staff" onclick="app.editStaff('${s.id}')">✏️</button>
            <button class="btn-icon-action danger" title="Delete" onclick="app.confirmDelete('staff', '${s.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  filterStaff() {
    this.renderStaff();
  }

  openStaffModal() {
    document.getElementById('staffForm')?.reset();
    document.getElementById('staffEditId').value = '';
    document.getElementById('stfJoiningDate').value = new Date().toISOString().split('T')[0];
    this.openModal('staffModal');
  }

  editStaff(id) {
    const s = this.staff.find(x => x.id === id);
    if (!s) return;
    document.getElementById('staffEditId').value = s.id;
    document.getElementById('stfName').value = s.name;
    document.getElementById('stfPosition').value = s.position;
    document.getElementById('stfPhone').value = s.phone;
    document.getElementById('stfSalary').value = s.salary;
    document.getElementById('stfJoiningDate').value = s.joiningDate || '';
    document.getElementById('stfAddress').value = s.address || '';
    document.getElementById('stfNotes').value = s.notes || '';
    this.openModal('staffModal');
  }

  async saveStaff(e) {
    e.preventDefault();
    const editId = document.getElementById('staffEditId')?.value;
    const member = {
      id: editId || 'stf_' + Date.now(),
      name: document.getElementById('stfName')?.value,
      position: document.getElementById('stfPosition')?.value,
      phone: document.getElementById('stfPhone')?.value,
      salary: Number(document.getElementById('stfSalary')?.value) || 0,
      joiningDate: document.getElementById('stfJoiningDate')?.value,
      address: document.getElementById('stfAddress')?.value || '',
      notes: document.getElementById('stfNotes')?.value || ''
    };

    await this.saveToStore('staff', member);
    const idx = this.staff.findIndex(x => x.id === member.id);
    if (idx >= 0) this.staff[idx] = member; else this.staff.push(member);

    this.closeModal('staffModal');
    this.showToast('Staff member record saved!', 'success');
    this.renderAll();
  }

  // --- Banquet Calendar Module ---
  renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendarMonthTitle').textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const todayStr = this.getLocalDateString();
    let html = '';

    // Previous month filler days
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      html += `<div class="calendar-day other-month"><div class="cal-day-header"><span>${d}</span></div></div>`;
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.selectedCalendarDate;

      // Find bookings on this date
      const dayBookings = this.bookings.filter(b => b.date === dateStr);

      html += `
        <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="app.selectCalendarDate('${dateStr}')">
          <div class="cal-day-header">
            <span>${day}</span>
            ${dayBookings.length > 0 ? `<span class="legend-badge badge-booked"></span>` : `<span class="legend-badge badge-avail"></span>`}
          </div>
          <div class="cal-day-events">
            ${dayBookings.map(b => `
              <div class="cal-event-pill" title="${this.escapeHtml(b.code || b.id)} - ${this.escapeHtml(b.customerName)} (${this.formatTime12(b.startTime)} - ${this.formatTime12(b.endTime)})">
                <strong>${this.escapeHtml(b.code || b.id)} - ${this.escapeHtml(b.customerName)}</strong>
                <small>${this.formatEventPeriod(b.startTime) ? `${this.formatEventPeriod(b.startTime)}: ` : ''}${this.formatTime12(b.startTime)} - ${this.formatTime12(b.endTime)}</small>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
  }

  prevCalendarMonth() {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
    this.renderCalendar();
  }

  nextCalendarMonth() {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
    this.renderCalendar();
  }

  todayCalendarMonth() {
    this.currentCalendarDate = new Date();
    this.selectCalendarDate(this.getLocalDateString());
    this.renderCalendar();
  }

  selectCalendarDate(dateStr) {
    this.selectedCalendarDate = dateStr;
    this.renderCalendar();

    const list = document.getElementById('calendarSelectedDayEventsList');
    document.getElementById('calendarSelectedDayTitle').textContent = `Events on ${this.formatDateDisplay(dateStr)}`;

    const dayBookings = this.bookings.filter(b => b.date === dateStr);
    if (dayBookings.length === 0) {
      list.innerHTML = `<p class="text-success font-bold">✨ No bookings on this date. All banquet halls are Available!</p>`;
    } else {
      list.innerHTML = dayBookings.map(b => `
        <div class="card p-3 mb-2" style="background: var(--bg-main);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h4 class="text-gold font-bold">${this.escapeHtml(b.code || b.id)} — ${this.escapeHtml(b.customerName)}</h4>
              <p class="text-xs text-muted">${this.formatDateDisplay(b.date)} | Hall: ${this.getHallName(b.hallId)} | ${this.formatTime12(b.startTime)} - ${this.formatTime12(b.endTime)} | ${b.guests} Guests</p>
              <div class="text-sm mt-1">Total: ${this.formatCurrency(b.totalAmount)} | Remaining: <span class="text-danger">${this.formatCurrency(b.remainingAmount)}</span></div>
            </div>
            <div class="flex-align-center gap-2">
              <button class="btn btn-sm btn-secondary" onclick="app.previewInvoice('${b.id}')">Invoice</button>
              <button class="btn btn-sm btn-gold" onclick="app.editBooking('${b.id}')">Edit</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // --- Invoices & Receipts Tab View ---
  renderInvoicesView() {
    const invBody = document.getElementById('invoiceTableBody');
    if (invBody) {
      invBody.innerHTML = this.bookings.map(b => `
        <tr>
          <td><input type="checkbox" class="row-select" value="${b.id}" aria-label="Select invoice"> <strong>${b.code}</strong></td>
          <td>${this.escapeHtml(b.customerName)}</td>
          <td>${this.getHallName(b.hallId)}</td>
          <td>${this.formatDateDisplay(b.date)}</td>
          <td><strong>${this.formatCurrency(b.totalAmount)}</strong></td>
          <td class="text-success">${this.formatCurrency(b.advancePayment)}</td>
          <td class="text-danger">${this.formatCurrency(b.remainingAmount)}</td>
          <td><span class="badge badge-${b.paymentStatus === 'Paid' ? 'paid' : 'partial'}">${b.paymentStatus}</span></td>
          <td>
            <button class="btn btn-sm btn-gold" onclick="app.previewInvoice('${b.id}')">Print Invoice</button>
          </td>
        </tr>
      `).join('');
      this.ensureSelectionToolbar('invoiceTableBody', 'invoice');
    }

    const recBody = document.getElementById('receiptTableBody');
    if (recBody) {
      recBody.innerHTML = this.payments.map(p => `
        <tr>
          <td><input type="checkbox" class="row-select" value="${p.id}" aria-label="Select receipt"> <strong>${p.id.substring(0, 10)}</strong></td>
          <td>${this.formatDateDisplay(p.date)}</td>
          <td>${this.escapeHtml(p.customerName)}</td>
          <td>${this.getBookingCode(p.bookingId)}</td>
          <td><strong class="text-success">${this.formatCurrency(p.amount)}</strong></td>
          <td><span class="badge badge-emerald">${p.method}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="app.previewReceipt('${p.id}')">Print Receipt</button>
          </td>
        </tr>
      `).join('');
      this.ensureSelectionToolbar('receiptTableBody', 'receipt');
    }

    this.refreshSelectionToolbars();

    const cardsGrid = document.getElementById('bookingCardsGrid');
    if (cardsGrid) {
      cardsGrid.innerHTML = this.bookings.slice(0, 6).map(b => `
        <div class="vip-booking-card">
          <div class="vip-card-header">
            <span class="vip-card-badge">${this.settings.hallName}</span>
            <span class="text-xs" style="color: #fbbf24;">${b.code}</span>
          </div>
          <div class="vip-guest-name">${this.escapeHtml(b.customerName)}</div>
          <div class="vip-event-details">
            <div><strong>Event:</strong> ${b.eventType}</div>
            <div><strong>Hall:</strong> ${this.getHallName(b.hallId)}</div>
            <div><strong>Date:</strong> ${this.formatDateDisplay(b.date)}</div>
            <div><strong>Time:</strong> ${this.formatTime12(b.startTime)} - ${this.formatTime12(b.endTime)}</div>
            <div><strong>Guests:</strong> ${b.guests}</div>
            <div><strong>Status:</strong> ${b.paymentStatus}</div>
          </div>
          <div class="vip-card-footer">
            <span>Total: ${this.formatCurrency(b.totalAmount)}</span>
            <button class="btn btn-sm btn-gold" onclick="app.previewBookingCard('${b.id}')">Print Pass</button>
          </div>
        </div>
      `).join('');
    }
  }

  switchInvoiceTab(tabId, clickedButton) {
    document.querySelectorAll('.invoice-tabs .tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const activeBtn = clickedButton || Array.from(document.querySelectorAll('.invoice-tabs .tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');
    if (activeBtn) activeBtn.setAttribute('aria-selected', 'true');

    const content = document.getElementById(tabId);
    if (content) content.classList.add('active');
  }

  setPrintFormat(format) {
    const modal = document.getElementById('printViewModal');
    const select = document.getElementById('printFormatSelect');
    const container = document.getElementById('printableDocumentContainer');
    const selectedFormat = format === 'thermal' ? 'thermal' : 'a4';

    if (modal) modal.dataset.printFormat = selectedFormat;
    if (select) select.value = selectedFormat;
    if (container) container.classList.toggle('thermal-document', selectedFormat === 'thermal');
  }

  setPrintButtonLabel(label) {
    const buttonLabel = document.getElementById('printButtonLabel');
    if (buttonLabel) buttonLabel.textContent = label;
  }

  previewReport() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const start = document.getElementById('reportStartDate')?.value;
    const end = document.getElementById('reportEndDate')?.value;
    const matchesDate = (date) => {
      if (!date) return true;
      if (this.reportTimeframe === 'today') return date === todayStr;
      if (this.reportTimeframe === 'month') return date.startsWith(todayStr.substring(0, 7));
      if (this.reportTimeframe === 'year') return date.startsWith(todayStr.substring(0, 4));
      if (this.reportTimeframe === 'custom') {
        if (start && date < start) return false;
        if (end && date > end) return false;
      }
      return true;
    };
    const bookings = this.bookings.filter(b => matchesDate(b.date));
    const expenses = this.expenses.filter(e => matchesDate(e.date));
    const revenue = bookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    const collected = bookings.reduce((sum, b) => sum + (Number(b.advancePayment) || 0), 0);
    const receivable = bookings.reduce((sum, b) => sum + (Number(b.remainingAmount) || 0), 0);
    const expenseTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const period = this.reportTimeframe === 'custom' ? `${this.formatDateDisplay(start) || 'Start'} to ${this.formatDateDisplay(end) || 'End'}` : this.reportTimeframe.toUpperCase();
    const newBalance = revenue - expenseTotal;
    const availableCredit = Math.max(0, revenue - receivable);
    const doc = `
      <div class="printable-document account-summary-document">
        <div class="account-summary-business-header">
          <h1>${this.escapeHtml(this.settings.hallName)}</h1>
          <p>${this.escapeHtml(this.settings.address || '')}</p>
          <p>Cell: ${this.escapeHtml(this.settings.phone || '')}</p>
        </div>
        <div class="account-summary-header">
          <h1>Account summary</h1>
          <div class="account-summary-rule"></div>
          <p class="account-summary-meta">${this.escapeHtml(this.settings.hallName)} | ${period} | ${this.formatDateDisplay(now.toISOString().split('T')[0])}</p>
        </div>
        <section class="account-summary-section">
          <div class="account-summary-row"><span>Previous balance</span><strong>${this.formatCurrency(0)}</strong></div>
          <div class="account-summary-row"><span>- &nbsp;Total payments received</span><strong>${this.formatCurrency(collected)}</strong></div>
          <div class="account-summary-row"><span>- &nbsp;Credits</span><strong>${this.formatCurrency(receivable)}</strong></div>
          <div class="account-summary-row"><span>+ &nbsp;Purchases</span><strong>${this.formatCurrency(expenseTotal)}</strong></div>
          <div class="account-summary-row"><span>+ &nbsp;Cash advances</span><strong>${this.formatCurrency(0)}</strong></div>
          <div class="account-summary-row"><span>+ &nbsp;Fees charged</span><strong>${this.formatCurrency(0)}</strong></div>
          <div class="account-summary-row"><span>+ &nbsp;Interest charged</span><strong>${this.formatCurrency(0)}</strong></div>
          <div class="account-summary-rule"></div>
          <div class="account-summary-row account-summary-total"><span>= New balance</span><strong>${this.formatCurrency(newBalance)}</strong></div>
        </section>
        <section class="account-summary-section account-credit-section">
          <h2>Credit limit</h2>
          <div class="account-summary-rule"></div>
          <div class="account-summary-row"><span>Total credit limit</span><strong>${this.formatCurrency(revenue)}</strong></div>
          <div class="account-summary-row"><span>- &nbsp;New balance</span><strong>${this.formatCurrency(newBalance)}</strong></div>
          <div class="account-summary-row"><span>- &nbsp;Pending transactions</span><strong>${this.formatCurrency(receivable)}</strong></div>
          <div class="account-summary-rule"></div>
          <div class="account-summary-row account-summary-total"><span>= Total available credit</span><strong>${this.formatCurrency(availableCredit)}</strong></div>
          <p class="account-summary-includes">Includes:</p>
          <div class="account-summary-row"><span>Available for cash advance</span><strong>${this.formatCurrency(availableCredit)}</strong></div>
          <p class="account-summary-note">* Summary generated from the selected Reports &amp; Analytics period.</p>
        </section>
      </div>`;
    document.getElementById('printableDocumentContainer').innerHTML = doc;
    document.getElementById('printViewModalTitle').textContent = 'Financial Summary Statement';
    this.setPrintButtonLabel('Print Statement');
    this.setPrintFormat(document.getElementById('printFormatSelect')?.value || 'a4');
    this.openModal('printViewModal');
  }

  // --- Print Document Generators ---
  previewInvoice(bookingId) {
    const b = this.bookings.find(x => x.id === bookingId);
    if (!b) return;

    const hall = this.halls.find(h => h.id === b.hallId);
    const cat = this.catering.find(c => c.id === b.cateringId);
    const dec = this.decorations.find(d => d.id === b.decorationId);

    const doc = `
      <div class="printable-document">
        <div class="inv-header">
          <div>
            <h1 class="inv-hall-name">${this.settings.hallName}</h1>
            <p class="text-sm text-muted">${this.settings.address} | Phone: ${this.settings.phone}</p>
            <p class="text-sm text-muted">WhatsApp: ${this.settings.whatsapp}</p>
          </div>
          <div style="text-align: right;">
            <div class="inv-badge">OFFICIAL INVOICE</div>
            <p class="text-sm font-bold mt-2">Invoice #: ${b.code}</p>
            <p class="text-xs text-muted">Generated: ${this.formatDateDisplay(new Date().toISOString().split('T')[0])}</p>
          </div>
        </div>

        <div class="inv-meta-grid">
          <div>
            <h4 class="font-bold text-sm" style="color: var(--primary-gold);">BILLED TO:</h4>
            <p class="font-bold">${this.escapeHtml(b.customerName)}</p>
            <p class="text-sm">Phone: ${b.phone}</p>
          </div>
          <div>
            <h4 class="font-bold text-sm" style="color: var(--primary-gold);">EVENT RESERVATION:</h4>
            <p class="text-sm"><strong>Event Type:</strong> ${b.eventType}</p>
            <p class="text-sm"><strong>Banquet Hall:</strong> ${hall ? hall.name : 'Main Hall'}</p>
            <p class="text-sm"><strong>Event Date:</strong> ${this.formatDateDisplay(b.date)}</p>
            <p class="text-sm"><strong>Timing:</strong> ${this.formatTime12(b.startTime)} to ${this.formatTime12(b.endTime)}</p>
            <p class="text-sm"><strong>Number of Guests:</strong> ${b.guests}</p>
          </div>
        </div>

        <table class="inv-table">
          <thead>
            <tr>
              <th>Description / Service Breakdown</th>
              <th style="text-align: right;">Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Hall Venue Rental (${hall ? hall.name : 'Banquet'})</td>
              <td style="text-align: right;">${(b.hallRent || 0).toLocaleString()}</td>
            </tr>
            ${b.foodCharges > 0 ? `
              <tr>
                <td>Catering Service: ${cat ? cat.name : 'Menu Package'} (${b.guests} Guests)</td>
                <td style="text-align: right;">${(b.foodCharges || 0).toLocaleString()}</td>
              </tr>
            ` : ''}
            ${b.decorCharges > 0 ? `
              <tr>
                <td>Decoration Package: ${dec ? dec.name : 'Standard Decor'}</td>
                <td style="text-align: right;">${(b.decorCharges || 0).toLocaleString()}</td>
              </tr>
            ` : ''}
            ${b.otherCharges > 0 ? `
              <tr>
                <td>Additional Services & Amenities</td>
                <td style="text-align: right;">${(b.otherCharges || 0).toLocaleString()}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>

        <div class="inv-totals-box">
          <div class="inv-total-row">
            <span>Total Bill:</span>
            <strong>${this.formatCurrency(b.totalAmount)}</strong>
          </div>
          <div class="inv-total-row">
            <span>Advance / Paid:</span>
            <strong style="color: #10b981;">${this.formatCurrency(b.advancePayment)}</strong>
          </div>
          <div class="inv-total-row inv-total-grand">
            <span>Balance Due:</span>
            <span style="color: ${b.remainingAmount > 0 ? '#ef4444' : '#10b981'};">${this.formatCurrency(b.remainingAmount)}</span>
          </div>
          <div class="inv-total-row text-sm">
            <span>Payment Status:</span>
            <strong class="badge badge-${b.paymentStatus === 'Paid' ? 'paid' : 'partial'}">${b.paymentStatus}</strong>
          </div>
        </div>

        <div class="inv-footer-note">
          <p>${this.settings.invoiceFooter}</p>
          <p class="text-xs text-muted mt-1">Marriage Hall Manager • Developed by PK-RajWolrd (100% Offline Software)</p>
        </div>
      </div>
    `;

    document.getElementById('printableDocumentContainer').innerHTML = doc;
    document.getElementById('printViewModalTitle').textContent = `Invoice #${b.code}`;
    this.setPrintButtonLabel('Print Invoice');
    this.setPrintFormat(document.getElementById('printFormatSelect')?.value || 'a4');
    this.openModal('printViewModal');
  }

  previewReceipt(paymentId) {
    const p = this.payments.find(x => x.id === paymentId);
    if (!p) return;
    const b = this.bookings.find(x => x.id === p.bookingId);

    const doc = `
      <div class="printable-document" style="max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px;">
        <div style="text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1rem;">
          <h2 style="font-weight: 800; color: #0f172a;">${this.settings.hallName}</h2>
          <p class="text-xs text-muted">${this.settings.address} | Phone: ${this.settings.phone}</p>
          <div class="badge badge-emerald mt-2" style="font-size: 0.9rem; padding: 0.35rem 1rem;">PAYMENT RECEIPT</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem; margin-bottom: 1.25rem;">
          <div><strong>Receipt #:</strong> ${p.id.substring(0, 10)}</div>
          <div><strong>Payment Date:</strong> ${this.formatDateDisplay(p.date)}</div>
          <div><strong>Customer Name:</strong> ${this.escapeHtml(p.customerName)}</div>
          <div><strong>Booking Ref:</strong> ${b ? b.code : 'Direct'}</div>
          <div><strong>Payment Method:</strong> ${p.method}</div>
          <div><strong>Transaction Notes:</strong> ${this.escapeHtml(p.notes || 'None')}</div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; margin: 1rem 0;">
          <div style="display: flex; justify-content: space-between; font-size: 1.2rem; font-weight: 800; color: #059669;">
            <span>Amount Received:</span>
            <span>${this.formatCurrency(p.amount)}</span>
          </div>
          ${b ? `
            <hr class="divider">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #64748b;">
              <span>Total Booking Amount:</span>
              <span>${this.formatCurrency(b.totalAmount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #64748b;">
              <span>Total Paid to Date:</span>
              <span>${this.formatCurrency(b.advancePayment)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; font-weight: 700; color: #dc2626; margin-top: 0.25rem;">
              <span>Remaining Balance:</span>
              <span>${this.formatCurrency(b.remainingAmount)}</span>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 2rem; padding-top: 1rem; border-top: 1px dashed #cbd5e1; font-size: 0.75rem;">
          <span>Received with thanks by Cashier</span>
          <span>Authorized Signature / Stamp</span>
        </div>
      </div>
    `;

    document.getElementById('printableDocumentContainer').innerHTML = doc;
    document.getElementById('printViewModalTitle').textContent = `Payment Receipt`;
    this.setPrintButtonLabel('Print Payment Receipt');
    this.setPrintFormat(document.getElementById('printFormatSelect')?.value || 'a4');
    this.openModal('printViewModal');
  }

  previewBookingCard(bookingId) {
    const b = this.bookings.find(x => x.id === bookingId);
    if (!b) return;

    const doc = `
      <div class="printable-document" style="display: flex; justify-content: center;">
        <div class="vip-booking-card" style="width: 440px; box-shadow: none;">
          <div class="vip-card-header">
            <span class="vip-card-badge">${this.settings.hallName}</span>
            <span class="text-xs" style="color: #fbbf24;">VIP EVENT PASS • ${b.code}</span>
          </div>
          <div class="vip-guest-name">${this.escapeHtml(b.customerName)}</div>
          <div class="vip-event-details">
            <div><strong>Event:</strong> ${b.eventType}</div>
            <div><strong>Hall:</strong> ${this.getHallName(b.hallId)}</div>
            <div><strong>Date:</strong> ${this.formatDateDisplay(b.date)}</div>
            <div><strong>Time:</strong> ${this.formatTime12(b.startTime)} - ${this.formatTime12(b.endTime)}</div>
            <div><strong>Guests:</strong> ${b.guests}</div>
            <div><strong>Payment:</strong> ${b.paymentStatus}</div>
          </div>
          <div class="vip-card-footer">
            <span>Total Value: ${this.formatCurrency(b.totalAmount)}</span>
            <span>Customer Copy</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('printableDocumentContainer').innerHTML = doc;
    document.getElementById('printViewModalTitle').textContent = `Customer Booking Pass`;
    this.setPrintFormat(document.getElementById('printFormatSelect')?.value || 'a4');
    this.openModal('printViewModal');
  }

  // --- Reports & Analytics Module ---
  setReportTimeframe(frame, btn) {
    this.reportTimeframe = frame;
    document.querySelectorAll('.timeframe-buttons .btn-filter').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.renderReports();
  }

  applyCustomReportDates() {
    this.reportTimeframe = 'custom';
    document.querySelectorAll('.timeframe-buttons .btn-filter').forEach(b => b.classList.remove('active'));
    this.renderReports();
  }

  renderReports() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const filteredBookings = this.bookings.filter(b => {
      if (!b.date) return true;
      if (this.reportTimeframe === 'today') return b.date === todayStr;
      if (this.reportTimeframe === 'month') return b.date.startsWith(todayStr.substring(0, 7));
      if (this.reportTimeframe === 'year') return b.date.startsWith(todayStr.substring(0, 4));
      if (this.reportTimeframe === 'custom') {
        const start = document.getElementById('reportStartDate')?.value;
        const end = document.getElementById('reportEndDate')?.value;
        if (start && b.date < start) return false;
        if (end && b.date > end) return false;
      }
      return true;
    });

    const filteredExpenses = this.expenses.filter(e => {
      if (!e.date) return true;
      if (this.reportTimeframe === 'today') return e.date === todayStr;
      if (this.reportTimeframe === 'month') return e.date.startsWith(todayStr.substring(0, 7));
      if (this.reportTimeframe === 'year') return e.date.startsWith(todayStr.substring(0, 4));
      if (this.reportTimeframe === 'custom') {
        const start = document.getElementById('reportStartDate')?.value;
        const end = document.getElementById('reportEndDate')?.value;
        if (start && e.date < start) return false;
        if (end && e.date > end) return false;
      }
      return true;
    });

    let totalRev = 0;
    let totalPaid = 0;
    let totalPending = 0;

    filteredBookings.forEach(b => {
      totalRev += Number(b.totalAmount) || 0;
      totalPaid += Number(b.advancePayment) || 0;
      totalPending += Number(b.remainingAmount) || 0;
    });

    const totalExp = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const netProfit = totalRev - totalExp;

    document.getElementById('reportRevenueVal').textContent = this.formatCurrency(totalRev);
    document.getElementById('reportExpensesVal').textContent = this.formatCurrency(totalExp);
    document.getElementById('reportProfitVal').textContent = this.formatCurrency(netProfit);

    document.getElementById('reportTotalBookings').textContent = filteredBookings.length;
    document.getElementById('reportCompletedBookings').textContent = filteredBookings.filter(b => b.date < todayStr).length;
    document.getElementById('reportUpcomingBookings').textContent = filteredBookings.filter(b => b.date > todayStr).length;
    document.getElementById('reportTodayBookings').textContent = filteredBookings.filter(b => b.date === todayStr).length;

    document.getElementById('reportTotalInvoiced').textContent = this.formatCurrency(totalRev);
    document.getElementById('reportPaidCollection').textContent = this.formatCurrency(totalPaid);
    document.getElementById('reportPendingReceivables').textContent = this.formatCurrency(totalPending);
  }

  // --- WhatsApp Generator Module ---
  renderWhatsAppView() {
    const select = document.getElementById('waBookingSelect');
    if (!select) return;

    select.innerHTML = `<option value="">-- Choose a Booking --</option>` + this.bookings.map(b => `
      <option value="${b.id}">${b.code} — ${this.escapeHtml(b.customerName)} (${b.eventType} on ${this.formatDateDisplay(b.date)})</option>
    `).join('');
  }

  openWhatsAppForBooking(bookingId) {
    this.navigate('whatsapp');
    const select = document.getElementById('waBookingSelect');
    if (select) {
      select.value = bookingId;
      this.generateWhatsAppMessage();
    }
  }

  generateWhatsAppMessage() {
    const bookingId = document.getElementById('waBookingSelect')?.value;
    const b = this.bookings.find(x => x.id === bookingId);

    if (!b) {
      document.getElementById('waPhoneInput').value = '';
      document.getElementById('waMessageText').value = '';
      document.getElementById('waCardPreview').removeAttribute('src');
      document.getElementById('waCardEmpty').textContent = 'Select a booking to create the customer card.';
      document.getElementById('waCardEmpty').classList.remove('hidden');
      return;
    }

    document.getElementById('waPhoneInput').value = b.phone || '';
    document.getElementById('waMessageText').value = this.buildWhatsAppMessageForBooking(b);
    document.getElementById('waCardEmpty').classList.add('hidden');
    this.generateWhatsAppCard(b);
  }

  async generateWhatsAppCard(booking) {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#f8fff4');
    gradient.addColorStop(1, '#e6fbdc');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#14833b';
    context.lineWidth = 18;
    context.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
    context.fillStyle = '#08752f';
    context.textAlign = 'center';
    context.font = '700 48px Arial';
    context.fillText(this.settings.hallName || 'Marriage Hall', 450, 110);
    context.font = '28px Arial';
    context.fillText(`${this.settings.address || ''} | ${this.settings.phone || ''}`, 450, 155);
    context.strokeStyle = '#5fbd5f';
    context.lineWidth = 4;
    context.beginPath(); context.moveTo(100, 190); context.lineTo(800, 190); context.stroke();
    context.fillStyle = '#11662d';
    context.font = '700 36px Arial';
    context.fillText('CUSTOMER BOOKING DETAIL', 450, 255);
    context.fillStyle = '#111827';
    context.font = '700 48px Arial';
    context.fillText(String(booking.customerName || 'Customer'), 450, 340);
    context.font = '28px Arial';
    context.fillText(`Phone: ${booking.phone || 'Not provided'}`, 450, 390);
    context.textAlign = 'left';
    context.font = '28px Arial';
    const lines = [
      `Booking Ref: ${booking.code || ''}`,
      `Event: ${booking.eventType || ''}`,
      `Hall: ${this.getHallName(booking.hallId)}`,
      `Date: ${this.formatDateDisplay(booking.date || '')}`,
      `Time: ${this.formatTime12(booking.startTime)} - ${this.formatTime12(booking.endTime)}`,
      `Guests: ${booking.guests || ''}`
    ];
    lines.forEach((line, index) => context.fillText(line, 120, 500 + index * 48));
    context.fillStyle = '#efffdc';
    context.strokeStyle = '#42a942';
    context.lineWidth = 5;
    context.beginPath(); context.roundRect(90, 820, 720, 230, 24); context.fill(); context.stroke();
    context.textAlign = 'center';
    context.fillStyle = '#12652e';
    context.font = '700 30px Arial';
    context.fillText('TOTAL AMOUNT', 450, 875);
    context.fillStyle = '#e31818';
    context.font = '700 66px Arial';
    context.fillText(this.formatCurrency(booking.totalAmount), 450, 950);
    context.fillStyle = '#12652e';
    context.font = '700 27px Arial';
    context.fillText(`Advance Paid: ${this.formatCurrency(booking.advancePayment)}`, 450, 1005);
    context.fillText(`Balance Due: ${this.formatCurrency(booking.remainingAmount)}`, 450, 1040);
    context.font = '700 32px Arial';
    context.fillText('Thank you', 450, 1120);
    this.whatsappCardDataUrl = canvas.toDataURL('image/png');
    this.whatsappCardBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const preview = document.getElementById('waCardPreview');
    if (preview) preview.src = this.whatsappCardDataUrl;
  }

  async sendWhatsAppMessage() {
    let phone = (document.getElementById('waPhoneInput')?.value || '').replace(/\D/g, '');

    if (!phone) {
      this.showToast('Please enter customer phone number', 'error');
      return;
    }

    // Convert local format 0300... to international 92300...
    if (phone.startsWith('0')) {
      phone = '92' + phone.substring(1);
    }

    const message = document.getElementById('waMessageText')?.value || this.buildWhatsAppMessage();

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const whatsappTab = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    if (!whatsappTab) {
      this.showToast('Please allow pop-ups to open WhatsApp Web.', 'error');
    } else {
      this.showToast('WhatsApp opened with the message ready to send.', 'success');
    }
  }

  copyWhatsAppMessage() {
    const text = document.getElementById('waMessageText')?.value;
    if (!text) return;
    navigator.clipboard?.writeText(text);
    this.showToast('WhatsApp message copied to clipboard!', 'success');
  }

  downloadWhatsAppCard() {
    if (!this.whatsappCardDataUrl) {
      this.showToast('Please select a booking first.', 'error');
      return;
    }

    const link = document.createElement('a');
    link.href = this.whatsappCardDataUrl;
    link.download = `Customer_Booking_${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.showToast('Booking card downloaded successfully!', 'success');
  }

  buildWhatsAppMessage() {
    const booking = this.bookings.find(b => b.id === document.getElementById('waBookingSelect')?.value);
    return booking ? this.buildWhatsAppMessageForBooking(booking) : '';
  }

  buildWhatsAppMessageForBooking(booking) {
    return `Assalam-o-Alaikum ${booking.customerName},\n\nYour booking at ${this.settings.hallName} is confirmed.\nBooking: ${booking.code}\nEvent: ${booking.eventType}\nDate: ${this.formatDateDisplay(booking.date)}\nTime: ${this.formatTime12(booking.startTime)} - ${this.formatTime12(booking.endTime)}\nHall: ${this.getHallName(booking.hallId)}\nGuests: ${booking.guests}\nTotal: ${this.formatCurrency(booking.totalAmount)}\nAdvance: ${this.formatCurrency(booking.advancePayment)}\nBalance: ${this.formatCurrency(booking.remainingAmount)}\n\nThank you.`;
  }

  // --- Reminders & Notifications Engine ---
  renderNotifications() {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const inTwoDays = new Date();
    inTwoDays.setDate(inTwoDays.getDate() + 2);
    const inTwoDaysStr = inTwoDays.toISOString().split('T')[0];

    const alerts = [];

    this.bookings.forEach(b => {
      if (b.date === todayStr) {
        alerts.push({
          type: 'today',
          id: `${b.id}-today`,
          bookingId: b.id,
          title: `Today's Event: ${b.eventType} for ${b.customerName}`,
          subtitle: `Hall: ${this.getHallName(b.hallId)} • ${this.formatTime12(b.startTime)}`
        });
      } else if (b.date === tomorrowStr) {
        alerts.push({
          type: 'tomorrow',
          id: `${b.id}-tomorrow`,
          bookingId: b.id,
          title: `Tomorrow: ${b.eventType} for ${b.customerName}`,
          subtitle: `Hall: ${this.getHallName(b.hallId)} • ${b.guests} Guests`
        });
      } else if (b.date === inTwoDaysStr) {
        alerts.push({
          type: 'upcoming',
          id: `${b.id}-two-days`,
          bookingId: b.id,
          title: `In 2 days: ${b.eventType} for ${b.customerName}`,
          subtitle: `${this.formatDateDisplay(b.date)} • ${this.formatTime12(b.startTime)} • ${this.getHallName(b.hallId)}`
        });
      }

      if (b.remainingAmount > 0 && b.date <= inTwoDaysStr) {
        alerts.push({
          type: 'payment',
          id: `${b.id}-payment`,
          bookingId: b.id,
          title: `Pending Balance: ${this.formatCurrency(b.remainingAmount)}`,
          subtitle: `${b.customerName} (${b.code})`
        });
      }
    });

    const badge = document.getElementById('notificationBadge');
    const countText = document.getElementById('notificationCountText');
    const list = document.getElementById('notificationList');
    const readKey = `mhm_read_notifications_${todayStr}`;
    const readNotifications = JSON.parse(localStorage.getItem(readKey) || '[]');
    const unreadAlerts = alerts.filter(alert => !readNotifications.includes(alert.id));

    if (badge) {
      if (unreadAlerts.length > 0) {
        badge.textContent = unreadAlerts.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (countText) countText.textContent = `${unreadAlerts.length} unread`;

    if (list) {
      if (unreadAlerts.length === 0) {
        list.innerHTML = `<div class="empty-notification">No unread notifications</div>`;
      } else {
        list.innerHTML = unreadAlerts.map(a => `
          <div class="notification-item" role="button" tabindex="0" data-notification-id="${a.id}" data-booking-id="${a.bookingId}" title="Open booking">
            <span class="notif-icon" aria-hidden="true"></span>
            <div>
              <strong style="color: var(--text-primary); display:block;">${a.title}</strong>
              <span class="text-xs text-muted">${a.subtitle}</span>
            </div>
          </div>
        `).join('');
        list.querySelectorAll('.notification-item').forEach(item => {
          const openBooking = () => {
            this.markNotificationRead(item.dataset.notificationId);
            this.openBookingFromNotification(item.dataset.bookingId);
          };
          item.addEventListener('click', openBooking);
          item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openBooking();
            }
          });
        });
      }
    }

    this.checkTodayBookingAlerts();
  }

  markNotificationRead(notificationId) {
    if (!notificationId) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const readKey = `mhm_read_notifications_${todayStr}`;
    const readNotifications = JSON.parse(localStorage.getItem(readKey) || '[]');
    if (!readNotifications.includes(notificationId)) {
      readNotifications.push(notificationId);
      localStorage.setItem(readKey, JSON.stringify(readNotifications));
    }
    this.renderNotifications();
  }

  openBookingFromNotification(bookingId) {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) {
      this.showToast('This booking is no longer available.', 'error');
      return;
    }
    document.getElementById('notificationDropdown')?.classList.add('hidden');
    document.getElementById('notificationBtn')?.setAttribute('aria-expanded', 'false');
    this.navigate('bookings');
    this.editBooking(bookingId);
  }

  startNotificationMonitor() {
    clearInterval(this.notificationTimer);
    this.notificationTimer = setInterval(() => {
      this.renderNotifications();
      this.renderDashboard();
    }, 60 * 1000);
  }

  async requestNotificationPermission() {
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.requestNotificationPermission === 'function') {
        window.AndroidBridge.requestNotificationPermission();
      }
      if (!('Notification' in window)) {
        this.showToast('System notifications are not supported on this device.', 'error');
        return;
      }
      const permission = await Notification.requestPermission();
      const status = document.getElementById('notificationPermissionStatus');
      if (status) status.textContent = permission === 'granted' ? 'Notifications enabled' : 'Notifications blocked';
      this.showToast(permission === 'granted' ? 'Notifications enabled.' : 'Please allow notifications in device settings.', permission === 'granted' ? 'success' : 'error');
      this.checkTodayBookingAlerts();
    } catch (error) {
      this.showToast('Notification permission could not be enabled.', 'error');
    }
  }

  checkTodayBookingAlerts() {
    const todayStr = new Date().toISOString().split('T')[0];
    const inTwoDays = new Date();
    inTwoDays.setDate(inTwoDays.getDate() + 2);
    const inTwoDaysStr = inTwoDays.toISOString().split('T')[0];
    const alertBookings = this.bookings.filter(b => b.date === todayStr || b.date === inTwoDaysStr);
    if (!alertBookings.length) return;

    const notifiedKey = `mhm_notified_${todayStr}`;
    const notified = JSON.parse(localStorage.getItem(notifiedKey) || '[]');
    alertBookings.forEach(booking => {
      const isToday = booking.date === todayStr;
      const alertId = `${booking.id}-${isToday ? 'today' : 'two-days'}`;
      if (notified.includes(alertId)) return;
      const title = isToday ? `Today's booking: ${booking.customerName}` : `Booking in 2 days: ${booking.customerName}`;
      const body = `${booking.eventType} | ${this.formatDateDisplay(booking.date)} | ${this.getHallName(booking.hallId)} | ${this.formatTime12(booking.startTime) || 'Time not set'}`;

      let sent = false;
      if (window.AndroidBridge && typeof window.AndroidBridge.showBookingNotification === 'function') {
        sent = window.AndroidBridge.showBookingNotification(title, body) !== false;
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, tag: `booking-${alertId}` });
        sent = true;
      }
      if (sent) notified.push(alertId);
    });
    localStorage.setItem(notifiedKey, JSON.stringify(notified));
  }

  // --- Global Search Engine ---
  handleGlobalSearch(query) {
    const box = document.getElementById('globalSearchResults');
    const clearBtn = document.getElementById('globalSearchClear');
    if (!box) return;

    const q = (query || '').trim().toLowerCase();
    if (!q) {
      box.classList.add('hidden');
      clearBtn?.classList.add('hidden');
      return;
    }

    clearBtn?.classList.remove('hidden');

    const results = [];

    // Search Customers
    this.customers.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.phone.includes(q)) {
        results.push({
          cat: 'Customer',
          title: c.name,
          sub: `Phone: ${c.phone} | CNIC: ${c.cnic || 'N/A'}`,
          action: () => { this.navigate('customers'); this.viewCustomerProfile(c.id); }
        });
      }
    });

    // Search Bookings
    this.bookings.forEach(b => {
      if (b.code.toLowerCase().includes(q) || b.customerName.toLowerCase().includes(q) || b.phone.includes(q)) {
        results.push({
          cat: 'Booking',
          title: `${b.code} — ${b.customerName}`,
          sub: `${b.eventType} on ${this.formatDateDisplay(b.date)} (${this.getHallName(b.hallId)})`,
          action: () => { this.navigate('bookings'); this.previewInvoice(b.id); }
        });
      }
    });

    // Search Halls
    this.halls.forEach(h => {
      if (h.name.toLowerCase().includes(q) || h.number?.toLowerCase().includes(q)) {
        results.push({
          cat: 'Hall',
          title: `${h.name} (${h.number})`,
          sub: `Capacity: ${h.capacity} | Rent: ${this.formatCurrency(h.rent)}`,
          action: () => this.navigate('halls')
        });
      }
    });

    if (results.length === 0) {
      box.innerHTML = `<div class="p-3 text-sm text-muted text-center">No results found for "${this.escapeHtml(q)}"</div>`;
    } else {
      box.innerHTML = results.slice(0, 8).map((r, idx) => `
        <div class="search-result-item" data-idx="${idx}">
          <div>
            <span class="search-result-category">${r.cat}</span>
            <div class="font-bold text-sm">${this.escapeHtml(r.title)}</div>
            <div class="text-xs text-muted">${this.escapeHtml(r.sub)}</div>
          </div>
        </div>
      `).join('');

      box.querySelectorAll('.search-result-item').forEach((el, idx) => {
        el.addEventListener('click', () => {
          results[idx].action();
          box.classList.add('hidden');
        });
      });
    }

    box.classList.remove('hidden');
  }

  // --- Settings & PIN Lock Security ---
  renderSettings() {
    if (document.getElementById('settingHallName')) document.getElementById('settingHallName').value = this.settings.hallName || '';
    if (document.getElementById('settingAddress')) document.getElementById('settingAddress').value = this.settings.address || '';
    if (document.getElementById('settingPhone')) document.getElementById('settingPhone').value = this.settings.phone || '';
    if (document.getElementById('settingWhatsApp')) document.getElementById('settingWhatsApp').value = this.settings.whatsapp || '';
    if (document.getElementById('settingCurrency')) document.getElementById('settingCurrency').value = this.settings.currency || 'Rs.';
    if (document.getElementById('settingTax')) document.getElementById('settingTax').value = this.settings.taxRate || 0;
    if (document.getElementById('settingInvoiceFooter')) document.getElementById('settingInvoiceFooter').value = this.settings.invoiceFooter || '';
    if (document.getElementById('settingPinEnabled')) document.getElementById('settingPinEnabled').checked = !!this.settings.pinEnabled;
    if (document.getElementById('settingSoundEnabled')) document.getElementById('settingSoundEnabled').checked = this.settings.soundEnabled !== false;
    const status = document.getElementById('notificationPermissionStatus');
    if (status) status.textContent = 'Notification permission is checked when you enable it.';
  }

  async saveSettings(e) {
    e.preventDefault();
    this.settings.hallName = document.getElementById('settingHallName')?.value || 'Royal Palace Banquet';
    this.settings.address = document.getElementById('settingAddress')?.value || '';
    this.settings.phone = document.getElementById('settingPhone')?.value || '';
    this.settings.whatsapp = document.getElementById('settingWhatsApp')?.value || '';
    this.settings.currency = document.getElementById('settingCurrency')?.value || 'Rs.';
    this.settings.taxRate = Number(document.getElementById('settingTax')?.value) || 0;
    this.settings.invoiceFooter = document.getElementById('settingInvoiceFooter')?.value || '';

    for (const [k, v] of Object.entries(this.settings)) {
      await this.saveToStore('settings', { id: k, value: v });
    }

    this.showToast('Settings saved successfully!', 'success');
    this.renderAll();
  }

  togglePinProtection(enabled) {
    if (!enabled) {
      this.settings.pinEnabled = true;
      const toggle = document.getElementById('settingPinEnabled');
      if (toggle) toggle.checked = true;
      this.showToast('PIN protection is required to open the software.', 'error');
      return;
    }
    this.settings.pinEnabled = enabled;
    this.saveToStore('settings', { id: 'pinEnabled', value: enabled });
    this.showToast(`PIN Security ${enabled ? 'Enabled' : 'Disabled'}`, 'success');
  }

  toggleSound(enabled) {
    this.settings.soundEnabled = !!enabled;
    this.saveToStore('settings', { id: 'soundEnabled', value: this.settings.soundEnabled });
    if (this.settings.soundEnabled) this.playClickSound();
  }

  updatePin() {
    const newPin = document.getElementById('newPinInput')?.value;
    if (!newPin || newPin.length !== 4 || isNaN(newPin)) {
      this.showToast('Please enter a valid 4-digit numeric PIN', 'error');
      return;
    }
    this.settings.pinCode = newPin;
    this.settings.pinEnabled = true;
    document.getElementById('settingPinEnabled').checked = true;
    this.saveToStore('settings', { id: 'pinCode', value: newPin });
    this.saveToStore('settings', { id: 'pinEnabled', value: true });
    document.getElementById('newPinInput').value = '';
    this.showToast('PIN updated successfully!', 'success');
  }

  checkPinLockOnLaunch() {
    window.setTimeout(() => {
      document.getElementById('splashScreen')?.classList.add('hidden');
      if (this.isSoftwareExpired()) {
        this.showExpiredLock();
        return;
      }
      const hasValidPin = this.settings.pinEnabled && /^\d{4}$/.test(String(this.settings.pinCode || ''));
      if (hasValidPin) this.lockApp();
      else this.startPinSetup();
    }, 1200);
  }

  startPinSetup() {
    this.pinSetupMode = true;
    this.pendingPin = '';
    this.enteredPin = '';
    this.updatePinDots();
    document.getElementById('pinTitle').textContent = 'Create Security PIN';
    document.getElementById('pinSubtitle').textContent = 'Set a 4-digit PIN before using Marriage Hall Manager';
    document.getElementById('pinError').textContent = '';
    document.getElementById('pinLockOverlay')?.classList.remove('hidden');
  }

  lockApp() {
    if (this.isSoftwareExpired()) {
      this.showExpiredLock();
      return;
    }
    this.pinSetupMode = false;
    this.enteredPin = '';
    this.updatePinDots();
    document.getElementById('pinTitle').textContent = 'Enter Security PIN';
    document.getElementById('pinSubtitle').textContent = 'Marriage Hall Manager is protected';
    document.getElementById('pinError').textContent = '';
    document.getElementById('pinLockOverlay')?.classList.remove('hidden');
  }

  isSoftwareExpired() {
    const expiryDate = String(window.MARRIAGE_HALL_EXPIRY_DATE || '');
    return !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || this.getLocalDateString() >= expiryDate;
  }

  showExpiredLock() {
    this.pinSetupMode = false;
    this.enteredPin = '';
    this.updatePinDots();
    document.getElementById('pinTitle').textContent = 'Software Expired';
    const expiryDate = String(window.MARRIAGE_HALL_EXPIRY_DATE || '');
    document.getElementById('pinSubtitle').textContent = `Expiry date: ${this.formatDateDisplay(expiryDate)}`;
    document.getElementById('pinError').textContent = 'Update and reopen the software.';
    document.getElementById('pinLockOverlay')?.classList.remove('hidden');
    document.getElementById('pinLockOverlay')?.classList.add('expired-state');
  }

  enterPin(digit) {
    if (this.enteredPin.length < 4) {
      this.enteredPin += digit;
      this.updatePinDots();

      if (this.enteredPin.length === 4) {
        setTimeout(() => this.pinSetupMode ? this.handlePinSetupStep() : this.verifyEnteredPin(), 100);
      }
    }
  }

  clearPin() {
    this.enteredPin = '';
    this.updatePinDots();
    document.getElementById('pinError').textContent = '';
  }

  backspacePin() {
    this.enteredPin = this.enteredPin.slice(0, -1);
    this.updatePinDots();
  }

  handlePinSetupStep() {
    if (!this.pendingPin) {
      this.pendingPin = this.enteredPin;
      this.enteredPin = '';
      this.updatePinDots();
      document.getElementById('pinTitle').textContent = 'Confirm Security PIN';
      document.getElementById('pinSubtitle').textContent = 'Enter the same 4-digit PIN again';
      return;
    }

    if (this.enteredPin !== this.pendingPin) {
      document.getElementById('pinError').textContent = 'PINs do not match. Create your PIN again.';
      this.pendingPin = '';
      this.enteredPin = '';
      this.updatePinDots();
      document.getElementById('pinTitle').textContent = 'Create Security PIN';
      document.getElementById('pinSubtitle').textContent = 'Set a 4-digit PIN before using Marriage Hall Manager';
      return;
    }

    this.settings.pinCode = this.pendingPin;
    this.settings.pinEnabled = true;
    this.saveToStore('settings', { id: 'pinCode', value: this.pendingPin });
    this.saveToStore('settings', { id: 'pinEnabled', value: true });
    this.pinSetupMode = false;
    this.pendingPin = '';
    this.enteredPin = '';
    this.updatePinDots();
    document.getElementById('pinError').textContent = '';
    document.getElementById('pinLockOverlay')?.classList.add('hidden');
  }

  updatePinDots() {
    const dots = document.querySelectorAll('.pin-dots .pin-dot');
    dots.forEach((dot, idx) => {
      if (idx < this.enteredPin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    });
  }

  verifyEnteredPin() {
    if (this.isSoftwareExpired()) {
      this.showExpiredLock();
      return;
    }
    const correctPin = this.settings.pinCode || '1234';
    if (this.enteredPin === correctPin) {
      document.getElementById('pinLockOverlay')?.classList.add('hidden');
      this.enteredPin = '';
    } else {
      document.getElementById('pinError').textContent = 'Incorrect PIN. Try again.';
      this.enteredPin = '';
      this.updatePinDots();
    }
  }

  // --- Backup & Restore Engine ---
  exportBackupJSON() {
    const backupData = {
      app: 'Marriage Hall Manager',
      developer: 'PK-RajWolrd',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      halls: this.halls,
      customers: this.customers,
      bookings: this.bookings,
      payments: this.payments,
      expenses: this.expenses,
      catering: this.catering,
      decorations: this.decorations,
      staff: this.staff,
      settings: this.settings
    };

    const jsonStr = JSON.stringify(backupData, null, 2);

    if (window.AndroidBridge && typeof window.AndroidBridge.shareText === 'function') {
      window.AndroidBridge.shareText(`Marriage_Hall_Backup_${new Date().toISOString().split('T')[0]}`, jsonStr);
      this.showToast('Backup prepared for Android saving / sharing!', 'success');
    } else {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MarriageHallBackup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Backup JSON downloaded successfully!', 'success');
    }
  }

  importBackupJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.halls && !data.bookings) {
          throw new Error('Invalid backup file format');
        }

        if (!confirm('Are you sure you want to restore this data? It will merge with or replace current records.')) {
          return;
        }

        if (data.halls) for (const h of data.halls) await this.saveToStore('halls', h);
        if (data.customers) for (const c of data.customers) await this.saveToStore('customers', c);
        if (data.bookings) for (const b of data.bookings) await this.saveToStore('bookings', b);
        if (data.payments) for (const p of data.payments) await this.saveToStore('payments', p);
        if (data.expenses) for (const ex of data.expenses) await this.saveToStore('expenses', ex);
        if (data.catering) for (const cat of data.catering) await this.saveToStore('catering', cat);
        if (data.decorations) for (const d of data.decorations) await this.saveToStore('decorations', d);
        if (data.staff) for (const s of data.staff) await this.saveToStore('staff', s);

        await this.loadAllData();
        this.renderAll();
        this.showToast('Data restored successfully from backup!', 'success');
      } catch (err) {
        this.showToast('Error restoring backup file: Invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
  }

  confirmResetAllData() {
    if (confirm('CRITICAL WARNING: Are you sure you want to completely clear all data? This cannot be undone!')) {
      this.clearAllStores();
    }
  }

  async clearAllStores() {
    const stores = ['halls', 'customers', 'bookings', 'payments', 'expenses', 'catering', 'decorations', 'staff'];
    for (const s of stores) {
      if (this.db) {
        const tx = this.db.transaction(s, 'readwrite');
        tx.objectStore(s).clear();
      }
      localStorage.removeItem(`mhm_${s}`);
    }
    this.halls = [];
    this.customers = [];
    this.bookings = [];
    this.payments = [];
    this.expenses = [];
    this.catering = [];
    this.decorations = [];
    this.staff = [];
    this.renderAll();
    this.showToast('All local data cleared.', 'success');
  }

  // --- Preloaded Demo Dataset ---
  async loadDemoData(force = false) {
    if (!force && this.halls.length > 0) return;

    const demoHalls = [
      { id: 'hall_1', name: 'Royal Grand Banquet', number: 'H-01', capacity: 600, rent: 180000, status: 'Available', facilities: 'Centrally AC, Crystal Chandeliers, Bridal Suite, Sound System', address: 'Main Club Boulevard, Sector G-6', description: 'Our flagship grand ballroom suitable for high-profile weddings.' },
      { id: 'hall_2', name: 'Sheesh Mahal Marquee', number: 'H-02', capacity: 400, rent: 140000, status: 'Available', facilities: 'Glass Stage, Floral Archway, VIP Executive Lounge, Backup Power', address: 'Banquet Row 2', description: 'Intimate and lavish marquee with signature mirror decor.' },
      { id: 'hall_3', name: 'Kohinoor Lawn & Hall', number: 'H-03', capacity: 800, rent: 220000, status: 'Available', facilities: 'Open Lawn & Covered Pavilion, 200 Car Parking, Fountain Walkway', address: 'North Lawn Avenue', description: 'Spacious indoor-outdoor venue for mega celebrations and Walima.' }
    ];

    const demoCustomers = [
      { id: 'cust_1', name: 'Malik Tariq Mehmood', fatherName: 'Chaudhry Mehmood', phone: '0300-5551234', whatsapp: '0300-5551234', cnic: '37405-1234567-1', address: 'F-8/2, Islamabad', notes: 'VIP client, prefers front stage flower decor' },
      { id: 'cust_2', name: 'Dr. Shahzad Rafiq', fatherName: 'Rafiq Ahmed', phone: '0321-8884321', whatsapp: '0321-8884321', cnic: '37405-7654321-3', address: 'DHA Phase 2', notes: 'Daughter wedding ceremony' },
      { id: 'cust_3', name: 'Haji Aslam Khan', fatherName: 'Khan Muhammad', phone: '0333-9998877', whatsapp: '0333-9998877', cnic: '37405-9988776-5', address: 'Satellite Town', notes: 'Walima reception with special mutton menu' },
      { id: 'cust_4', name: 'Kamran Siddiqui', fatherName: 'Abdul Latif', phone: '0345-2223344', whatsapp: '0345-2223344', cnic: '37405-3344556-7', address: 'Bahria Town Phase 4', notes: 'Mehndi ceremony' },
      { id: 'cust_5', name: 'Noman Bashir', fatherName: 'Bashir Hussain', phone: '0302-6667788', whatsapp: '0302-6667788', cnic: '37405-4455667-9', address: 'G-11/3', notes: 'Corporate annual gala' }
    ];

    const demoCatering = [
      { id: 'cat_1', name: 'Royal Wedding Feast', pricePerPerson: 1650, items: 'Mutton Degi Biryani, Chicken Karahi Desi Ghee, Beef Seekh Kabab, Roghani Naan, Fresh Salad, Mint Raita, Badami Kheer, Soft Drinks', description: 'Our highest rated traditional wedding menu with uniformed waiter service.' },
      { id: 'cat_2', name: 'Executive Walima Menu', pricePerPerson: 1950, items: 'Mutton Qorma, Chicken Pulao, Fish Fry (Finger), Shahi Tukray, Fresh Naan, Salad Bar, Raita, Mineral Water, Green Tea', description: 'Premium selection tailored for sophisticated receptions.' },
      { id: 'cat_3', name: 'Standard Mehndi Refreshment', pricePerPerson: 1100, items: 'Chicken Biryani, Chicken Tikka Boti, Puri & Halwa, Cold Drinks, Kashmiri Chai', description: 'Vibrant and delicious treats for energetic Mehndi nights.' }
    ];

    const demoDecorations = [
      { id: 'dec_1', name: 'Royal Gold & White Theme', price: 75000, description: 'Golden carved couple stage, crystal backdrop, warm fairy light chandeliers, and white roses entry pathway.' },
      { id: 'dec_2', name: 'Emerald Velvet Stage', price: 90000, description: 'Deep emerald backdrop, imported red roses arch, royal sofa, spotlight setup, and smoke effect.' },
      { id: 'dec_3', name: 'Traditional Floral Mehndi Decor', price: 50000, description: 'Yellow marigold hangings, ethnic cushions, swing for bride, fairy lighting and dholak seating.' }
    ];

    const demoStaff = [
      { id: 'stf_1', name: 'Zahid Hussain', position: 'Manager', phone: '0300-1112233', salary: 65000, joiningDate: '2024-01-15', address: 'G-9, Islamabad', notes: 'Floor & banquet operations head' },
      { id: 'stf_2', name: 'Sajid Ali', position: 'Decorator', phone: '0321-4445566', salary: 45000, joiningDate: '2024-03-01', address: 'Rawalpindi', notes: 'Stage lighting and floral technician' },
      { id: 'stf_3', name: 'Umar Farooq', position: 'Security', phone: '0333-7778899', salary: 35000, joiningDate: '2024-02-10', address: 'Sector I-8', notes: 'Gate & parking security chief' }
    ];

    const now = new Date();
    const d1 = now.toISOString().split('T')[0];
    const d2 = new Date(now.getTime() + 86400000 * 2).toISOString().split('T')[0];
    const d3 = new Date(now.getTime() + 86400000 * 5).toISOString().split('T')[0];
    const d4 = new Date(now.getTime() + 86400000 * 9).toISOString().split('T')[0];
    const d5 = new Date(now.getTime() - 86400000 * 3).toISOString().split('T')[0];

    const demoBookings = [
      { id: 'bk_demo_1', code: 'BK-100201', customerId: 'cust_1', customerName: 'Malik Tariq Mehmood', phone: '0300-5551234', eventType: 'Wedding', hallId: 'hall_1', date: d1, startTime: '19:00', endTime: '23:30', guests: 500, cateringId: 'cat_1', decorationId: 'dec_1', hallRent: 180000, foodCharges: 825000, decorCharges: 75000, otherCharges: 20000, totalAmount: 1100000, advancePayment: 600000, remainingAmount: 500000, paymentStatus: 'Partially Paid', notes: 'High VIP guest protocol required', createdAt: Date.now() - 100000 },
      { id: 'bk_demo_2', code: 'BK-100202', customerId: 'cust_2', customerName: 'Dr. Shahzad Rafiq', phone: '0321-8884321', eventType: 'Walima', hallId: 'hall_2', date: d2, startTime: '20:00', endTime: '23:45', guests: 350, cateringId: 'cat_2', decorationId: 'dec_2', hallRent: 140000, foodCharges: 682500, decorCharges: 90000, otherCharges: 10000, totalAmount: 922500, advancePayment: 922500, remainingAmount: 0, paymentStatus: 'Paid', notes: 'Full settlement paid in advance', createdAt: Date.now() - 90000 },
      { id: 'bk_demo_3', code: 'BK-100203', customerId: 'cust_3', customerName: 'Haji Aslam Khan', phone: '0333-9998877', eventType: 'Baraat', hallId: 'hall_3', date: d3, startTime: '18:30', endTime: '23:00', guests: 700, cateringId: 'cat_1', decorationId: 'dec_1', hallRent: 220000, foodCharges: 1155000, decorCharges: 75000, otherCharges: 30000, totalAmount: 1480000, advancePayment: 500000, remainingAmount: 980000, paymentStatus: 'Partially Paid', notes: 'Groom family arrival at 19:30', createdAt: Date.now() - 80000 },
      { id: 'bk_demo_4', code: 'BK-100204', customerId: 'cust_4', customerName: 'Kamran Siddiqui', phone: '0345-2223344', eventType: 'Mehndi', hallId: 'hall_2', date: d4, startTime: '19:00', endTime: '23:30', guests: 300, cateringId: 'cat_3', decorationId: 'dec_3', hallRent: 140000, foodCharges: 330000, decorCharges: 50000, otherCharges: 15000, totalAmount: 535000, advancePayment: 100000, remainingAmount: 435000, paymentStatus: 'Partially Paid', notes: 'Yellow rose petals for entrance', createdAt: Date.now() - 70000 },
      { id: 'bk_demo_5', code: 'BK-100205', customerId: 'cust_5', customerName: 'Noman Bashir', phone: '0302-6667788', eventType: 'Corporate Event', hallId: 'hall_1', date: d5, startTime: '18:00', endTime: '22:00', guests: 400, cateringId: 'cat_2', decorationId: '', hallRent: 180000, foodCharges: 780000, decorCharges: 0, otherCharges: 20000, totalAmount: 980000, advancePayment: 980000, remainingAmount: 0, paymentStatus: 'Paid', notes: 'Completed event without dues', createdAt: Date.now() - 60000 }
    ];

    const demoPayments = [
      { id: 'pay_demo_1', bookingId: 'bk_demo_1', customerName: 'Malik Tariq Mehmood', amount: 600000, date: d1, method: 'Bank Transfer', notes: 'Token advance pay via Meezan Bank' },
      { id: 'pay_demo_2', bookingId: 'bk_demo_2', customerName: 'Dr. Shahzad Rafiq', amount: 922500, date: d2, method: 'Bank Transfer', notes: 'Full invoice cleared' },
      { id: 'pay_demo_3', bookingId: 'bk_demo_3', customerName: 'Haji Aslam Khan', amount: 500000, date: d3, method: 'Cash', notes: 'Cash deposit at reception' }
    ];

    const demoExpenses = [
      { id: 'exp_demo_1', title: 'Monthly Generator Fuel / Diesel', category: 'Electricity', amount: 85000, date: d1, description: 'PSO 300 liters diesel supply' },
      { id: 'exp_demo_2', title: 'Fresh Flower Stage Purchase', category: 'Decoration', amount: 45000, date: d2, description: 'Rose and Lily stems from Rawalpindi Mandi' },
      { id: 'exp_demo_3', title: 'Staff Monthly Tea & Refreshments', category: 'Food', amount: 15000, date: d5, description: 'Kitchen pantry stock' },
      { id: 'exp_demo_4', title: 'Carpet & Sofa Deep Cleaning Service', category: 'Cleaning', amount: 28000, date: d5, description: 'Pre-season sanitization' }
    ];

    for (const h of demoHalls) await this.saveToStore('halls', h);
    for (const c of demoCustomers) await this.saveToStore('customers', c);
    for (const cat of demoCatering) await this.saveToStore('catering', cat);
    for (const d of demoDecorations) await this.saveToStore('decorations', d);
    for (const s of demoStaff) await this.saveToStore('staff', s);
    for (const b of demoBookings) await this.saveToStore('bookings', b);
    for (const p of demoPayments) await this.saveToStore('payments', p);
    for (const ex of demoExpenses) await this.saveToStore('expenses', ex);

    await this.loadAllData();
    this.renderAll();
    if (force) this.showToast('Demo data loaded successfully!', 'success');
  }

  // --- Modal Helpers & Select Population ---
  populateSelectDropdowns() {
    // Populate Halls in booking modal & filter
    const hallSelect = document.getElementById('bookingHallId');
    const filterHall = document.getElementById('bookingFilterHall');
    if (hallSelect) {
      hallSelect.innerHTML = `<option value="">-- Choose Hall --</option>` + this.halls.map(h => `
        <option value="${h.id}">${h.name} (Cap: ${h.capacity})</option>
      `).join('');
    }
    if (filterHall) {
      filterHall.innerHTML = `<option value="">All Halls</option>` + this.halls.map(h => `
        <option value="${h.id}">${h.name}</option>
      `).join('');
    }

    // Populate Customers in booking modal
    const custSelect = document.getElementById('bookingCustomerId');
    if (custSelect) {
      custSelect.innerHTML = `<option value="">-- Select Customer --</option>` + this.customers.map(c => `
        <option value="${c.id}">${c.name} (${c.phone})</option>
      `).join('');
    }

    // Populate Catering packages
    const catSelect = document.getElementById('bookingCateringId');
    if (catSelect) {
      catSelect.innerHTML = `<option value="" data-price="0">-- None (Self Catering) --</option>` + this.catering.map(c => `
        <option value="${c.id}" data-price="${c.pricePerPerson}">${c.name} (${this.formatCurrency(c.pricePerPerson)}/person)</option>
      `).join('');
    }

    // Populate Decorations
    const decSelect = document.getElementById('bookingDecorationId');
    if (decSelect) {
      decSelect.innerHTML = `<option value="" data-price="0">-- None (Basic Included) --</option>` + this.decorations.map(d => `
        <option value="${d.id}" data-price="${d.price}">${d.name} (${this.formatCurrency(d.price)})</option>
      `).join('');
    }

    // Populate Bookings in Payment modal
    const payBooking = document.getElementById('payBookingId');
    if (payBooking) {
      payBooking.innerHTML = `<option value="">-- Choose Booking --</option>` + this.bookings.map(b => `
        <option value="${b.id}">${b.code} — ${this.escapeHtml(b.customerName)} (${b.date})</option>
      `).join('');
    }
  }

  getHallName(id) {
    const h = this.halls.find(x => x.id === id);
    return h ? h.name : 'Banquet Hall';
  }

  getBookingCode(id) {
    const b = this.bookings.find(x => x.id === id);
    return b ? b.code : (id ? id.substring(0, 8) : 'Direct');
  }

  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    el.classList.remove('hidden');
    document.body.classList.add('modal-open');
    const body = el.querySelector('.modal-body');
    if (body) {
      body.scrollTop = 0;
    }
  }

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.add('hidden');
    }
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    if (openModals.length === 0) {
      document.body.classList.remove('modal-open');
    }
  }

  confirmDelete(type, id) {
    const modal = document.getElementById('confirmModal');
    const msg = document.getElementById('confirmModalMessage');
    const btn = document.getElementById('confirmActionBtn');
    if (!modal || !btn) return;

    msg.textContent = `Are you sure you want to delete this ${type} record?`;
    btn.onclick = async () => {
      if (type === 'booking') {
        await this.deleteFromStore('bookings', id);
        this.bookings = this.bookings.filter(b => b.id !== id);
      } else if (type === 'hall') {
        await this.deleteFromStore('halls', id);
        this.halls = this.halls.filter(h => h.id !== id);
      } else if (type === 'customer') {
        await this.deleteFromStore('customers', id);
        this.customers = this.customers.filter(c => c.id !== id);
      } else if (type === 'payment') {
        await this.deleteFromStore('payments', id);
        this.payments = this.payments.filter(p => p.id !== id);
      } else if (type === 'expense') {
        await this.deleteFromStore('expenses', id);
        this.expenses = this.expenses.filter(e => e.id !== id);
      } else if (type === 'catering') {
        await this.deleteFromStore('catering', id);
        this.catering = this.catering.filter(c => c.id !== id);
      } else if (type === 'decoration') {
        await this.deleteFromStore('decorations', id);
        this.decorations = this.decorations.filter(d => d.id !== id);
      } else if (type === 'staff') {
        await this.deleteFromStore('staff', id);
        this.staff = this.staff.filter(s => s.id !== id);
      }

      this.closeModal('confirmModal');
      this.showToast('Record deleted successfully', 'success');
      this.renderAll();
    };

    this.openModal('confirmModal');
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : '⚠️'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- PWA & Multi-Device Integration ---
  initPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPwaPrompt = e;
      document.getElementById('installPwaBtn')?.classList.remove('hidden');
      const settingsBtn = document.getElementById('settingsInstallBtn');
      if (settingsBtn) settingsBtn.textContent = '📥 Install App to Device';
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPwaPrompt = null;
      document.getElementById('installPwaBtn')?.classList.add('hidden');
      this.showToast('Marriage Hall Manager installed successfully!', 'success');
      this.detectPlatform();
    });
  }

  async installPwa() {
    if (this.deferredPwaPrompt) {
      this.deferredPwaPrompt.prompt();
      const { outcome } = await this.deferredPwaPrompt.userChoice;
      if (outcome === 'accepted') {
        this.showToast('App installed to your device!', 'success');
      }
      this.deferredPwaPrompt = null;
      document.getElementById('installPwaBtn')?.classList.add('hidden');
    } else if (window.AndroidBridge && typeof window.AndroidBridge.isAndroidApp === 'function') {
      this.showToast('You are running inside the native Android App!', 'info');
    } else {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        alert("To install on mobile: Tap browser menu (⋮ or Share icon) and choose 'Add to Home screen' or 'Install App'.");
      } else {
        alert("To install on PC: Click the install icon (⊕ or 📥) in your browser address bar (Chrome, Edge, Brave) to install Marriage Hall Manager as a desktop application.");
      }
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  triggerPrint() {
    const modal = document.getElementById('printViewModal');
    const format = modal?.dataset.printFormat === 'thermal' ? 'thermal' : 'a4';
    const title = document.getElementById('printViewModalTitle')?.textContent || 'Marriage_Hall_Document';
    const source = document.getElementById('printableDocumentContainer');

    if (!source || !source.innerHTML.trim()) {
      this.showToast('There is no document data to print.', 'error');
      return;
    }

    const pageRule = format === 'thermal'
      ? '@page { size: 80mm auto; margin: 2mm; }'
      : '@page { size: A4; margin: 8mm; }';

    /*
     * IMPORTANT:
     * Do not print the modal itself. Some browsers/WebViews treat the
     * scrollable modal as a clipped/empty print layer. We create a clean
     * print document containing only the actual customer document.
     */
    const collectCss = () => {
      let css = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          if (sheet.cssRules) {
            css += Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
          }
        } catch (e) {
          // Ignore cross-origin stylesheets; the core local stylesheet is readable.
        }
      }
      return css;
    };

    const printCss = `
      ${pageRule}
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: auto !important;
        min-height: 0 !important;
        height: auto !important;
        overflow: visible !important;
        background: #fff !important;
        color: #000 !important;
      }

      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .print-root {
        display: block !important;
        width: 100% !important;
        max-width: none !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        position: static !important;
        background: #fff !important;
        color: #000 !important;
      }

      .printable-document {
        display: block !important;
        width: 100% !important;
        max-width: none !important;
        min-width: 0 !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 auto !important;
        padding: 0 !important;
        overflow: visible !important;
        position: static !important;
        background: #fff !important;
        color: #000 !important;
      }

      .no-print,
      .modal-header,
      .print-format-control,
      #printDocumentButton {
        display: none !important;
      }

      table {
        width: 100% !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        overflow-wrap: anywhere !important;
      }

      .inv-header {
        flex-wrap: wrap !important;
        gap: 0.5rem !important;
      }

      .inv-header > *,
      .inv-meta-grid > *,
      .printable-document * {
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-wrap: anywhere !important;
      }

      img, svg {
        max-width: 100%;
        break-inside: avoid;
      }

      * {
        overflow: visible !important;
      }

      @media print {
        html, body {
          overflow: visible !important;
          height: auto !important;
          min-height: 0 !important;
        }

        .print-root {
          filter: grayscale(1) !important;
        }

        .print-root,
        .printable-document {
          width: 100% !important;
          max-width: 100% !important;
          overflow: visible !important;
          height: auto !important;
          min-height: 0 !important;
        }

        * {
          overflow: visible !important;
          box-sizing: border-box;
        }

        .page-break,
        .avoid-break {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `;

    // Android: send the document AND its CSS directly to the native printer.
    // This avoids loading a relative stylesheet in the temporary WebView.
    if (window.AndroidBridge && typeof window.AndroidBridge.printDocument === 'function') {
      try {
        const css = collectCss();
        window.AndroidBridge.printDocument(title, source.innerHTML, format, css + printCss);
      } catch (e) {
        console.error('Native print failed:', e);
        this.showToast('Print could not be started.', 'error');
      }
      return;
    }

    // Browser/Chrome/Edge: print a dedicated iframe instead of the scrollable modal.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.title = 'Print document';
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.border = '0';
    iframe.style.margin = '0';
    iframe.style.padding = '0';
    iframe.style.opacity = '0';
    iframe.style.zIndex = '-1';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const css = collectCss();
    const docHtml = source.innerHTML;

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const printFrame = () => {
      try {
        const frameWindow = iframe.contentWindow;
        const frameDoc = iframe.contentDocument || frameWindow.document;
        if (!frameWindow || !frameDoc) {
          cleanup();
          this.showToast('Print preview could not be prepared.', 'error');
          return;
        }

        frameDoc.open();
        frameDoc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>${css}</style>
  <style>${printCss}</style>
</head>
<body>
  <main class="print-root">
    <div class="printable-document">${docHtml}</div>
  </main>
</body>
</html>`);
        frameDoc.close();

        const waitForImages = Array.from(frameDoc.images || []);
        Promise.all(waitForImages.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        })).then(() => {
          frameWindow.focus();
          window.setTimeout(() => {
            frameWindow.print();
            window.setTimeout(cleanup, 1000);
          }, 150);
        });
      } catch (e) {
        console.error('Browser print failed:', e);
        cleanup();
        this.showToast('Print could not be started.', 'error');
      }
    };

    // Wait one frame so the browser has attached the iframe document.
    window.requestAnimationFrame(printFrame);
  }

  testPrintPage() {
    const doc = `
      <div class="printable-document" style="max-width: 600px; margin: 2rem auto; padding: 2.5rem; border: 2px solid #0f172a; border-radius: 8px; font-family: sans-serif; background: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #eab308; padding-bottom: 1rem; margin-bottom: 1.5rem;">
          <h2 style="color: #0f172a; margin: 0;">${this.escapeHtml(this.settings.hallName)}</h2>
          <p style="color: #64748b; margin: 0.25rem 0;">100% Offline System — Multi-Device Printer Test</p>
        </div>
        <p><strong>Detected Platform:</strong> ${this.getPlatformName()}</p>
        <p><strong>Device Screen:</strong> ${window.innerWidth}px × ${window.innerHeight}px</p>
        <p><strong>Print Engine:</strong> ${window.AndroidBridge ? 'Android Native PrintManager' : 'Browser Web Print'}</p>
        <p><strong>Status:</strong> Verification successful. Print invoices, receipts, and passes on this device anytime without internet.</p>
        <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid #cbd5e1;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #64748b;">
          <span>Developer: PK-RajWolrd</span>
          <span>Date: ${new Date().toLocaleString()}</span>
        </div>
      </div>
    `;
    document.getElementById('printableDocumentContainer').innerHTML = doc;
    document.getElementById('printViewModalTitle').textContent = 'Device Print Test';
    this.openModal('printViewModal');
  }

  getPlatformName() {
    if (window.AndroidBridge && typeof window.AndroidBridge.isAndroidApp === 'function') {
      return 'Android Native Mobile App';
    }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const ua = navigator.userAgent;
    const width = window.innerWidth;
    if (/Mobi|Android/i.test(ua) && width < 768) {
      return isStandalone ? 'Mobile Phone (Installed PWA)' : 'Mobile Phone (Web Browser)';
    } else if (/iPad|Tablet/i.test(ua) || (width >= 768 && width <= 1024)) {
      return isStandalone ? 'Tablet Device (Installed PWA)' : 'Tablet Device (Web Browser)';
    } else {
      return isStandalone ? 'PC / Desktop (Installed App)' : 'PC / Laptop Desktop Website';
    }
  }

  detectPlatform() {
    const platformName = this.getPlatformName();
    const badge = document.getElementById('detectedPlatformBadge');
    const desc = document.getElementById('detectedPlatformDescription');
    if (badge) badge.textContent = `💻 ${platformName}`;
    if (desc) {
      if (platformName.includes('Android')) {
        desc.textContent = 'Running inside native Android Mobile App with system print, file chooser, and gesture navigation support.';
      } else if (platformName.includes('Mobile')) {
        desc.textContent = 'Optimized for Mobile Phone with bottom navigation, touch-friendly 48dp+ controls, and offline PWA capability.';
      } else if (platformName.includes('Tablet')) {
        desc.textContent = 'Optimized for Tablet touch screens with adaptive layout, responsive calendar, and widescreen forms.';
      } else {
        desc.textContent = 'Optimized for PC / Laptop Desktop with wide dashboard, sidebar navigation, keyboard shortcuts, and A4 print.';
      }
    }
  }

  setupBackPressHandler() {
    window.handleAndroidBackPress = () => {
      const openModals = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden)'));
      if (openModals.length > 0) {
        const topModal = openModals[openModals.length - 1];
        topModal.classList.add('hidden');
        return true;
      }
      const moreSheet = document.getElementById('moreSheetOverlay');
      if (moreSheet && !moreSheet.classList.contains('hidden')) {
        moreSheet.classList.add('hidden');
        return true;
      }
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        return true;
      }
      if (this.currentView !== 'dashboard') {
        this.navigate('dashboard');
        return true;
      }
      return false;
    };
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js')
        .then((registration) => {
          registration.update();
          const refreshOnUpdate = () => {
            if (window.__appRefreshingForUpdate) return;
            window.__appRefreshingForUpdate = true;
            window.location.reload();
          };
          navigator.serviceWorker.addEventListener('controllerchange', refreshOnUpdate, { once: true });
          window.setInterval(() => registration.update(), 30000);
          console.log('ServiceWorker registered for offline operation.');
        })
        .catch(err => console.log('ServiceWorker registration skipped:', err));
    }
  }
}

// Global App Instance
const app = new MarriageHallApp();
window.app = app;
