# Velocity Backend Service

The core REST API microservice for the Velocity recruitment and candidate intelligence platform, built with Node.js, Express, and Mongoose.

---

## Service Overview

- **Runtime**: Node.js (v20 LTS recommended)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Stateless JSON Web Tokens (JWT) with HMAC-SHA256
- **Architecture**: Modular routes, controllers, middleware, and services with centralized error handling

---

## Directory Structure

```
backend/
├── config/              # Database connection (Mongoose strictQuery)
├── controllers/         # Request handling & orchestration
│   ├── adminController.js
│   ├── authController.js
│   ├── emailTemplateController.js
│   ├── jobController.js
│   ├── resumeController.js
│   └── userController.js
├── middleware/          # Security, auth, and validation
│   ├── activityMiddleware.js   # Audit logging with PII/secret redaction
│   ├── auth.js                 # JWT verification & role authorization
│   ├── rateLimiter.js          # In-memory IP rate limiting
│   └── upload.js               # Multer memory storage & MIME filters
├── model/               # Mongoose schema definitions
│   ├── activity.js
│   ├── Assessment.js
│   ├── Candidate.js
│   ├── EmailTemplate.js
│   ├── ExamAttempt.js
│   ├── JobSpec.js
│   ├── PasswordResetToken.js
│   ├── SearchCache.js
│   └── user.js
├── routes/              # Express route definitions
├── services/            # External integration clients (Apify, Auth, Users)
├── tests/               # Automated test suites (Jest + Supertest)
├── utils/               # Cryptography, caching, JWT, and email helpers
├── app.js               # Express application initialization & middleware setup
├── index.js             # HTTP server entrypoint & graceful shutdown
└── jest.config.js       # Test runner configuration & coverage thresholds
```

---

## Scripts & Commands

All commands are executed from within the `backend/` directory:

```bash
# Install dependencies
npm ci

# Start development server with file watching
npm run dev

# Start production server
npm start

# Run automated tests (125 tests, 10 suites)
npm test

# Run tests with coverage thresholds
npm run test:coverage

# Audit critical dependency advisories
npm audit --audit-level=critical
```

---

## Health & Probe Endpoints

- `GET /health/live`: Unconditional Node.js process liveness probe (HTTP 200 `{ status: "live" }`).
- `GET /health` & `GET /api/health`: Database connection readiness probe (HTTP 200 `{ status: "healthy", database: "connected" }` when connected; HTTP 503 if disconnected in production).
- `GET /api/debug-version`: API version metadata.
