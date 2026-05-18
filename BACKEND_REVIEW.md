# Backend Architecture Review — FedMRI

**Review Date:** 2026-05-19  
**Status:** ✅ Solid Foundation | ⚠️ Needs Completion

---

## 1. Database Schema (Prisma) — A+

### Design Quality
- **Coverage**: All core entities present (Hospital, User, Case, FlRound, FlContribution, PrivacyAuditLog, Feedback, ChatMessage, ModelMetrics)
- **Normalization**: Proper third-normal form; no data duplication
- **Constraints**: Foreign keys, cascading deletes (implicit), unique constraints on email and flClientId
- **Enums**: Well-defined (Role, CaseScope, CaseStatus, FeedbackType, FLStrategy, FLTrigger, PrivacyEvent)

### Privacy Invariant Enforcement
✅ **Critical invariant protected**: `PrivacyAuditLog.rawDataTransmitted` is `@default(0)` — no code path can accidentally set it to non-zero without explicit column override (good).

### Indexing
✅ **Optimal**: Indexes on:
- `User.hospitalId` → fast doctor lookup by hospital
- `Case.hospitalId`, `Case.userId`, `Case.scope` → HospitalSiloGuard queries will be fast
- `FlContribution.hospitalId`, `FlContribution.flRoundId` → FL metrics queries will be fast
- `PrivacyAuditLog.hospitalId` → privacy audit trail will be fast

### Potential Issues
⚠️ **No compound indexes**: If you query `Case where hospitalId=X AND scope=Y`, Postgres must scan two single-column indexes. Consider:
```prisma
@@index([hospitalId, scope])  // compound index for common joins
```

⚠️ **No soft-delete pattern**: Cases and FL rounds are permanent. If a hospital requests data deletion, you cannot comply without DB migration. Consider adding `deletedAt DateTime?` to Case and FlRound if GDPR is a concern.

---

## 2. FL Coordinator (FastAPI) — B+

### Architecture
**Strengths:**
- ✅ Clean interface abstraction: `FLEngine` base class, `MockFLEngine` and `FlowerFLEngine` implementations
- ✅ Proper async/await throughout
- ✅ Webhook communication back to NestJS backend with shared secret
- ✅ Progress streaming to frontend via progress callback

### Mock Engine — Good Simulation
- ✅ Realistic delays: `8.0 + samples/80.0` mimics actual training overhead
- ✅ Non-IID simulation: Different per-hospital F1 trajectories
- ✅ F1 ceiling at 0.75 (matches domain knowledge from CONTEXT.md)
- ✅ Honest about randomness in weight delta norms

### Critical Issues

🔴 **Error handling in webhook callback** (`main.py:47–55`):
```python
try:
    await c.post(...)
except Exception:
    pass  # ← silently fails, no retry, no logging
```
**Impact**: If the backend is temporarily down, progress updates are lost silently.

**Fix**: Add logging + exponential backoff:
```python
import logging
logger = logging.getLogger(__name__)

try:
    await c.post(...)
except Exception as e:
    logger.error(f"Progress webhook failed: {e}, will retry")
    # Add retry logic or fire-and-forget but log
```

🔴 **No input validation on `StartRoundReq`** (`main.py:26–29`):
```python
class StartRoundReq(BaseModel):
    hospital_id: str    # ← no validation: could be empty, 1000 chars, SQL injection
    case_id: str        # ← same
    trigger: str        # ← same
```

**Fix**: Add Pydantic validators:
```python
from pydantic import Field

class StartRoundReq(BaseModel):
    hospital_id: str = Field(..., min_length=3, max_length=50)
    case_id: str = Field(..., min_length=3, max_length=50)
    trigger: str = Field(..., pattern="^(DOCTOR_UPLOAD|DISPUTE|SCHEDULED)$")
```

