# Phase 2 — ML service + cases module + upload → prediction

**Model**: claude-sonnet-4-6
**Skills**: tdd
**Complexity**: L3

## Prompt for Claude Code

```
Read CLAUDE.md and CONTEXT.md. Read apps/backend/prisma/schema.prisma.

Task A — FastAPI ML service (apps/ml-service/):

1. Create apps/ml-service/main.py with:
   - POST /predict: accepts multipart image file, returns PredictionResult
   - GET /metrics: returns current model metrics
   - GET /health

2. Create apps/ml-service/mock_results.json with 50 entries.
   Distribution: 33 Luminal A, 9 Luminal B, 3 HER2, 5 Triple Negative.
   Each entry: {id, predicted_subtype, confidence, probs:[p0,p1,p2,p3], model_version, strategy}
   Confidence ranges: Luminal A 0.55–0.88, Luminal B 0.42–0.72, HER2 0.38–0.65, TN 0.40–0.68

3. Mock predict logic:
   - Hash filename → deterministic seed (seed = hash(filename) % 50)
   - Select result[seed] from mock_results.json
   - Add np.random.normal(0, 0.025) to each prob
   - Renormalize with softmax
   - asyncio.sleep(random.uniform(1.5, 3.0))
   - Return result

4. INFERENCE_MODE=real path: load checkpoint from MODEL_CHECKPOINT_PATH,
   run model forward pass (stub — raise NotImplementedError with message
   "Set checkpoint path and INFERENCE_MODE=real to enable real inference")

Task B — NestJS CasesModule:

1. POST /cases (multipart — requires DOCTOR or PATIENT JWT):
   - Multer: accept image/*, .mha, .nii, max 50MB
   - Determine scope: DOCTOR → HOSPITAL, PATIENT → PATIENT
   - Store file: HOSPITAL → uploads/hospitals/{hospitalId}/cases/{caseId}/
                 PATIENT  → uploads/patients/{userId}/cases/{caseId}/
   - Call InferenceService.predict(filePath) → HTTP POST to ML service
   - Save Case to DB (scope, imagePath, predictedSubtype, confidence, probs,
     modelVersion, storedLocally=true, hospitalId if DOCTOR)
   - Return case immediately to client
   - AFTER returning: fire FLRoundService.triggerRound() in background (DOCTOR only)
     Use setImmediate() or EventEmitter to ensure response is sent first

2. GET /cases (paginated, filter by status/scope/subtype, sorted by createdAt desc)
   HospitalSiloGuard must be applied — doctors see only their hospital's cases

3. GET /cases/:id — full case detail
   HospitalSiloGuard applied

Write tests (TDD):
- POST /cases with DOCTOR JWT + image → 201 with predictedSubtype set
- POST /cases with PATIENT JWT + image → 201 with scope=PATIENT
- GET /cases with DOCTOR JWT → only returns cases from doctor's hospital
- GET /cases with PATIENT JWT → only returns that patient's cases
- GET /cases/:id with wrong-hospital DOCTOR JWT → 403

Invariant check: storedLocally must be true on every created case.
```

## Acceptance criteria

- [ ] `POST /cases` returns prediction in < 4s (mock mode)
- [ ] File lands in correct scoped path (`uploads/hospitals/` or `uploads/patients/`)
- [ ] FL round fires asynchronously — response arrives before round completes
- [ ] All 5 case tests pass
- [ ] `GET /metrics` from ML service returns seeded F1 values
