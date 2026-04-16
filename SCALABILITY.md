# Scalability & Architecture Notes

## Current Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   React SPA  │────▶│  Express.js  │────▶│   SQLite /   │
│   Frontend   │◀────│   REST API   │◀────│  PostgreSQL  │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │  JWT Auth    │
                     │  RBAC Layer  │
                     │  Validation  │
                     └──────────────┘
```

The application follows a modular MVC pattern with clear separation:

- **Routes** → define HTTP verbs and paths
- **Middleware** → auth, RBAC, validation (composable pipeline)
- **Controllers** → business logic
- **Utils** → shared services (JWT, responses, audit)
- **Config** → database, migrations, seeding

This structure makes it straightforward to add new modules (e.g., `src/controllers/product.controller.js`) without touching existing code.

---

## Scaling Strategy (Priority Order)

### 1. Database — PostgreSQL Migration

**Why**: SQLite handles single-writer well but blocks under concurrent writes. PostgreSQL supports thousands of simultaneous connections and offers JSONB, full-text search, and row-level locking.

**How**:
- Docker Compose already includes PostgreSQL 16 with the full schema (`init.sql`)
- Set `DB_CLIENT=pg` in `.env` to switch
- Add connection pooling (pg-pool with 20–50 connections per instance)
- For read-heavy workloads, add read replicas behind a connection router

**Impact**: Removes the primary bottleneck for multi-user production use.

### 2. Caching — Redis Layer

**Why**: Repeated queries (task lists, user profiles, stats) hit the database on every request. A cache layer eliminates 80%+ of read traffic.

**How**:
- Docker Compose already includes Redis 7
- Cache strategy per endpoint:
  - `GET /tasks/stats` → cache 60s, invalidate on task create/update/delete
  - `GET /auth/profile` → cache 300s, invalidate on profile update
  - Task list queries → cache 30s with query-string keying
- Store refresh token hashes in Redis instead of the database for faster lookup
- Use Redis as a session store if switching from JWT to sessions

**Impact**: 5–10x reduction in database load for typical read patterns.

### 3. Horizontal Scaling — Stateless Instances

**Why**: A single Node.js process handles ~5,000–10,000 concurrent connections. Beyond that, you need multiple instances.

**How**:
- The API is already stateless (JWT-based, no server-side sessions)
- Deploy 2–8 instances behind a load balancer (Nginx, AWS ALB, or Kubernetes Ingress)
- Round-robin or least-connections routing
- Shared Redis for any cross-instance state (rate limiting, cache)
- No sticky sessions required

```
                    ┌───────────┐
                    │   Nginx   │
                    │    ALB    │
                    └─────┬─────┘
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ API #1   │ │ API #2   │ │ API #3   │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │             │
        ┌────┴─────────────┴─────────────┴────┐
        │          PostgreSQL + Redis          │
        └──────────────────────────────────────┘
```

**Impact**: Linear throughput scaling — 3 instances = ~3x capacity.

### 4. Microservices Extraction (Long-Term)

**When**: Once the monolith reaches ~20 controllers or requires different scaling profiles per feature.

**Proposed services**:

| Service | Responsibility | Why separate? |
|---------|---------------|---------------|
| Auth Service | Registration, login, token management | Security-critical, rarely changes |
| Task Service | CRUD, search, filtering, assignments | High traffic, needs independent scaling |
| Notification Service | Email, push, webhooks on task events | Async, bursty, different failure mode |
| Audit Service | Centralized logging, analytics | Write-heavy, append-only, can lag |

**Communication**: 
- Synchronous: REST or gRPC between services
- Asynchronous: Message queue (RabbitMQ or AWS SQS) for events like "task assigned" → notification trigger

### 5. API Performance Optimizations

**Response Compression**: Add `compression` middleware for gzip/brotli — reduces payload size 60–80%.

**Database Indexing**: Already implemented on foreign keys, status, priority, and email. Monitor slow queries and add composite indexes as patterns emerge.

**Cursor-Based Pagination**: For datasets beyond 100K rows, replace offset pagination with cursor-based (`?after=<last_id>`) to avoid costly `OFFSET` scans.

**Background Jobs**: Use Bull/BullMQ (backed by Redis) for:
- Sending notification emails
- Generating reports
- Cleaning expired refresh tokens
- Running scheduled tasks

**CDN**: Serve the React frontend via CloudFront, Vercel, or Netlify instead of Express static middleware.

---

## Infrastructure & DevOps

### CI/CD Pipeline (GitHub Actions)

```yaml
# Stages:
# 1. Lint + Type Check
# 2. Unit Tests
# 3. Integration Tests (with test DB)
# 4. Build Docker Image
# 5. Push to Container Registry
# 6. Deploy to Staging → Production
```

### Monitoring & Observability

- **APM**: Datadog, New Relic, or open-source (Jaeger + Prometheus + Grafana)
- **Logging**: Centralized with ELK stack (Elasticsearch + Logstash + Kibana) or CloudWatch
- **Health Checks**: Already implemented at `GET /api/v1/health` — integrate with load balancer health probes
- **Alerting**: Set thresholds on response time (p95 > 500ms), error rate (> 1%), and database connection pool exhaustion

### Security Hardening (Production)

- HTTPS only (terminate TLS at load balancer)
- Rotate JWT secrets via environment variables (never commit to repo)
- Enable PostgreSQL SSL connections
- Add request payload size limits (already 10MB via Express)
- Implement account lockout after N failed login attempts
- Add CSRF protection if using cookie-based sessions
- Regular dependency auditing (`npm audit`)

---

## Cost Estimates (AWS, Moderate Load)

| Component | Service | Monthly Cost |
|-----------|---------|-------------|
| 2x API instances | ECS Fargate (0.5 vCPU, 1GB) | ~$30 |
| PostgreSQL | RDS db.t3.micro | ~$15 |
| Redis | ElastiCache t3.micro | ~$12 |
| Load Balancer | ALB | ~$18 |
| **Total** | | **~$75/month** |

This handles ~10,000 daily active users comfortably. Scale up by adding instances and upgrading database tier.
