# FedMRI — Software Engineering Diagrams

All diagrams generated from `CLAUDE.md` + `CONTEXT.md` + `schema.prisma` — update when schema changes.

**FigJam board**: https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV

---

## Diagram index

| # | Name | Type | File | FigJam |
|---|---|---|---|---|
| 01 | C4 System Context | graph LR | [01-c4-context.mermaid](01-c4-context.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 02 | C4 Container Diagram | graph LR | [02-c4-containers.mermaid](02-c4-containers.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 03 | Use Case Diagram | graph LR | [03-use-cases.mermaid](03-use-cases.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 04 | Entity-Relationship Diagram | erDiagram | [04-erd.mermaid](04-erd.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 05 | Class Diagram — Domain Model | classDiagram | [05-class-domain.mermaid](05-class-domain.mermaid) | `.mermaid` only — FigJam does not support classDiagram |
| 06 | Sequence — Patient: MRI upload to result | sequenceDiagram | [06-seq-patient-upload.mermaid](06-seq-patient-upload.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 07 | Sequence — Doctor: upload → FL round auto-trigger | sequenceDiagram | [07-seq-doctor-fl-round.mermaid](07-seq-doctor-fl-round.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 08 | Sequence — Doctor: dispute → active learning | sequenceDiagram | [08-seq-al-feedback.mermaid](08-seq-al-feedback.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 09 | Sequence — Researcher: dataset access (privacy-preserved) | sequenceDiagram | [09-seq-researcher-dataset.mermaid](09-seq-researcher-dataset.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 10 | Activity — Patient journey | flowchart TD | [10-activity-patient.mermaid](10-activity-patient.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 11 | Activity — Doctor journey | flowchart TD | [11-activity-doctor.mermaid](11-activity-doctor.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 12 | Activity — Researcher journey | flowchart TD | [12-activity-researcher.mermaid](12-activity-researcher.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 13 | State Machine — Case lifecycle | stateDiagram-v2 | [13-state-case.mermaid](13-state-case.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 14 | State Machine — FL Round lifecycle | stateDiagram-v2 | [14-state-fl-round.mermaid](14-state-fl-round.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 15 | Data Flow — FL privacy argument | flowchart TD | [15-dfd-fl-privacy.mermaid](15-dfd-fl-privacy.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |
| 16 | Deployment — Mock vs Production | graph LR | [16-deployment.mermaid](16-deployment.mermaid) | [board](https://www.figma.com/board/2n9RGZfmuWK2hyHhGSJ9sV) |

---

## Descriptions

| # | Description |
|---|---|
| 01 | Three actors (Patient, Doctor, Researcher) and three external systems (Anthropic API, Flower, DICOM viewer) around the central FedMRI platform. |
| 02 | All eight containers (Next.js, Expo, NestJS, FastAPI ML, FastAPI FL Coordinator, PostgreSQL, Redis, Storage) with annotated data flows and JWT/webhook boundaries. |
| 03 | Full use case inventory for all three actors with `<<include>>` relationships for FL round trigger, attention map view, and active learning. |
| 04 | Complete ERD from `schema.prisma` with all nine models, cardinalities, and annotations for `rawDataTransmitted=0` and `scope=HOSPITAL|PATIENT` invariants. |
| 05 | Bounded-context class diagram (Hospital Silo, Global Model, Patient Space) with service interfaces (`InferenceEngine`, `FLEngine`, `StorageProvider`) and their mock/real implementations. |
| 06 | Patient upload → ML inference → plain-language result flow, explicitly showing no FL round is triggered for `scope=PATIENT` cases. |
| 07 | Doctor upload → sync inference (doctor sees result) → async FL round (three hospitals → FedAvg → webhook → WS broadcast), with `rawDataTransmitted=0` annotated at the DB write step. |
| 08 | Doctor dispute form → async active learning epoch → ML fine-tune → model version bump → WS toast notification. |
| 09 | Researcher dataset access showing the strict aggregate-only query boundary — raw `imagePath`, `userId`, individual records never returned by the API. |
| 10 | Patient portal journey: register → optional onboarding → upload/chat/history/settings paths, with specialist warning on low-confidence predictions. |
| 11 | Doctor portal journey: login → upload → validate-or-dispute branch → async FL completion with topology animation and silo status bar. |
| 12 | Researcher portal journey: four independent paths (system logs, model performance, dataset management, network topology) with strategy comparison and export flows. |
| 13 | Case state machine: `PENDING → VALIDATED` (doctor confirms) or `PENDING → DISPUTED` (doctor corrects, AL fires) with optional reset on AL completion. |
| 14 | FL round state machine: `IDLE → TRIGGERED → LOCAL_TRAINING → AGGREGATING → COMPLETE` (or `→ FAILED`) with Redis key lifecycle and privacy invariant on COMPLETE. |
| 15 | FL privacy data flow diagram: raw MRI data blocked at hospital silo boundary (red), only weight deltas (~12 MB/hospital/round) travel to the aggregation server. |
| 16 | Side-by-side deployment: single Docker Compose machine (mock, no GPU) vs multi-VM production (Flower clients behind hospital firewalls, managed DB/Redis/MinIO). |
