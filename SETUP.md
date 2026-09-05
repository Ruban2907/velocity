# Velocity AI Recruitment Platform - Setup Guide

## Project Overview

This is a full-stack AI recruitment platform with:
- **Frontend**: React + TypeScript (Vite)
- **Backend**: Node.js + Express.js
- **AI Service**: Python Flask microservice

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- MongoDB (local or cloud instance like MongoDB Atlas)
- Python 3.9+ (for AI service)

### MongoDB Installation

1. **Install MongoDB**
   - **Windows**: Download from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
   - **macOS**: `brew install mongodb-community`
   - **Linux**: Follow [MongoDB Installation Guide](https://www.mongodb.com/docs/manual/installation/)

2. **Start MongoDB**
   - **Windows**: MongoDB should start as a service automatically
   - **macOS/Linux**: `brew services start mongodb-community` or `sudo systemctl start mongod`

## Quick Start with Docker (Recommended)

Run the entire stack (MongoDB, AI Microservice, Backend API, and Frontend SPA) with a single command:

```bash
# 1. Clone repository and navigate to project root
cd velocity

# 2. Configure environment variables
cp .env.example .env

# 3. Build and launch all services
docker compose up --build -d

# 4. View running services & health status
docker compose ps
```

Access points:
- **Frontend SPA**: `http://localhost:8080`
- **Backend API**: `http://localhost:3000` (Health: `http://localhost:3000/health`)
- **AI Service**: `http://localhost:8001` (Health: `http://localhost:8001/health`)
- **MongoDB**: `localhost:27017`

To stop the stack:
```bash
docker compose down
```

> **Note on Local Host Environment**: The Dockerfiles, Nginx configuration, and Docker Compose topology are statically audited and structured for production-grade containerization. If your local host environment does not have Docker or Docker Desktop installed, follow the **Manual Local Development Setup** instructions below.

---

## Manual Local Development Setup

### 1. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend will run on `http://localhost:5173` (or `http://localhost:8080` depending on Vite config)

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env file with your configuration:
# - MONGODB_URI: Your MongoDB connection string
# - JWT_SECRET: A strong random string for JWT tokens (min 32 characters)
# - FRONTEND_URL: http://localhost:8080,http://localhost:5173
# - AI_SERVICE_URL: http://localhost:8001

# Start backend server
npm start
```

Backend will run on `http://localhost:3000`

### 3. AI Service Setup

```bash
# Navigate to ai-service directory
cd ai-service

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start AI service
python app.py
```

AI Service will run on `http://localhost:8001`

## Running Automated Tests

### Backend Test Suite (Jest)
```bash
cd backend
npm test
```

### Frontend Test Suite (Vitest) & Typecheck
```bash
cd frontend
npm test
npx tsc --noEmit -p tsconfig.json
```

## Environment Variables

Unified configuration template available at `.env.example` in project root, or individual service configurations:

### Frontend (.env in frontend/ - optional)
```
VITE_API_URL=http://localhost:3000
```

### Backend (backend/.env)
```
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/velocity
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:8080,http://localhost:5173
AI_SERVICE_URL=http://localhost:8001
```

## MongoDB Connection Options

### Local MongoDB
Use the default connection string:
```
mongodb://localhost:27017/velocity
```

### MongoDB Atlas (Cloud)
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster
3. Get your connection string
4. Update `MONGODB_URI` in your `.env` file:
```
mongodb+srv://username:password@cluster.mongodb.net/velocity
```

## Project Structure

```
velocity/
├── docker-compose.yml     # Multi-container orchestration specification
├── .env.example           # Unified environment variables template
├── frontend/              # Frontend React SPA + Vite
│   ├── Dockerfile         # Multi-stage build (Node 20 -> Nginx 1.27)
│   ├── nginx.conf         # Reverse proxy & SPA routing configuration
│   ├── src/
│   │   ├── components/    # UI & layout components
│   │   ├── pages/         # Page routes & views
│   │   ├── lib/           # API client & helpers
│   │   └── services/      # Authentication & API services
│   └── tests/             # Vitest component & unit tests
├── backend/               # Backend Express REST API
│   ├── Dockerfile         # Multi-stage build (Node 20 Alpine, non-root)
│   ├── config/            # MongoDB connection
│   ├── controllers/       # Request handlers
│   ├── middleware/        # Authentication, rate limiting & activity logging
│   ├── model/             # Canonical Mongoose schemas
│   ├── routes/            # REST API endpoints
│   ├── services/          # External AI, email & lead services
│   ├── utils/             # JWT, password & cache utilities
│   └── tests/             # Comprehensive Jest test suites
└── ai-service/            # Python Flask NLP microservice
    ├── Dockerfile         # Python 3.11-slim container
    ├── app.py             # Document parser & field extraction
    └── requirements.txt   # Python dependencies
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/signin` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/users/me` - Get current user

### Profile
- `GET /api/profile/:userId` - Get user profile
- `PUT /api/profile/:userId` - Update user profile
- `PUT /api/profile/:userId/password` - Change password

### Resume Parsing
- `POST /api/resume/parse` - Parse resume (PDF/DOCX)

### Jobs
- `GET /api/jobs` - List jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs` - Create job (recruiter/admin)

### Candidates
- `GET /api/candidates` - List candidates
- `GET /api/candidates/:id` - Get candidate details

## Development Workflow

1. **Start MongoDB** (if running locally)
2. **Start AI Service**: `cd ai-service && python app.py`
3. **Start Backend**: `cd backend && npm start`
4. **Start Frontend**: `cd frontend && npm start`
5. **Access**: Frontend at `http://localhost:5173`

## Troubleshooting

### Backend won't start
- Check if MongoDB is running
- Verify `.env` file exists and has correct values
- Check if port 3000 is available

### MongoDB not connecting
- Make sure MongoDB is running: `mongosh` or check MongoDB service status
- Verify the connection string in `.env`
- Check MongoDB logs for errors
- For MongoDB Atlas, ensure IP is whitelisted

### CORS errors
- Ensure `FRONTEND_URL` in backend `.env` matches your frontend URL
- Check CORS configuration in `backend/index.js`

### Port already in use
- Change `PORT` in backend `.env` file
- Update `FRONTEND_URL` to match your frontend URL

### AI Service not working
- Make sure Python virtual environment is activated
- Verify all dependencies are installed: `pip install -r requirements.txt`
- Check if port 8001 is available

## Automated CI/CD & Quality Gates

Velocity includes GitHub Actions workflow configurations to enforce automated quality gates on every push and pull request to `main` and `master`.

> **Verification Status Note**: All workflow definitions are statically validated and all tests/builds are locally verified on this host. Because this repository has not been pushed to a remote GitHub remote during development, **GitHub Actions cloud runner execution has not yet occurred**.

### Workflows Overview

1. **Application Quality Gates (`.github/workflows/ci.yml`)**:
   - **Backend Quality**: Runs on Node 20 LTS (`ubuntu-latest`). Executes clean install (`npm ci`), non-destructive critical dependency audit (`npm audit --audit-level=critical`), the full Jest test suite (125 tests across 10 suites), and enforces absolute minimum global coverage floors (`npm run test:coverage`).
   - **Frontend Quality**: Runs on Node 20 LTS (`ubuntu-latest`). Executes clean install (`npm ci`), critical dependency audit, Vitest component/unit tests (16 tests across 4 suites), TypeScript type-checking (`npx tsc --noEmit -p tsconfig.json`), and production bundle compilation (`npm run build`).
   - **Offline Determinism**: Neither job requires live databases, external APIs (Gemini, Apify), or SMTP credentials.

2. **Docker Build & Smoke Test (`.github/workflows/docker.yml`)**:
   - **Specification Validation**: Verifies `docker-compose.yml` syntax via `docker compose config`.
   - **Independent Image Builds**: Builds `velocity-backend:ci`, `velocity-frontend:ci`, and `velocity-ai-service:ci` in isolation to pinpoint any image build failure.
   - **Compose Smoke Test**: Starts the full multi-container stack (`mongodb`, `ai-service`, `backend`, `frontend`) and polls health endpoints with explicit semantics:
     - AI Service Liveness: `GET http://localhost:8001/health`
     - Backend Process Liveness: `GET http://localhost:3000/health/live`
     - Backend Database Readiness: `GET http://localhost:3000/api/health` (and `/health`)
     - Frontend Nginx Liveness: `GET http://localhost:8080/health` (Nginx process only)
     - Frontend SPA Entrypoint: `GET http://localhost:8080/`
     - Frontend Reverse Proxy Readiness: `GET http://localhost:8080/api/health` (proves Nginx $\rightarrow$ Node $\rightarrow$ MongoDB)

### Health Check Semantics
- `/health/live`: Unconditional Node.js process liveness (returns HTTP 200 `{ status: "live" }`).
- `/api/health` & `/health`: Database connection readiness (returns HTTP 200 `{ status: "healthy", database: "connected" }` when MongoDB is connected; returns HTTP 503 in production if MongoDB is disconnected).
- `frontend /health`: Nginx container liveness only (returns HTTP 200 from Nginx without touching the backend).
- `frontend /api/health`: End-to-end reverse proxy probe through Nginx to backend readiness.

### Coverage Policy
In `backend/jest.config.js`, absolute minimum global coverage floors are enforced to prevent major regressions:
- Statements: 55% (measured baseline: 61.78%, +6.78% margin)
- Branches: 40% (measured baseline: 47.82%, +7.82% margin)
- Functions: 50% (measured baseline: 55.72%, +5.72% margin)
- Lines: 55% (measured baseline: 64.21%, +9.21% margin)

### Reproducing CI Checks Locally

To replicate the automated CI checks on your local machine:

```bash
# 1. Backend Verification
cd backend
npm ci
npm audit --audit-level=critical
npm test
npm run test:coverage
cd ..

# 2. Frontend Verification
cd frontend
npm ci
npm audit --audit-level=critical
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
cd ..

# 3. Docker Verification (requires Docker Engine / Desktop)
docker compose config
docker build -t velocity-backend ./backend
docker build -t velocity-frontend ./frontend
docker build -t velocity-ai-service ./ai-service
docker compose up -d
curl http://localhost:8001/health
curl http://localhost:3000/health/live
curl http://localhost:3000/api/health
curl http://localhost:8080/health
curl http://localhost:8080/api/health
docker compose down -v
```

## Support & Documentation

For more architectural and operational details, refer to:
- [Main README](README.md)
- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)
- [AI Service README](ai-service/README.md)
