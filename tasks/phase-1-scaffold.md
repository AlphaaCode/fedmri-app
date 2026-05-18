# Phase 1 — Monorepo scaffold, database, auth

**Model**: claude-haiku-4-5
**Skills**: setup-matt-pocock-skills → tdd
**Complexity**: L2

## Pre-task (run once, manually)

```bash
# In fedmri-app/ root:
cp ../fedmri/apps/backend/prisma/schema.prisma apps/backend/prisma/schema.prisma
cp ../fedmri/apps/backend/prisma/seed.ts apps/backend/prisma/seed.ts
cp -r ../fedmri/apps/fl-coordinator apps/fl-coordinator
cp -r ../fedmri/packages packages
cp ../fedmri/docker-compose.yml docker-compose.yml
cp ../fedmri/.env.example .env.example && cp .env.example .env
# Fill in .env: set ANTHROPIC_API_KEY
```

## Prompt for Claude Code

```
Read CLAUDE.md and CONTEXT.md.

Set up the NestJS backend with:

1. `apps/backend/` — init NestJS project (nest new backend --skip-git)
2. Install: @nestjs/jwt, @nestjs/passport, passport, passport-jwt, bcryptjs,
   @prisma/client, prisma, class-validator, class-transformer, ioredis,
   @nestjs/config, @nestjs/throttler, multer, @types/multer

3. Generate modules:
   - AuthModule (POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/logout)
   - UsersModule (GET /users/me, PATCH /users/me)
   - HospitalSiloGuard (enforces: doctor reads only hospital_id === req.user.hospitalId;
     patient reads only patient_id === req.user.id; throws 403 otherwise)
   - Role enum guard: @Roles('DOCTOR','PATIENT','ADMIN') decorator

4. JWT strategy: access token 15m, refresh token 7d, refresh stored in Redis with
   key `refresh:{userId}`, blacklisted on logout

5. Registration DTO:
   - DOCTOR: requires hospitalId (must exist in hospitals table), role: DOCTOR
   - PATIENT: no hospitalId, role: PATIENT
   - Validate with class-validator

6. Run: docker-compose up postgres redis -d
7. Run: npx prisma db push && npx prisma db seed
8. Run: npm run start:dev — confirm health at GET /health

Write tests first (TDD — red-green-refactor):
- POST /auth/register → 201 with doctor + hospitalId
- POST /auth/register → 201 with patient (no hospitalId)
- POST /auth/register with DOCTOR but invalid hospitalId → 400
- POST /auth/login → 200 with accessToken + refreshToken
- GET /users/me with valid token → 200 with correct role
- GET /users/me with no token → 401

Read CONTEXT.md invariants before writing the HospitalSiloGuard.
All output files go under apps/backend/src/.
```

## Acceptance criteria

- [ ] `docker-compose up` starts postgres + redis with no errors
- [ ] `npx prisma db seed` creates 3 hospitals, 6 doctors, 2 patients, 10 FL rounds
- [ ] All 6 auth tests pass
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] Doctor JWT payload contains `hospitalId`; patient JWT payload does not
