# Phase 3 — Attention map + FL round events + topology visualizer

**Model**: claude-opus-4-6
**Skills**: tdd → improve-codebase-architecture (for Konva integration)
**Complexity**: L4

## Prompt for Claude Code

```
Read CLAUDE.md, CONTEXT.md, and docs/adr/ADR-002-fl-coordinator-standalone.md.
Read apps/fl-coordinator/main.py and engines/*.py.

Task A — FL round NestJS integration:

1. Create FLRoundModule in NestJS:
   - POST /internal/fl/progress (webhook from fl-coordinator — validates x-fl-secret header)
     → emits WS event 'fl:round:progress' to all doctors in room 'doctors'
   - POST /internal/fl/round-complete (webhook — validates x-fl-secret)
     → saves FlRound + FlContribution[] + PrivacyAuditLog[] to DB
     → updates Case.flRoundId for the triggering case
     → emits WS event 'fl:round:complete' to room 'doctors'
     → bumps ModelMetrics row
   - GET /fl/rounds (list, paginated)
   - GET /fl/rounds/:id (detail with contributions)
   - GET /fl/hospital/contribution (summary for current doctor's hospital)
   - GET /fl/privacy-log (current hospital's audit entries — doctor only)

2. FLRoundService.triggerRound(hospitalId, caseId):
   - POST to FL_COORDINATOR_URL/round/start with {hospital_id, case_id, trigger:'DOCTOR_UPLOAD'}
   - Store round_id in Redis (key: fl:active:{hospitalId}) for status polling
   - Return immediately (fire-and-forget)

3. @WebSocketGateway (NestJS):
   - On connection: validate JWT from handshake, join room 'doctors' if role=DOCTOR
   - Events to relay: fl:round:started, fl:round:progress, fl:round:complete

Task B — ML service attention endpoint:

1. GET /attention/{case_id} (or return in /predict response as optional field):
   - ATTN_MODE=blob: generate 2–3 Gaussian blobs at seed=hash(case_id)
     Positions: center-left area (x: 80–160, y: 80–160 of 224×224 grid)
     Amplitude scaled by confidence: high conf → σ=20, low conf → σ=35
     Add uniform noise floor 0.05, normalize to [0,1], return as flat list[float] len=50176
   - ATTN_MODE=mil: load model, run forward, extract attn_weights, upsample
     (stub with NotImplementedError like inference real mode)

Task C — Next.js doctor UI (apps/web/):

1. Init: npx create-next-app@latest web --typescript --tailwind --app --skip-git
2. Install: shadcn/ui, socket.io-client, konva, react-konva, @tanstack/react-query, zustand

3. Doctor scan page (/doctor/scan):
   - Drag-drop upload (react-dropzone)
   - On submit: POST /cases → show skeleton loader → display prediction result
   - 4-class probability bar chart (recharts HorizontalBar)
   - Subtype badge: Luminal A=teal, Luminal B=blue, HER2=amber, Triple Negative=coral
   - Confidence as text: ≥0.70 "High", 0.50–0.69 "Moderate", <0.50 "Low — seek specialist"

4. FL topology widget (sidebar, always visible on doctor pages):
   - SVG: 3 hospital nodes (circles) + central aggregation server (rect) + connecting lines
   - State: idle → local_training (active hospital pulses) → aggregating → complete
   - Driven by WS events from Socket.io
   - On 'fl:round:progress': highlight the reporting hospital node (pulse animation)
   - On 'fl:round:complete': show green checkmark + "Model v{n} — F1 improved by +{delta}"
   - Privacy pill: "Your data stayed in your hospital. 0 bytes of patient data transmitted."

5. Attention map overlay:
   - After prediction, fetch /attention/:caseId
   - Konva Stage: MRI image layer + heatmap overlay layer (colormap: blue→yellow→red)
   - Opacity slider (0–100%)
   - Toggle button: "Show AI focus areas"

Write tests:
- WS 'fl:round:complete' event received after coordinator webhook fires
- GET /fl/privacy-log for doctor → rawDataTransmitted always 0 on every row
- Attention map returned as list of 50176 floats (224×224)
- GET /fl/hospital/contribution → correct hospital's stats only (silo check)
```

## Acceptance criteria

- [ ] Doctor uploads scan → prediction appears in < 4s
- [ ] Within 30s: FL topology animation completes, model version bumps
- [ ] `GET /fl/privacy-log` shows `rawDataTransmitted: 0` on every row — zero exceptions
- [ ] Attention map renders as heatmap overlay on MRI with opacity slider
- [ ] WS disconnects and reconnects cleanly without double events
