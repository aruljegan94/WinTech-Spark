# WinTech-Spark - AI-Powered Business Management PWA

WinTech-Spark is a modern, AI-enhanced Progressive Web App (PWA) designed to simplify billing, inventory, and business analysis for small automobile shops. It combines a clean, user-friendly interface with powerful backend services from Firebase and intelligent insights from Google's Gemini models via Genkit.

## ✨ Core Features

- **📊 Interactive Dashboard**: Get a real-time overview of your business with key metrics like today's sales, monthly sales, expenses, and current stock value.
- **📦 Products & Inventory**: Full CRUD (Create, Read, Update, Delete) functionality for managing your product inventory.
- **🚚 Purchases**: Record and track purchase orders from suppliers, with automatic stock updates.
- **💳 Sales & Invoicing**: A comprehensive invoicing system to create, manage, and track sales. Supports paid, partial, and pending payment statuses.
- **💸 Expense Tracking**: Log and categorize daily business expenses to keep a clear record of your finances.
- **🤖 AI-Powered Analysis Page**: A dedicated page that uses AI to analyze your sales and product data, providing deep insights into:
  - Top-performing and most profitable products.
  - Slow-moving and dead-stock items.
  - Actionable recommendations to optimize inventory and boost sales.
- **🔔 AI Notification Center**: An intelligent alert system that automatically notifies you about:
  - Overdue or partially paid invoices.
  - Low-stock products that need reordering.
- **📝 AI Invoice Follow-Up**: Generate polite, personalized follow-up messages for unpaid invoices with a single click.
- **🔐 User & Role Management**: A secure admin section to manage users and assign roles (Admin, Editor, Viewer) to control access to different parts of the application.
- **🏢 Company Profile Management**: Manage one or more company profiles to be used on invoices and reports.
- **📄 Reporting**: Generate and export business reports for sales, stock, and profits in both PDF and CSV formats.

## 🚀 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (with App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Components**: [ShadCN UI](https://ui.shadcn.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Database**: [Google Cloud Firestore](https://firebase.google.com/docs/firestore)
- **Authentication**: [Firebase Authentication](https://firebase.google.com/docs/auth)
- **Generative AI**: [Google Genkit](https://firebase.google.com/docs/genkit) with Gemini models.
- **Deployment**: [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)

## 🔧 Getting Started

### 1. Firebase Setup
This application is tightly integrated with Firebase for its backend services. The project is pre-configured to connect to a Firebase project.
- **Authentication**: Manages user logins and access control.
- **Firestore**: The NoSQL database used for storing all application data (products, sales, etc.).
- **Security Rules**: `firestore.rules` defines the access permissions for the database to ensure data is secure.

### 2. Running Locally
To run the development server:

```bash
npm run dev
```

This will start the application, typically on `http://localhost:9002`.

## 🏛️ Application Architecture

- **`src/app`**: Contains all the pages and layouts, following the Next.js App Router structure.
  - **`(app)`**: A route group for all protected pages that require authentication and use the main app layout.
  - **`api`**: Genkit API routes for AI functionality.
- **`src/components`**: Home to all shared React components.
  - **`ui`**: Auto-generated ShadCN UI components.
  - **`layout`**: Components related to the overall page structure, like the header and theme provider.
  - **`notifications`**: The AI-powered notification center component.
- **`src/firebase`**: Contains all Firebase-related setup, configuration, and custom hooks (`useUser`, `useCollection`, `useDoc`).
- **`src/ai`**: Houses all Genkit-related code.
  - **`flows`**: Contains the server-side AI flows that perform tasks like analyzing sales, generating notifications, and creating invoice follow-up messages.
- **`src/lib`**: Shared utilities, type definitions (`types.ts`), and placeholder data.
- **`public`**: Static assets, including the PWA manifest (`manifest.json`).