🟡 **No rate limiting on `/round/start`**: A malicious actor could DoS by spamming `/round/start` requests. Add:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/round/start")
@limiter.limit("5/minute")  # 5 requests per minute per IP
async def start_round(req: StartRoundReq, ...):
```

### Flower Engine — Good Structure
- ✅ Correct async wrapping of blocking `fl.server.start_server()`
- ✅ Proper metrics extraction from Flower history

⚠️ **Assumption**: Assumes all 3 hospital clients are **already running** before `/round/start` is called. If a hospital VM is down, the round blocks indefinitely. Consider adding timeout:
```python
config = fl.server.ServerConfig(
    num_rounds=self.rounds,
    timeout=ConfigsFactory.from_seconds(300)  # 5-min timeout
)
```

---

## 3. Seed Data (TypeScript) — A−

### Completeness
- ✅ 3 hospitals with realistic case counts (247, 312, 178 — same as mock.py)
- ✅ 9 users (1 admin, 6 doctors, 2 patients)
- ✅ 10 FL rounds with realistic F1 trajectories from thesis training
- ✅ Privacy audit logs properly seeded with `rawDataTransmitted=0`

### Potential Issues

⚠️ **Hardcoded F1 values**: Comment says "Update F1 values in the seed file once final training results are available" (`seed.ts:30`). This is a good reminder, but should be a TODO in your task system.

⚠️ **No case data**: The seed creates hospitals and rounds but no actual `Case` records. When a doctor logs in, there are no cases to review. You'll need to either:
1. Generate mock cases in seed (recommend 10–20 per hospital)
2. Or create a separate `/api/populate-mock-cases` endpoint

---

## 4. Shared Types (TypeScript) — A

- ✅ Clean exports for all domain types
- ✅ Patient-facing strings avoid FL jargon (✅ "AI trained across 3 hospitals" not "federated learning")
- ✅ WebSocket payload types defined upfront
- ✅ Good use of literal unions for enums

---

## 5. Missing Pieces (Required for Phase 2+)

### NestJS Backend (Not yet reviewed — needed)
- Authentication/JWT flow
- CasesController (POST /cases, GET /cases)
- InferenceService integration (calls FastAPI /predict)
- FLRoundService (listens for webhook, saves results)
- HospitalSiloGuard (enforces cross-hospital case blocking)
- WebSocket server for real-time FL progress

### FastAPI ML Service (Not yet reviewed)
- `/predict` endpoint (DINOv2 or R3D18 inference)
- Attention map generation (blob or MIL mode)
- Mock results from mock_results.json

### Next.js Frontend (Not yet reviewed)
- Doctor portal: case upload, prediction view, FL round animation
- Patient portal: prediction history view

---

## 6. Critical Invariants — Audit

| Invariant | Location | Status |
|-----------|----------|--------|
| `rawDataTransmitted` always 0 | schema.prisma:123 | ✅ Database default prevents accidents |
| HospitalSiloGuard blocks cross-hospital reads | TBD in NestJS | ⏳ Not yet reviewed |
| Case paths never mixed (hospital vs patient) | TBD in storage service | ⏳ Not yet reviewed |
| FL round fires **after** response returned | TBD in CasesController | ⏳ Not yet reviewed |
| Patient UI omits FL jargon | index.ts:5–17 | ✅ Verified in shared types |

---

## 7. Deployment Checklist

Before going to production, ensure:

- [ ] **Database**: PostgreSQL 14+ with SSL connection
- [ ] **Environment variables**: All required vars set (see CLAUDE.md Table)
  - `DATABASE_URL` (Postgres connection)
  - `FL_WEBHOOK_SECRET` (shared secret between coordinator and backend)
  - `INFERENCE_MODE` (mock or real)
  - `FL_MODE` (mock or flower)
  - `STORAGE_MODE` (local, minio, or s3)
  - `ATTN_MODE` (blob or mil)
  - `AL_MODE` (mock or real)
- [ ] **Error logging**: Coordinator logs are captured (currently silent failures)
- [ ] **Input validation**: Coordinator accepts arbitrary strings (needs Pydantic constraints)
- [ ] **Rate limiting**: Coordinator `/round/start` is open to DoS (needs slowapi)
- [ ] **Flower timeout**: If using Flower mode, configure server timeout
- [ ] **Mock results**: Update seed.ts F1 values with final training results
- [ ] **Test data**: Add 10–20 mock cases to seed so doctors have something to review

---

## 8. Recommendation: Phase 2 Priority

**Highest priority** (blocking inference):
1. ✅ Database schema — done
2. ✅ FL Coordinator structure — done, fix error handling + validation
3. ⏳ **NestJS CasesController** (upload, predict, return result to doctor)
4. ⏳ **FastAPI InferenceService** (/predict endpoint)

**High priority** (missing for demo):
5. ⏳ **WebSocket integration** (real-time FL progress)
6. ⏳ **HospitalSiloGuard** (enforce privacy)

**Medium priority**:
7. ⏳ Active learning service (phase 5)
8. ⏳ Chatbot integration (phase 4)

---

## Summary

**What's Good:**
- Database design is solid and privacy-aware
- FL Coordinator abstractions are clean
- Seed data is well-structured

**What Needs Fixing:**
- Coordinator error handling is silent (add logging)
- No input validation on `/round/start` (add Pydantic constraints)
- No rate limiting (add slowapi)
- Missing NestJS implementation
- No mock cases in seed

**Estimated effort to Phase 2-ready:** 4–6 days (NestJS + FastAPI + WebSocket)
