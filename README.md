# Marriage Hall Manager — 100% Offline System
**Developer:** PK-RajWolrd  
**Platform:** Responsive Web Application (PWA) & Android Mobile App  
**Architecture:** 100% Offline Single Page Application (HTML5, CSS3, Vanilla JavaScript, IndexedDB)

---

## 🏛️ Overview
**Marriage Hall Manager** is a complete, enterprise-grade, offline-first management application created specifically for wedding halls, marquees, banquet complexes, and event lawns. 

It does **NOT** require any external server (no Firebase, MySQL, PHP, or Node.js required). All records are securely saved on the local device using **IndexedDB** with automatic fallback to **LocalStorage**.

---

## ✨ Features & Modules

1. **Executive Dashboard**:
   - Total Bookings, Today's Events, Upcoming Events, Total Customers count.
   - Total Revenue, Paid Advance, Remaining Receivables, Available vs. Occupied Halls.
   - Real-time Today's Schedule timeline.
   - Recent Bookings data table with quick invoice access.
   - Pure Offline Canvas Charts: Monthly Revenue bar chart, Event Type donut chart, Expense Category donut chart.

2. **Banquet Hall Management**:
   - Hall Name, Code/Number, Seating Capacity, Standard Rent, Status (Available / Booked / Maintenance), Facilities, and Description.
   - Instant booking shortcut from any hall card.

3. **Booking & Reservation Engine with Date Conflict Detection**:
   - Automatically detects overlapping hall reservations (same hall + same date + overlapping time window).
   - Prevents double-booking with animated visual alerts and button locking.
   - Event Types: Wedding, Baraat, Walima, Mehndi, Engagement, Birthday, Corporate Event, Other.
   - Dynamic Financial Breakdown: Hall Rent + (Guests × Catering Rate) + Decoration + Others - Advance = Remaining Balance.
   - Auto payment status tagger (`Paid`, `Partially Paid`, `Pending`).

4. **Interactive Banquet Calendar**:
   - Monthly calendar grid with color-coded day markers (Green = Available, Red = Booked).
   - Event chips inside calendar dates.
   - Day inspection drawer with 1-click booking directly from the selected date.

5. **Customer Management & CRM**:
   - Name, Father Name / Reference, Phone, WhatsApp, CNIC / ID, Full Address, and Notes.
   - Complete Booking History list for each customer.

6. **Payment & Cash Flow Management**:
   - Record advance, partial, or final payments.
   - Supports Cash, Bank Transfer, Cheque, Online payment methods.
   - Auto-updates corresponding booking dues and payment status.
   - Printable instant payment receipts with signature & stamp fields.

7. **Expense Tracker**:
   - Record hall operational expenses: Electricity / Fuel, Staff Salaries, Maintenance, Cleaning, Decoration, Food, and Miscellaneous.
   - Visual category progress bars with percentage of total spend.
   - Net Profit calculations (`Revenue - Expenses = Net Profit`).

8. **Catering & Menu Packages**:
   - Multi-course menus with customizable items per package and per-person rates.
   - Automatic integration into booking price calculation.

9. **Decoration Packages**:
   - Stage setups, floral pathways, lighting packages, and bridal walkways with fixed pricing.

10. **Staff & Payroll Records**:
    - Employee names, positions (Manager, Waiter, Chef, Decorator, Security, Cleaner), salaries, joining dates, and contact numbers.

11. **Document & Receipt Printing**:
    - Clean, printable A4 invoices with itemized service bills.
    - Official payment receipts with customer and cashier copies.
    - VIP Event Passes / Booking cards for guests.
    - Fully styled with `@media print` rules for browser & mobile printer compatibility.

12. **WhatsApp Message Automation**:
    - 4 Pre-built message templates:
      - Booking Confirmation
      - Event Reminder
      - Payment Due Reminder
      - Thank You & Well Wishes
    - 1-click redirect to WhatsApp (`wa.me`) or 1-click clipboard copy.

13. **Security & PIN Lock**:
    - 4-digit security PIN lock screen with tactile numeric keypad.
    - Can be enabled/disabled in Settings. Default PIN: `1234`.

14. **Offline Backup & Restore**:
    - 1-Click JSON export of the entire database.
    - 1-Click JSON import to restore or migrate data between devices.
    - Factory reset option with safety confirmation.

15. **Responsive Theme & Design**:
    - Royal Navy & Gold wedding banquet aesthetic.
    - Dark mode & Light mode toggle with persistent local preference.
    - Responsive across Desktop, Laptop, Tablet, and Mobile screens.
    - Mobile bottom navigation bar + "More" drawer.

---

## 🛠️ Technology Stack
- **Frontend:** Semantic HTML5, Vanilla CSS3 (Custom Properties / Flexbox / CSS Grid), ES6+ JavaScript.
- **Local Persistence:** HTML5 IndexedDB (`MarriageHallDB_v1`) + LocalStorage.
- **PWA Capabilities:** `manifest.json`, `service-worker.js` for standalone home-screen installation.
- **Android Runtime:** Kotlin, Jetpack Compose, Android WebView (`file:///android_asset/index.html`).

---

## 👨‍💻 Developer Credits
Developed by **PK-RajWolrd**  
Copyright © 2026. All rights reserved.
