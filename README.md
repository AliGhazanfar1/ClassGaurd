# ClassGuard – Smart Attendance System

ClassGuard is a full-stack web application for secure, real-time classroom attendance tracking. It uses dynamic QR codes that rotate every 4 seconds, hardware device fingerprinting, IP-based network locking, and live Socket.IO updates to prevent proxy attendance.

Developed by **Meraj Alam**.

---

## 📋 Table of Contents

- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Database Models](#-database-models)
- [API Reference](#-api-reference)
- [Security Mechanisms](#-security-mechanisms)
- [Environment Variables](#-environment-variables)
- [Running Locally](#-running-locally)

---

## 🔄 How It Works

### 1. Authentication
Both admins (professors) and students register and log in through the same single-page interface (`public/index.html`). Roles are selected at registration. After login, a **JWT token** (valid for 90 days) is stored in `localStorage` and attached to every subsequent API request as a Bearer token.

### 2. Admin – Starting a Session
The admin clicks **"Start Attendance Session"**. The server:
- Records the admin's current **gateway IP address** from `X-Forwarded-For` headers (or the socket's remote address as a fallback).
- Saves a new `Session` record to the database with `isActive: true` and the captured `validGatewayIp`.
- Logs the action to the `Log` table.
- The admin's browser joins a **Socket.IO room** named `session_<id>`.

### 3. Dynamic QR Code Generation
Once the admin joins the session room, `socketHandler.js` immediately generates and emits the first QR code, then sets a **7-second interval** to continuously rotate it.

Each QR token is a short string in the format:
```
<sessionId>:<10-char-hex-secret>
```
The `qrService` keeps the **current** and **previous** token in memory per session. Both are accepted during validation, giving students a brief crossover window when the QR rotates. The admin can also click the QR to enter **fullscreen projector mode**.

### 4. Student – Scanning & Submitting
Students open the web app on their phone. The student dashboard launches the device camera using the **html5-qrcode** library with a 3-second debounce to prevent duplicate scans. Before submitting, the client collects:
- **Device Ticket** – a random UUID generated once and stored in `localStorage`.
- **Device Fingerprint** – a hardware-level `visitorId` from **FingerprintJS v4**.

These, along with the scanned QR token, are sent to `POST /api/attendance/mark`.

### 5. Server-Side Security Validation (6 Layers)
See [Security Mechanisms](#-security-mechanisms) for full details.

### 6. Real-Time Admin Dashboard
On a successful mark, the server emits an `attendance-marked` Socket.IO event to the session room. The admin's dashboard adds the student's name, ID, and timestamp instantly without a page refresh.

### 7. Stopping a Session & Exporting
The admin clicks **"Stop Session"** which sets `isActive: false` in the DB. The 7-second QR interval also polls the DB and will self-stop if it detects an inactive session. The admin can export the full attendance list as a `.xlsx` spreadsheet using the **Export Excel** button at any time (even after stopping).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **Server Framework** | Express.js v5 |
| **Real-Time** | Socket.IO v4 |
| **Database ORM** | Sequelize v6 |
| **Database (Local)** | SQLite3 |
| **Database (Cloud)** | PostgreSQL (via `DATABASE_URL` env var) |
| **Authentication** | JSON Web Tokens (JWT) + BCrypt (12 rounds) |
| **QR Generation** | `qrcode` npm package (server-side, 400×400 PNG data URL) |
| **QR Scanning** | html5-qrcode (CDN, camera-based, client-side) |
| **Device Fingerprinting** | FingerprintJS v4 (CDN, client-side) |
| **Excel Export** | ExcelJS |
| **Security Hardening** | Helmet.js, express-rate-limit (200 req / 15 min per IP) |
| **Frontend** | Vanilla HTML, CSS (Glassmorphism dark theme), JavaScript |
| **Fonts** | Google Fonts – Inter |

---

## 📁 Project Structure

```
ClassGuard-Advanced-main/
├── server.js                       # App entry point
├── package.json
├── .env.example                    # Required environment variables
│
├── public/                         # Frontend (served as static files)
│   ├── index.html                  # Single-page app (Auth + Admin + Student views)
│   ├── css/
│   │   └── style.css               # Dark glassmorphism UI, animations, responsive layout
│   └── js/
│       └── app.js                  # All client-side logic (auth, scanning, admin controls)
│
└── src/                            # Backend source
    ├── config/
    │   └── database.js             # Sequelize config: SQLite locally, PostgreSQL in cloud
    ├── models/
    │   ├── User.js                 # User schema (admin / student)
    │   ├── Session.js              # Attendance session schema
    │   ├── Attendance.js           # Attendance record schema (with device fields)
    │   ├── Log.js                  # Audit log schema
    │   └── index.js                # Model associations & exports
    ├── controllers/
    │   ├── authController.js       # Register & Login logic
    │   ├── adminController.js      # Session management, attendance list, Excel export, logs
    │   └── attendanceController.js # Core mark-attendance logic with all security checks
    ├── middleware/
    │   └── authMiddleware.js       # JWT `protect` + role-based `restrictTo` middleware
    ├── routes/
    │   ├── index.js                # Mounts all routers at /api
    │   ├── authRoutes.js           # POST /api/auth/register, POST /api/auth/login
    │   ├── adminRoutes.js          # All /api/admin/* routes (admin only)
    │   └── attendanceRoutes.js     # POST /api/attendance/mark (students only)
    ├── services/
    │   └── qrService.js            # In-memory QR token generation & validation
    └── sockets/
        └── socketHandler.js        # Socket.IO event handling, QR rotation intervals
```

---

## 🗄️ Database Models

### `User`
| Field | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key, auto-increment |
| `name` | STRING | Required |
| `email` | STRING | Unique, validated |
| `password` | STRING | BCrypt hashed |
| `role` | ENUM | `'admin'` or `'student'` |
| `studentId` | STRING | Optional (only for students) |

### `Session`
| Field | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key, auto-increment |
| `adminId` | INTEGER | FK → User |
| `isActive` | BOOLEAN | `true` while session is running |
| `validGatewayIp` | STRING | IP captured at session start for locking |
| `sessionStartTime` | DATE | Auto-set on create |
| `sessionEndTime` | DATE | Set when stopped |

### `Attendance`
| Field | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key, auto-increment |
| `sessionId` | INTEGER | FK → Session |
| `studentId` | INTEGER | FK → User |
| `timestamp` | DATE | Auto-set on create |
| `ipAddress` | STRING | Student's IP at time of scan |
| `deviceInfo` | STRING | User-Agent string |
| `deviceFingerprint` | STRING | FingerprintJS visitorId |
| `deviceTicket` | STRING | Random UUID from student's localStorage |

### `Log`
| Field | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `action` | STRING | e.g. `STARTED_SESSION`, `PROXY_ATTEMPT_BLOCKED`, `DEVICE_SHARE_BLOCKED` |
| `details` | TEXT | Human-readable description |
| `userId` | INTEGER | Who triggered the event |
| `ipAddress` | STRING | IP address of the actor |
| `timestamp` | DATE | Auto-set |

---

## 📡 API Reference

All routes are prefixed with `/api`.

### Auth (Public)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user (admin or student) |
| `POST` | `/api/auth/login` | Log in and receive a JWT |

### Admin (Requires JWT + `role: admin`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/session` | Start a new attendance session |
| `PUT` | `/api/admin/session/:id/stop` | Stop an active session |
| `GET` | `/api/admin/session/active` | Get the currently active session |
| `GET` | `/api/admin/session/:id/attendance` | Get full attendance list for a session |
| `GET` | `/api/admin/session/:id/export` | Download attendance as `.xlsx` |
| `GET` | `/api/admin/logs` | Get last 100 audit log entries |

### Attendance (Requires JWT + `role: student`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/attendance/mark` | Submit QR token + device info to mark attendance |

### Socket.IO Events
| Event | Direction | Description |
|---|---|---|
| `join-session` | Client → Server | Admin joins a session room; triggers QR rotation |
| `leave-session` | Client → Server | Admin leaves room; clears QR interval |
| `new-qr` | Server → Client | Emits `{ qrDataUrl, token }` every 7 seconds |
| `attendance-marked` | Server → Client | Emits `{ name, studentId, email, timestamp }` on successful scan |
| `session-ended` | Server → Client | Emitted when interval detects session is no longer active |

---

## 🔒 Security Mechanisms

When a student submits `POST /api/attendance/mark`, six checks run in sequence:

1. **QR Token Format Check** – Token must contain a `:` separator (`sessionId:hexSecret`). Malformed tokens are rejected immediately.

2. **In-Memory Token Validation** – The token is checked against the `current` and `previous` tokens stored in `qrService`'s in-memory `Map`. Tokens older than one rotation cycle (~7–14 seconds) are invalid. This prevents students from photographing and sharing QR codes.

3. **Session Active Check** – The session record is fetched from the DB. If `isActive` is `false`, the request is rejected.

4. **IP / Network Gateway Lock** – The student's IP (from `X-Forwarded-For`) is compared to the `validGatewayIp` recorded when the admin started the session. A mismatch means the student is not on the same network as the classroom and is blocked. *(Skipped for `127.0.0.1` in local development.)*

5. **Duplicate Attendance Check** – The DB is queried for an existing `Attendance` row with the same `(sessionId, studentId)` pair. A student cannot mark attendance twice for the same session.

6. **Hardware Device Lock** – The DB is queried for any existing `Attendance` in the session that matches either the `deviceTicket` (localStorage UUID) **or** the `deviceFingerprint` (FingerprintJS hardware ID). If another student already used the same physical device, the scan is blocked and a `DEVICE_SHARE_BLOCKED` log entry is created. The student sees a 🚫 **Device Locked** screen.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
PORT=3000
JWT_SECRET=your_jwt_secret_here
SESSION_TIMEOUT=60
NODE_ENV=development
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (defaults to `3000`) |
| `JWT_SECRET` | **Yes** | Secret key for signing JWTs |
| `SESSION_TIMEOUT` | No | Reserved for future use |
| `NODE_ENV` | No | `development` or `production` |
| `DATABASE_URL` | No | If set, switches DB to PostgreSQL (cloud). Omit to use SQLite locally. |

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
copy .env.example .env
# Edit .env and set JWT_SECRET to a strong random string

# 3. Start the server (SQLite database is created automatically)
node server.js
```

The server will start on `http://localhost:3000`. The SQLite database file (`database.sqlite`) is created automatically in the project root on first run.

> **Note:** There is no `start` script defined in `package.json`. Run the app directly with `node server.js`.

---

*© 2026 Developed by Ali Ghazanfar. All Rights Reserved.*
