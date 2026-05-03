# ClassGuard – Smart Attendance System

ClassGuard is a full-stack, state-of-the-art web application engineered for secure, real-time classroom attendance tracking. Designed to combat proxy attendance and ensure precise tracking, it utilizes dynamically rotating QR codes (every 4 seconds), advanced hardware device fingerprinting, IP-based network lock-ins, and live Socket.IO bi-directional communication.

Developed by **Ali Ghazanfar**.

---

## 📋 Table of Contents

- [Introduction and Motivation](#-introduction-and-motivation)
- [How It Works (System Workflow)](#-how-it-works-system-workflow)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Tech Stack & Technologies Used](#-tech-stack--technologies-used)
- [Project Structure](#-project-structure)
- [Database Models & Schema](#-database-models--schema)
- [Comprehensive API Reference](#-comprehensive-api-reference)
- [Security Mechanisms (6-Layer Protection)](#-security-mechanisms-6-layer-protection)
- [Environment Variables](#-environment-variables)
- [Deployment Guide](#-deployment-guide)
- [Running Locally](#-running-locally)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)
- [Future Scope & Enhancements](#-future-scope--enhancements)

---

## 🌟 Introduction and Motivation

Traditional attendance systems, such as roll calls or static sign-in sheets, are prone to human error, time-consuming, and highly susceptible to proxy attendance (students signing in for their absent peers). ClassGuard was built to solve these fundamental issues by leveraging modern web technologies.

The core motivation behind ClassGuard is to provide an airtight, cryptographically secure, and real-time mechanism to ensure that:
1. The student is physically present in the classroom (Network Gateway Lock).
2. The student is using their own device (Device Fingerprinting & Ticket Locks).
3. The attendance token cannot be shared over messaging apps (4-Second Rotating QR Codes).

## 🔄 How It Works (System Workflow)

### 1. Authentication & Onboarding
Both admins (professors) and students register and log in through the same unified single-page interface (`public/index.html`). Roles are securely selected during registration. Upon successful login, a **JWT token** (valid for 90 days) is generated and stored in `localStorage`, which is subsequently attached to every API request as a Bearer token for seamless authentication.

### 2. Admin – Initializing a Session
The admin clicks **"Start Attendance Session"**. The server then performs the following steps:
- Records the admin's current **gateway IP address** extracted from `X-Forwarded-For` headers (or the socket's remote address as a secure fallback).
- Instantiates a new `Session` record in the SQLite/PostgreSQL database with `isActive: true` and the tightly coupled `validGatewayIp`.
- Asynchronously logs the administrative action to the `Log` table for auditing.
- The admin's browser establishes a secure connection and joins a dedicated **Socket.IO room** uniquely named `session_<id>`.

### 3. Dynamic QR Code Generation (The Core Engine)
Once the admin enters the session room, `socketHandler.js` instantly generates and broadcasts the initial QR code, immediately establishing a **4-second cron interval** to continuously cycle and rotate the cryptographic token.

Each QR token is a compact string formatted as:
```text
<sessionId>:<10-char-hex-secret>
```
The backend `qrService` persists both the **current** and **previous** token in volatile memory per session. Both are validated during submission, granting students a minimal crossover buffer when the QR rotates, preventing failed scans during transitions. The admin interface features a **fullscreen projector mode** optimized for large lecture halls.

### 4. Student – Scanning & Submitting
Students navigate to the web application via their mobile browsers. The intuitive student dashboard engages the device's native camera using the **html5-qrcode** library, fortified with a 3-second software debounce to intercept duplicate scans. Prior to network submission, the client silently harvests:
- **Device Ticket** – a cryptographically random UUID generated once per browser and stored persistently in `localStorage`.
- **Device Fingerprint** – a robust hardware-level identifier (`visitorId`) generated via **FingerprintJS v4**.

These metrics, coupled with the parsed QR token, are securely transmitted to `POST /api/attendance/mark`.

### 5. Server-Side Security Validation
Incoming attendance requests undergo a rigorous, 6-layer security validation matrix to guarantee authenticity. Refer to the [Security Mechanisms](#-security-mechanisms-6-layer-protection) section for granular details.

### 6. Real-Time Admin Dashboard Updates
Upon an authenticated and validated scan, the server broadcasts an `attendance-marked` Socket.IO event exclusively to the active session room. The admin's viewport ingests this event and dynamically renders the student's name, ID, and timestamp into the data table without requiring a page reload.

### 7. Session Termination & Excel Export
The admin finalizes the class by selecting **"Stop Session"**, mutating the `isActive` state to `false` within the database. The 4-second QR heartbeat also continuously polls the database, designed to self-terminate if it detects an orphaned or inactive session. At any phase, the admin can compile and download the comprehensive attendance roster as an extensively formatted `.xlsx` spreadsheet utilizing the built-in **Export Excel** functionality.

---

## 🏗️ Architecture & Data Flow

ClassGuard follows a standard Client-Server architecture augmented with real-time bidirectional WebSocket communication.

```mermaid
sequenceDiagram
    participant Admin
    participant Server
    participant DB
    participant Student
    
    Admin->>Server: Start Session (POST /api/admin/session)
    Server->>DB: Create Session (isActive: true)
    Server-->>Admin: Session Details & WebSocket Room
    loop Every 4 Seconds
        Server->>Server: Generate new QR Token
        Server-->>Admin: Emit 'new-qr' via Socket.IO
    end
    Student->>Student: Scan QR Code with Camera
    Student->>Server: Mark Attendance (POST /api/attendance/mark)
    Server->>DB: Validate Token, IP, Device Fingerprint
    alt Validation Failed
        Server-->>Student: Error (e.g. Proxy Attempt)
    else Validation Passed
        Server->>DB: Insert Attendance Record
        Server-->>Student: Success Response
        Server-->>Admin: Emit 'attendance-marked' via Socket.IO
    end
    Admin->>Server: Stop Session (PUT /api/admin/session/:id/stop)
    Server->>DB: Update Session (isActive: false)
    Server->>Admin: Generate Excel Export (GET /export)
```

---

## 🛠️ Tech Stack & Technologies Used

| Layer | Technology / Package | Purpose |
|---|---|---|
| **Runtime Environment** | Node.js (v18+) | Core server-side JavaScript execution. |
| **Server Framework** | Express.js v5 | Handling HTTP routing, middleware, and RESTful APIs. |
| **Real-Time Communication** | Socket.IO v4 | Enabling low-latency bi-directional event emission for QR codes and live updates. |
| **Database ORM** | Sequelize v6 | Abstracting SQL queries and managing database schema migrations. |
| **Database (Local)** | SQLite3 | Zero-configuration file-based database for rapid local development. |
| **Database (Cloud)** | PostgreSQL | Robust, scalable relational database for production deployments. |
| **Authentication Strategy** | JWT + BCrypt | Stateless session management and secure password hashing (12 salt rounds). |
| **QR Code Engine** | `qrcode` (npm) | Server-side generation of optimized 400x400 PNG data URLs. |
| **Client QR Scanner** | html5-qrcode (CDN) | High-performance, cross-browser camera accessibility and barcode parsing. |
| **Anti-Spoofing** | FingerprintJS v4 (CDN) | Generating deterministic device hardware fingerprints to block device sharing. |
| **Data Export** | ExcelJS | Compiling native `.xlsx` workbooks with custom formatting for administrative reporting. |
| **Security Hardening** | Helmet.js, express-rate-limit | Securing HTTP headers and preventing brute-force or DDoS attacks (200 req/15 min). |
| **Frontend Styling** | Vanilla CSS, Glassmorphism | Delivering a modern, responsive, dark-themed aesthetic without heavy UI frameworks. |
| **Typography** | Google Fonts (Inter) | Ensuring clean, legible, and professional textual rendering. |

---

## 📁 Project Structure

```text
ClassGuard-Advanced-main/
├── server.js                       # Application entry point & server bootstrap
├── package.json                    # Project dependencies and npm scripts
├── .env.example                    # Template for required environment variables
├── error.log                       # Server error logs
├── public/                         # Static Frontend Assets
│   ├── index.html                  # Core Single-Page Application (SPA) view
│   ├── css/
│   │   └── style.css               # Advanced CSS variables, Glassmorphism, animations
│   └── js/
│       └── app.js                  # Comprehensive client-side controller logic
└── src/                            # Backend Source Code Directory
    ├── config/
    │   └── database.js             # Environment-aware Sequelize configuration
    ├── models/                     # Sequelize ORM Schema Definitions
    │   ├── User.js                 # Defines administrative and student entities
    │   ├── Session.js              # Defines temporal attendance sessions
    │   ├── Attendance.js           # Joins students to sessions with security metadata
    │   ├── Log.js                  # Immutable audit trail for administrative actions
    │   └── index.js                # Aggregates models and defines relational constraints
    ├── controllers/                # HTTP Request Handlers
    │   ├── authController.js       # Manages registration, hashing, and JWT signing
    │   ├── adminController.js      # Orchestrates session lifecycle and data exports
    │   └── attendanceController.js # Houses the intricate 6-layer security algorithm
    ├── middleware/
    │   └── authMiddleware.js       # Intercepts requests to enforce JWT validity and role-based access control (RBAC)
    ├── routes/                     # Express Router Definitions
    │   ├── index.js                # Global API router multiplexer
    │   ├── authRoutes.js           # Endpoints: /api/auth/*
    │   ├── adminRoutes.js          # Endpoints: /api/admin/*
    │   └── attendanceRoutes.js     # Endpoints: /api/attendance/*
    ├── services/
    │   └── qrService.js            # Volatile memory cache for managing transient QR tokens
    └── sockets/
        └── socketHandler.js        # Socket.IO room management and asynchronous cron intervals
```

---

## 🗄️ Database Models & Schema

### `User` Table
Centralized repository for all authentication entities.
| Field | Type | Constraints/Notes |
|---|---|---|
| `id` | INTEGER | Primary key, auto-increment |
| `name` | STRING | Required, Cannot be null |
| `email` | STRING | Unique, Validated regex format |
| `password` | STRING | BCrypt hashed (never stored in plaintext) |
| `role` | ENUM | Restricted to `'admin'` or `'student'` |
| `studentId` | STRING | Optional (Strictly utilized for student context) |

### `Session` Table
Represents a discrete classroom lecture or time block.
| Field | Type | Constraints/Notes |
|---|---|---|
| `id` | INTEGER | Primary key, auto-increment |
| `adminId` | INTEGER | Foreign Key referencing `User.id` |
| `isActive` | BOOLEAN | Boolean flag controlling session state (`true` during lecture) |
| `validGatewayIp` | STRING | Captured network origin for geolocation locking |
| `sessionStartTime` | DATE | Automatically generated timestamp |
| `sessionEndTime` | DATE | Mutated upon session termination |

### `Attendance` Table
The immutable ledger of validated student check-ins.
| Field | Type | Constraints/Notes |
|---|---|---|
| `id` | INTEGER | Primary key, auto-increment |
| `sessionId` | INTEGER | Foreign Key referencing `Session.id` |
| `studentId` | INTEGER | Foreign Key referencing `User.id` |
| `timestamp` | DATE | Exact time of validated scan |
| `ipAddress` | STRING | Submitter's network IP (Compared against Gateway IP) |
| `deviceInfo` | STRING | Raw HTTP User-Agent string |
| `deviceFingerprint` | STRING | Deterministic hash from FingerprintJS |
| `deviceTicket` | STRING | Volatile UUID injected into localStorage |

### `Log` Table
Audit trail system for security monitoring and administrative accountability.
| Field | Type | Constraints/Notes |
|---|---|---|
| `id` | INTEGER | Primary key, auto-increment |
| `action` | STRING | Categorical event types (e.g., `PROXY_BLOCKED`) |
| `details` | TEXT | Granular, human-readable context |
| `userId` | INTEGER | Correlates action to specific User ID |
| `ipAddress` | STRING | Network origin of the event trigger |
| `timestamp` | DATE | Automatically recorded |

---

## 📡 Comprehensive API Reference

All API interactions strictly mandate `application/json` payload structures and return standard JSON responses unless otherwise noted (e.g., Excel exports).

### Public Authentication API
No Authorization headers required.

- **`POST /api/auth/register`**
  - **Payload:** `{ "name": "John Doe", "email": "john@university.edu", "password": "secure123", "role": "student", "studentId": "CS-101" }`
  - **Returns:** JWT Token and user metadata.

- **`POST /api/auth/login`**
  - **Payload:** `{ "email": "john@university.edu", "password": "secure123" }`
  - **Returns:** JWT Token and user metadata.

### Secured Admin API
Requires HTTP Header: `Authorization: Bearer <JWT>` and `User.role === 'admin'`.

- **`POST /api/admin/session`**
  - Starts a new session. Calculates gateway IP automatically.
- **`PUT /api/admin/session/:id/stop`**
  - Gracefully shuts down session `:id` and halts QR intervals.
- **`GET /api/admin/session/active`**
  - Recovers the currently running session state in case of admin browser refresh.
- **`GET /api/admin/session/:id/attendance`**
  - Fetches the live, continuously updating array of validated student records.
- **`GET /api/admin/session/:id/export`**
  - **Returns:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Triggers browser download of `.xlsx` file).
- **`GET /api/admin/logs`**
  - Fetches the most recent 100 security and action logs.

### Secured Student API
Requires HTTP Header: `Authorization: Bearer <JWT>` and `User.role === 'student'`.

- **`POST /api/attendance/mark`**
  - **Payload:** 
    ```json
    {
      "token": "4:a1b2c3d4e5",
      "deviceFingerprint": "8f2a93b4c10d...",
      "deviceTicket": "123e4567-e89b-12d3-a456-426614174000"
    }
    ```
  - **Returns:** HTTP 200 OK on success, or HTTP 400/403 with specific error code on validation failure.

### Real-Time Socket.IO Channels
| Event Signature | Emitter | Listener | Description |
|---|---|---|---|
| `join-session` | Client | Server | Handshake to assign connection to specific room. |
| `leave-session` | Client | Server | Deregisters connection; initiates cleanup. |
| `new-qr` | Server | Client | Delivers Base64 encoded PNG and raw token string. |
| `attendance-marked` | Server | Client | Pushes newly verified student data to admin UI. |
| `session-ended` | Server | Client | Forces UI reset when session terminates remotely. |

---

## 🔒 Security Mechanisms (6-Layer Protection)

ClassGuard is engineered under a zero-trust model. When a student attempts to submit attendance via `POST /api/attendance/mark`, the request is subjected to six independent, sequential verification gates:

1. **Cryptographic Token Integrity Check** 
   - The token must adhere strictly to the expected format (`<sessionId>:<10-char-hex-secret>`). Malformed or arbitrarily injected tokens are immediately discarded.
2. **Volatile Memory Validation (Replay Attack Prevention)** 
   - The token is cross-referenced against the `qrService`'s transient memory cache. Only the *current* or *immediately previous* tokens are permitted. Tokens older than one rotation lifecycle (~4–8 seconds) expire mathematically, preventing students from transmitting photos of the QR code to external peers.
3. **Session Liveness Verification** 
   - A synchronous database lookup ensures the targeted `Session` record retains `isActive: true`. Submissions to historical or preemptively stopped sessions are rejected.
4. **Network Gateway Geolocation Lock (IP Verification)** 
   - The incoming request's IP address (parsed via Express trust-proxies and `X-Forwarded-For` headers) is rigorously compared to the `validGatewayIp` established by the admin. Discrepancies signify the student is operating outside the physical classroom network and the request is blocked. *(Note: This check is bypassed when operating on the `127.0.0.1` loopback interface during local development.)*
5. **Idempotency Check (Duplicate Attendance Prevention)** 
   - The database enforces a unique constraint check for the `(sessionId, studentId)` tuple. Secondary submissions are gracefully ignored, guaranteeing one entry per student.
6. **Hardware Level Device Locking (Device-Sharing Prevention)** 
   - To counteract device passing (where one student logs out and another logs in on the same physical phone), the server queries the active session for any matching `deviceTicket` (localStorage UUID) or `deviceFingerprint` (FingerprintJS entropy hash). If a collision is detected, the scan is blocked, a `DEVICE_SHARE_BLOCKED` alert is logged, and the student is presented with a 🚫 **Device Locked** notification.

---

## ⚙️ Environment Variables

The application relies heavily on environment configuration. Clone `.env.example` into a `.env` file within the project root directory.

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Security & Cryptography
JWT_SECRET=generate_a_highly_secure_random_string_here
SESSION_TIMEOUT=60

# Database Connectivity (Optional)
# DATABASE_URL=postgres://user:password@hostname:5432/dbname
```

| Variable | Requirement | Description |
|---|---|---|
| `PORT` | Optional | Specifies the HTTP listener port (defaults to `3000`). |
| `NODE_ENV` | Optional | Toggles behavior (`development` enables verbose logging; `production` optimizes performance). |
| `JWT_SECRET` | **Mandatory** | The cryptographic salt used for signing and verifying JSON Web Tokens. |
| `DATABASE_URL` | Optional | Supplying a valid Postgres URI forces the ORM to bypass SQLite and connect to a cloud database. |

---

## ☁️ Deployment Guide

ClassGuard is designed for seamless deployment to modern PaaS providers. It is critical that the chosen host supports **WebSockets** and persistent data storage.

### Deploying to Render / Railway
1. **Repository Link:** Connect your GitHub repository to the hosting dashboard.
2. **Build Command:** Configure the build step as `npm install`.
3. **Start Command:** Configure the execution step as `node server.js`.
4. **Environment Variables:** Inject the `JWT_SECRET` and `DATABASE_URL` variables via the platform's secret manager.
5. **Database Provisioning:** Deploy an integrated PostgreSQL add-on and map its internal URI to the `DATABASE_URL` variable.

### Important Production Considerations
- **Trust Proxy:** Because PaaS providers route traffic through load balancers, the Express server utilizes `app.set('trust proxy', 1)`. Ensure your provider correctly forwards the `X-Forwarded-For` headers so the Gateway IP locking feature functions accurately.
- **Persistent Storage:** If deploying without PostgreSQL (using SQLite), ensure you mount a **persistent volume** to the project directory to prevent database deletion upon container restarts or deployments.

---

## 🚀 Running Locally

Follow these steps to instantiate a local development environment. Prerequisites include Node.js (v18+) and npm.

```bash
# 1. Clone the repository and navigate to the root directory
cd ClassGuard-Advanced-main

# 2. Install required Node.js dependencies
npm install

# 3. Provision the local environment configuration
copy .env.example .env
# Open .env and populate the JWT_SECRET variable with a randomized string

# 4. Boot the server application
node server.js
```

Upon initialization, the server will output `Server running on port 3000`. The underlying SQLite engine will automatically provision a `database.sqlite` file in the root directory and execute all necessary table schemas.

Navigate to `http://localhost:3000` in your web browser.

> **Development Tip:** To test device-locking capabilities locally, open an Incognito Window or a secondary browser profile to simulate a distinct device fingerprint.

---

## 🩺 Troubleshooting & FAQs

**Q: Why does the QR code scanner fail to initialize on mobile devices?**
A: Mobile browsers strictly require a secure context (HTTPS) to grant camera hardware permissions. When accessing the application via a local IP on your phone, you must utilize tools like `ngrok` or `localtunnel` to proxy the connection through HTTPS.

**Q: Students are receiving a "Network Mismatch" error while physically in class.**
A: This occurs if students are utilizing cellular data instead of the institutional Wi-Fi. Ensure all participants, including the administering device, are connected to the identical network gateway. Additionally, check that `trust proxy` is correctly configured if operating behind a reverse proxy.

**Q: The attendance list isn't updating in real-time.**
A: Verify that the Socket.IO connection is successfully established via the browser's Network tab. Firewalls or strict proxy configurations may block WebSocket protocol upgrades (WSS).

---

## 🔭 Future Scope & Enhancements

While ClassGuard provides a robust foundation, potential roadmap enhancements include:
- **Biometric Integration:** Leveraging the WebAuthn API for fingerprint/FaceID authentication prior to scan submission.
- **LMS Interoperability:** Integrating LTI (Learning Tools Interoperability) standards to automatically sync attendance data directly with Canvas, Blackboard, or Moodle.
- **Geofencing:** Implementing HTML5 Geolocation API cross-checks to mathematically bound attendance submissions to specific campus coordinate radiuses.
- **Advanced Analytics:** Building an admin dashboard view to visualize longitudinal attendance trends, flagging students statistically at risk of failing due to absences.

---

*© 2026 Engineered and Developed by Ali Ghazanfar. All Rights Reserved.*
