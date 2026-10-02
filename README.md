# WinTech-Spark ⚡ - AI-Powered Business & Billing Management PWA

[![Next.js](https://img.shields.io/badge/Next.js-15.5.9-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.1-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-v11.10-FFCA28?logo=firebase)](https://firebase.google.com/)
[![Google Genkit](https://img.shields.io/badge/Google%20Genkit-Gemini%20AI-orange?logo=google)](https://firebase.google.com/docs/genkit)
[![Node.js](https://img.shields.io/badge/Node.js-24.x-green?logo=node.js)](https://nodejs.org/)
[![PWA](https://img.shields.io/badge/PWA-Ready-purple)](https://web.dev/progressive-web-apps/)

**WinTech-Spark** is an enterprise-ready, AI-augmented Progressive Web App (PWA) designed specifically for automobile workshops, spare part retailers, and small-to-medium businesses. It delivers lightning-fast Point of Sale (POS) invoicing, live barcode scanning, real-time inventory synchronization, vendor & customer ledgers, and intelligent AI analytics powered by Google's Gemini models via Genkit.

---

## 🚀 What's New in v2.0

- **Node.js 24.x Engine**: Upgraded runtime configuration for smooth modern cloud deployments (Vercel & Firebase App Hosting).
- **Camera Barcode Scanner**: In-app barcode & QR code scanner via device camera (`html5-qrcode`) for instant product lookup and billing.
- **Printable Barcode Sheet Generator**: Generate, customize, and print product barcode labels in bulk (`/barcodes`).
- **WhatsApp Direct Invoicing**: 1-click sharing of invoices, receipts, and order statuses to customers via WhatsApp Web / Mobile.
- **Global Command Search (`Cmd + K` / `Ctrl + K`)**: Instant search dialog across products, customers, invoices, and system actions.
- **Dark & Light Mode**: Complete theme customization powered by `next-themes` and polished Tailwind UI tokens.
- **Role-Based Access Control (RBAC)**: Fine-grained user permissions (`Admin`, `Editor`, `Viewer`) with admin elevation (`/make-admin`) and user role editing dialogs.
- **Enhanced PDF Generation**: Automatic clean PDF invoice rendering with auto-table summaries, company branding, and tax calculations (`jspdf`, `jspdf-autotable`).

---

## ✨ Core Features & Modules

### 📊 1. Real-Time Dashboard & Financial Metrics
- **Executive KPIs**: Real-time tracking of Today's Sales, Monthly Revenue, Total Expenses, and Inventory Asset Valuation.
- **Interactive Visualizations**: Dynamic revenue vs. expense charts and sales volume breakdowns powered by Recharts.
- **Actionable Quick Actions**: 1-tap shortcuts to create invoices, record purchases, add products, or view notifications.

### 💳 2. Point of Sale (POS) & Billing Invoicing
- **Rapid Invoicing**: Add products by SKU, name, or live barcode camera scan.
- **Payment Flexibility**: Support for full payment (`Paid`), split payment (`Partial`), or credit (`Pending` / `Due`).
- **Professional PDF Generation**: Generate downloadable and printable branded invoices with company details, terms, and tax breakdown.
- **WhatsApp Share Dialog**: Send pre-formatted invoice breakdowns and payment summaries directly to the customer's phone.

### 📦 3. Products & Stock Inventory
- **Full Inventory Lifecycle**: Create, edit, search, and categorize items with cost price, retail price, stock levels, and min-stock alert thresholds.
- **Automatic Stock Adjustments**: Stock auto-decrements on finalized sales and auto-increments on received purchase orders.
- **Low-Stock Triggers**: Instant alerts when stock levels drop below defined thresholds.

### 🏷️ 4. Barcodes & Printing
- **Live Camera Scanner**: Scan barcodes directly from a desktop webcam or mobile phone camera.
- **Barcode Generator**: Generate Code-128 / QR barcodes for any inventory item.
- **Print Layouts**: Export printable sticker sheets formatted for standard thermal label printers or A4 sticker sheets.

### 🚚 5. Purchases & Supplier Management
- **Purchase Order Tracking**: Record incoming stock deliveries with supplier invoice references, purchase costs, and payment statuses.
- **Supplier Directory**: Manage vendor details, contact info, total purchase volume, and outstanding payables.

### 👥 6. Customer Relationship Management (CRM)
- **Customer Profiles**: Track customer transaction history, contact information, and lifetime order volume.
- **Dues & Balance Tracking**: Monitor unpaid customer balances and partial payments.

### 💸 7. Expense Tracking & Categorization
- **Daily Expense Log**: Record overhead costs (Rent, Utilities, Wages, Maintenance, Supplies).
- **Net Profit Integration**: Automatically subtracts logged expenses from gross margin to calculate actual net profit.

### 🤖 8. AI Business Intelligence (Google Genkit + Gemini)
- **Deep Business Analysis (`/analysis`)**:
  - Highlights top-performing and highest-margin inventory items.
  - Pinpoints dead stock and slow-moving items tied up in capital.
  - Delivers actionable AI recommendations on reordering and stock clearance.
- **Smart Follow-Up Generator**: Creates polite, personalized WhatsApp & SMS payment reminders for overdue invoices with a single click.
- **AI Notification Center**: Automatic notifications for low stock warnings and overdue payments.

### 🔐 9. User & Role Management (RBAC)
- **Admin**: Full access to all business data, user management, and system settings.
- **Editor**: Can create and edit sales, purchases, products, and expenses.
- **Viewer**: Read-only access to sales, reports, and stock levels.
- **Admin Setup Utility**: Dedicated `/make-admin` route for initial administrative role bootstrapping.

### 🏢 10. Company Settings & Profile
- **Brand Customization**: Configure business name, logo, GSTIN / tax registration, phone numbers, and address.
- **Invoice Configuration**: Customize default payment terms, footer notes, and invoice prefixes.

---

## 🛠️ Technology Stack

| Category | Technology |
|---|---|
| **Framework** | [Next.js 15.5.9](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **UI Library** | [React 19](https://react.dev/), [ShadCN UI](https://ui.shadcn.com/), [Radix UI](https://www.radix-ui.com/) |
| **Styling** | [Tailwind CSS 3.4](https://tailwindcss.com/), `next-themes` (Dark/Light mode) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Database & Auth** | [Google Cloud Firestore](https://firebase.google.com/docs/firestore), [Firebase Auth](https://firebase.google.com/docs/auth) |
| **Generative AI** | [Google Genkit](https://firebase.google.com/docs/genkit) + Gemini Models |
| **Hardware & Media** | [html5-qrcode](https://github.com/mebjas/html5-qrcode) (Camera scanner), [jsPDF](https://github.com/parallax/jsPDF) |
| **Charts** | [Recharts](https://recharts.org/) |
| **Deployment** | [Vercel](https://vercel.com/) (Node.js 24.x) & [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) |

---

## 📁 Project Structure

```text
Spark-PWA/
├── public/                     # Static assets, PWA manifest, icons
│   ├── manifest.json           # Progressive Web App manifest
│   └── favicon.ico
├── src/
│   ├── ai/                     # Genkit AI configurations & flows
│   │   ├── dev.ts              # Local Genkit development server entry
│   │   └── flows/              # Gemini flows (analysis, follow-ups, alerts)
│   ├── app/                    # Next.js 15 App Router pages
│   │   ├── (app)/              # Protected application views
│   │   │   ├── admin/          # RBAC user management & permissions
│   │   │   ├── analysis/       # AI business intelligence & stock analytics
│   │   │   ├── barcodes/       # Barcode generator & printable sheets
│   │   │   ├── customers/      # Customer directory & credit ledger
│   │   │   ├── dashboard/      # Main financial dashboard
│   │   │   ├── expenses/       # Business expense logging
│   │   │   ├── make-admin/     # Initial admin elevation tool
│   │   │   ├── orders/         # Order tracking & WhatsApp share
│   │   │   ├── products/       # Inventory catalog & SKU management
│   │   │   ├── purchases/      # Supplier purchase orders & stock receipts
│   │   │   ├── reports/        # P&L and financial reporting
│   │   │   ├── sales/          # POS Billing, checkout, PDF invoices
│   │   │   ├── settings/       # Company profile & invoice preferences
│   │   │   └── vendors/        # Supplier / Vendor accounts
│   │   ├── login/              # Firebase Authentication sign-in
│   │   ├── layout.tsx          # Root layout with Theme & Auth providers
│   │   └── globals.css         # Tailwind directives & CSS design tokens
│   ├── components/             # Reusable UI components
│   │   ├── barcode-scanner-modal.tsx  # Camera barcode scanning modal
│   │   ├── layout/             # App shell, sidebar, header, global search
│   │   ├── notifications/      # AI notification bell & drawer
│   │   └── ui/                 # ShadCN UI primitives (Dialog, Table, Card, etc.)
│   ├── firebase/               # Firebase client SDK initialization & hooks
│   └── lib/                    # Shared utilities, schemas, and TypeScript types
├── firestore.rules             # Firestore security rules
├── package.json                # Dependencies, scripts, and Node.js engine
└── tailwind.config.ts          # Tailwind CSS theme configuration
```

---

## ⚙️ Getting Started

### 1. Prerequisites
- **Node.js**: v22.x or v24.x (v24.x recommended)
- **npm** or **pnpm**
- A **Firebase Project** with Firestore and Authentication enabled
- A **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/))

### 2. Environment Configuration
Create a `.env.local` file in the `Spark-PWA` root:

```env
# Google Gemini / Genkit
GEMINI_API_KEY=your_gemini_api_key

# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Installation
Install all dependencies:

```bash
npm install
```

### 4. Running Locally
Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

To run Genkit AI flows in developer mode:
```bash
npm run genkit:dev
```

### 5. Production Build
Verify compilation:

```bash
npm run build
```

---

## 🚢 Deployment (Vercel)

1. Import the repository `aruljegan94/WinTech-Spark` into **Vercel**.
2. Set the **Root Directory** to `Spark-PWA` (if deploying from a monorepo or project root).
3. Under **Environment Variables**, add:
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
4. The build uses the configured `"engines": { "node": "24.x" }` automatically.

---

## 📄 License

This software is proprietary and developed for WinTech-Spark business management operations.
