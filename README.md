# TaskFlow API

A production-ready REST API with JWT authentication, role-based access control (RBAC), full CRUD task management, and a polished React frontend.

Built with **Express.js**, **SQLite** (via sql.js), **JWT**, and **Swagger** documentation.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Security Practices](#security-practices)
- [Scalability Notes](#scalability-notes)
- [Docker Deployment](#docker-deployment)

---

## Features

**Authentication & Authorization**
- User registration with strong password validation
- Login with JWT access + refresh token pair
- Token refresh and rotation (old tokens auto-revoked)
- Role-based access: `user` and `admin` roles
- Secure password hashing with bcrypt (12 salt rounds)
- Account deactivation support

**Task Management (CRUD)**
- Create, read, update, delete tasks
- Filtering by status, priority, and free-text search
- Sorting by created date, due date, priority, or title
- Pagination with total counts and navigation metadata
- Task assignment to other users
- Tag support for categorization
- Statistics endpoint (counts by status and priority)

**Admin Panel**
- List and search all users
- Update user roles (user ↔ admin)
- Activate/deactivate user accounts
- Full audit log of all system actions

**Security & Quality**
- Helmet.js security headers
- CORS configuration
- Rate limiting (general + stricter on auth endpoints)
- Input validation and sanitization (express-validator)
- Consistent error responses across all endpoints
- Audit logging for sensitive operations

**API Documentation**
- Interactive Swagger UI at `/api-docs`
- OpenAPI 3.0 spec available at `/api-docs.json`

**Frontend**
- React SPA with auth flow (login/register)
- Protected dashboard with task CRUD
- Real-time filtering, search, pagination
- Toast notifications for all API feedback
- Fully responsive design

---

## Tech Stack

| Layer       | Technology                              |
|-------------|----------------------------------------|
| Runtime     | Node.js 22                             |
| Framework   | Express.js 4                           |
| Database    | SQLite (sql.js) — swap to PostgreSQL   |
| Auth        | JWT (jsonwebtoken + bcryptjs)          |
| Validation  | express-validator                      |
| Docs        | swagger-jsdoc + swagger-ui-express     |
| Security    | helmet, cors, express-rate-limit       |
| Frontend    | React 18 (CDN, single-file SPA)       |
| Container   | Docker + Docker Compose                |

---

## Project Structure

```
taskflow-api/
├── src/
│   ├── config/
│   │   ├── database.js        # SQLite connection manager
│   │   ├── migrate.js         # Schema migrations
│   │   └── seed.js            # Demo data seeder
│   ├── controllers/
│   │   ├── auth.controller.js # Auth: register, login, refresh, profile
│   │   ├── task.controller.js # Task CRUD + stats
│   │   └── admin.controller.js# Admin: user mgmt, audit logs
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   ├── rbac.js            # Role-based access control
│   │   ├── errorHandler.js    # Global error + 404 handler
│   │   └── validate.js        # Validation result checker
│   ├── validators/
│   │   ├── auth.validator.js  # Registration/login schemas
│   │   └── task.validator.js  # Task create/update schemas
│   ├── routes/
│   │   ├── index.js           # Route aggregator
│   │   ├── auth.routes.js     # /api/v1/auth/*
│   │   ├── task.routes.js     # /api/v1/tasks/*
│   │   ├── admin.routes.js    # /api/v1/admin/*
│   │   └── health.routes.js   # /api/v1/health
│   ├── utils/
│   │   ├── ApiResponse.js     # Standardized response wrapper
│   │   ├── errors.js          # Custom error classes
│   │   ├── jwt.js             # Token generation/verification
│   │   └── audit.js           # Audit log writer
│   ├── docs/
│   │   └── swagger.js         # OpenAPI spec config
│   └── server.js              # App entry point
├── public/
│   └── index.html             # React frontend SPA
├── data/                      # SQLite database (auto-created)
├── .env                       # Environment variables
├── .env.example               # Template
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 18+ (22 recommended)
- npm 9+

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/taskflow-api.git
cd taskflow-api

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start the server (auto-migrates and seeds)
npm start
```

The server starts at `http://localhost:3000`:
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:3000/api-docs
- **Health Check**: http://localhost:3000/api/v1/health

### Demo Accounts

| Role  | Email              | Password   |
|-------|--------------------|------------|
| Admin | admin@taskflow.io  | Admin@123  |
| User  | user@taskflow.io   | User@123   |

---

## API Reference

Base URL: `http://localhost:3000/api/v1`

### Authentication

| Method | Endpoint                | Auth     | Description              |
|--------|------------------------|----------|--------------------------|
| POST   | /auth/register         | —        | Register new user        |
| POST   | /auth/login            | —        | Login, get tokens        |
| POST   | /auth/refresh          | —        | Refresh access token     |
| POST   | /auth/logout           | Bearer   | Revoke refresh token     |
| GET    | /auth/profile          | Bearer   | Get current user         |
| PATCH  | /auth/profile          | Bearer   | Update name fields       |
| POST   | /auth/change-password  | Bearer   | Change password          |

### Tasks

| Method | Endpoint        | Auth     | Description                       |
|--------|----------------|----------|-----------------------------------|
| GET    | /tasks         | Bearer   | List tasks (filter, search, page) |
| POST   | /tasks         | Bearer   | Create task                       |
| GET    | /tasks/stats   | Bearer   | Get status/priority counts        |
| GET    | /tasks/:id     | Bearer   | Get single task                   |
| PUT    | /tasks/:id     | Bearer   | Update task                       |
| DELETE | /tasks/:id     | Bearer   | Delete task                       |

**Query Parameters for GET /tasks:**

| Param    | Type   | Default    | Options                                    |
|----------|--------|------------|--------------------------------------------|
| page     | int    | 1          | Positive integer                           |
| limit    | int    | 20         | 1–100                                      |
| status   | string | —          | todo, in_progress, review, done            |
| priority | string | —          | low, medium, high, critical                |
| sort     | string | created_at | created_at, updated_at, due_date, priority |
| order    | string | desc       | asc, desc                                  |
| search   | string | —          | Free-text search on title/description      |

### Admin (admin role required)

| Method | Endpoint                       | Description           |
|--------|-------------------------------|-----------------------|
| GET    | /admin/users                  | List all users        |
| GET    | /admin/users/:id              | Get user by ID        |
| PATCH  | /admin/users/:id/role         | Change user role      |
| PATCH  | /admin/users/:id/toggle-active| Activate/deactivate   |
| GET    | /admin/audit-logs             | View audit trail      |

### Response Format

All responses follow a consistent shape:

```json
{
  "success": true,
  "message": "Success",
  "data": { ... },
  "timestamp": "2026-04-16T12:00:00.000Z"
}
```

Paginated endpoints include:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## Database Schema

```
┌────────────────┐     ┌─────────────────┐
│     users       │     │     tasks        │
├────────────────┤     ├─────────────────┤
│ id (PK)        │◄────│ user_id (FK)    │
│ email (unique) │     │ assigned_to (FK)│
│ username       │     │ id (PK)         │
│ password_hash  │     │ title           │
│ first_name     │     │ description     │
│ last_name      │     │ status          │
│ role           │     │ priority        │
│ is_active      │     │ due_date        │
│ last_login_at  │     │ tags (JSON)     │
│ created_at     │     │ created_at      │
│ updated_at     │     │ updated_at      │
└────────────────┘     └─────────────────┘

┌──────────────────┐   ┌─────────────────┐
│ refresh_tokens    │   │  audit_logs      │
├──────────────────┤   ├─────────────────┤
│ id (PK)          │   │ id (PK)         │
│ user_id (FK)     │   │ user_id (FK)    │
│ token_hash       │   │ action          │
│ expires_at       │   │ entity_type     │
│ revoked          │   │ entity_id       │
│ created_at       │   │ details (JSON)  │
└──────────────────┘   │ ip_address      │
                       │ created_at      │
                       └─────────────────┘
```

---

## Security Practices

1. **Password Hashing**: bcrypt with 12 salt rounds (adaptive, slow-by-design)
2. **JWT Tokens**: Short-lived access tokens (24h) + long-lived refresh tokens (7d)
3. **Token Rotation**: Refresh tokens are single-use; old ones are revoked on refresh
4. **Refresh Token Storage**: Only SHA-256 hashes stored in DB (never plain tokens)
5. **Rate Limiting**: 100 req/15min general, 20 req/15min on auth endpoints
6. **Input Validation**: All inputs validated and sanitized via express-validator
7. **Security Headers**: Helmet.js adds CSP, HSTS, X-Frame-Options, etc.
8. **RBAC**: Middleware-level role enforcement (user vs admin)
9. **Ownership Checks**: Users can only access/modify their own resources
10. **Audit Trail**: All sensitive actions logged with user ID and IP address
11. **No Credential Leaks**: password_hash is never returned in any API response

---

## Scalability Notes

### Current Architecture
The application uses a modular MVC architecture designed for easy horizontal scaling:

### Path to Production Scale

**Database Migration (Priority 1)**
- Swap SQLite for PostgreSQL or MySQL for concurrent write support
- Add connection pooling (pg-pool, 20-50 connections per instance)
- Implement read replicas for heavy read workloads

**Caching Layer (Priority 2)**
- Add Redis for session/token storage (faster than DB lookups)
- Cache frequently-accessed data: task stats, user profiles
- Implement cache invalidation on write operations
- TTL-based expiry for list queries

**Horizontal Scaling (Priority 3)**
- Application is stateless (JWT-based) — ready for multi-instance deployment
- Use a load balancer (nginx, AWS ALB) for traffic distribution
- Store sessions/tokens in Redis (shared across instances)
- Sticky sessions not required due to stateless design

**Microservices Extraction (Priority 4)**
- Auth Service: handles registration, login, token management
- Task Service: CRUD operations, search, filtering
- Notification Service: email/push notifications on task changes
- Audit Service: centralized logging and analytics
- Use message queues (RabbitMQ, SQS) for async communication

**Infrastructure**
- Docker containers orchestrated with Kubernetes or ECS
- CI/CD pipeline with GitHub Actions (lint → test → build → deploy)
- Centralized logging with ELK stack or CloudWatch
- APM monitoring with Datadog or New Relic
- Database backups and point-in-time recovery

**API Performance**
- Response compression (gzip/brotli)
- Database query indexing (already implemented for common queries)
- Cursor-based pagination for large datasets
- Background job processing for heavy operations (Bull/BullMQ)
- CDN for static frontend assets

---

## Docker Deployment

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f api

# Stop
docker-compose down
```

---

## License

MIT
