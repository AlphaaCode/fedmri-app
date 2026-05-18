# Phase 5 — Feedback, active learning loop, model metrics dashboard

**Model**: claude-opus-4-6
**Skills**: improve-codebase-architecture → tdd
**Complexity**: L5

## Prompt for Claude Code

```
Read CLAUDE.md, CONTEXT.md, docs/adr/ADR-003-interface-abstraction.md.
Read apps/backend/prisma/schema.prisma (Feedback, ModelMetrics tables).

Task A — FeedbackModule (NestJS):

1. POST /feedback:
   DTO: {caseId, feedbackType:'VALIDATE'|'DISPUTE', correctedSubtype?, evidenceTypes:string[], justification?}
   Validation:
   - feedbackType=DISPUTE requires correctedSubtype (one of 4 subtypes)
   - evidenceTypes non-empty array of: 'Biopsy','IHC','Clinical','Radiologist','Literature'
   - Only DOCTOR role can submit
   - caseId must belong to doctor's hospital (HospitalSiloGuard)

   On VALIDATE:
   - Update case.status = VALIDATED
   - Create Feedback row (alTriggered=false)
   - Return feedback

   On DISPUTE:
   - Update case.status = DISPUTED
   - Create Feedback row (alTriggered=true)
   - Call ALService.triggerUpdate(caseId, correctedSubtype, hospitalId) — async, non-blocking
   - Return feedback immediately

2. ALService.triggerUpdate():
   - POST to ML_SERVICE_URL/feedback with {case_id, correct_subtype, predicted_subtype}
   - On response: get newModelVersion, update Feedback.newModelVersion
   - Create new ModelMetrics row with updated f1 values
   - Emit WS event 'model:updated' {modelVersion, f1Delta, correctedSubtype}
   - Return immediately (fire-and-forget, same pattern as FL round trigger)

3. ML service /feedback endpoint (apps/ml-service/):
   AL_MODE=mock:
   - Update in-memory _F1_STATE:
     f1[corrected_class] += random.uniform(0.005, 0.015)
     other classes ± random.uniform(0, 0.005) noise
     model_version += 1
   - asyncio.sleep(2.0) — simulate fine-tune delay
   - Return {model_version, f1_per_class, f1_macro}
   AL_MODE=real: stub with NotImplementedError

Task B — Model metrics dashboard (Next.js /doctor/model):

Three recharts panels:

1. Convergence curve (LineChart):
   X: FL round number, Y: F1 macro
   Three lines: FedAvg, FedProx, Centralized baseline
   Data from GET /model/history?strategy=all
   Seeded with real thesis F1 values from CONTEXT.md

2. Per-class F1 bar chart (BarChart grouped):
   4 classes × 3 strategies = 12 bars
   Color: Luminal A=teal, Luminal B=blue, HER2=amber, Triple Negative=coral

3. Confusion matrix heatmap (custom SVG grid):
   4×4 grid, cells colored by count, diagonal = correct predictions
   Data from GET /model/confusion-matrix

4. Comparison card:
   "Centralized baseline: F1 0.46 | FedProx: F1 0.41 | Gap: -0.05"
   "Privacy cost of centralization: 737 patients' raw data would have been shared"

Write tests:
- POST /feedback DISPUTE with valid correctedSubtype → 201, case.status=DISPUTED
- POST /feedback DISPUTE without correctedSubtype → 400
- POST /feedback VALIDATE from wrong-hospital doctor → 403
- AL mock: model_version increments after dispute
- WS 'model:updated' received after dispute feedback submitted
- ModelMetrics row created after AL update
```

## Acceptance criteria

- [ ] Dispute feedback → WS 'model:updated' fires within 5s (mock mode)
- [ ] ModelMetrics row exists with incremented version after each dispute
- [ ] Convergence chart shows real F1 values from CONTEXT.md
- [ ] All 6 feedback tests pass
- [ ] `rawDataTransmitted` in PrivacyAuditLog never touched by this phase
