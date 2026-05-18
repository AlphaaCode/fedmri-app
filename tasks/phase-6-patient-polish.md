# Phase 6 — Patient portal, PDF export, UX polish

**Model**: claude-sonnet-4-6
**Skills**: frontend-design (web design aesthetic) → tdd (for PDF generation)
**Complexity**: L3

## Prompt for Claude Code

```
Read CLAUDE.md and CONTEXT.md. Pay close attention to CONTEXT.md invariant 5:
patient-facing UI never uses FL jargon — only "AI trained across 3 hospitals".

Task A — Patient portal pages (apps/web/app/patient/):

1. /patient/register and /patient/login — clean, no hospital field

2. Patient onboarding (/patient/onboarding — shown once, onboardingDone=false):
   3-step interactive explainer (HTML stepper, not a modal):
   Step 1: "3 hospitals trained an AI together"
     Visual: 3 building icons with lock symbols
   Step 2: "Patient records never left each hospital"
     Visual: animated dashed arrows (model weights) traveling to central point,
             solid red X over raw MRI images
   Step 3: "You benefit from all 3 hospitals' expertise"
     Visual: single brain/star icon receiving from all 3
   Skip button + "Got it" button → sets onboardingDone=true via PATCH /users/me

3. /patient/scan — upload page:
   - Clean upload zone: "Upload your MRI scan or photo"
   - Accepted formats shown: "JPEG, PNG, DICOM (.dcm), MHA (.mha)"
   - On result: show subtype in plain language (use SUBTYPE_PLAIN from shared/types)
     NOT: "Luminal A — ER+/PR+, HER2−"
     YES: "Luminal A — most common, typically slower-growing and hormone-sensitive"
   - Confidence shown as: High / Moderate / Low — no decimal numbers
   - Non-dismissable disclaimer (red-bordered box, always visible below result):
     "This is an educational AI tool. Only a certified oncologist can diagnose cancer.
      If you have concerns, please contact your doctor or nearest cancer centre."

4. /patient/chat — patient chatbot (connect to Phase 4 backend)

5. /patient/results — scan history timeline (list of past cases, date + subtype)

Task B — PDF export:

Install @react-pdf/renderer.

POST /cases/:id/pdf (or GET with auth):
Generate a PDF containing:
- Header: "FedMRI — AI Scan Summary" + date
- Section 1: "AI Result" — subtype (plain language), confidence level (High/Med/Low)
- Section 2: "What this means" — 2-sentence plain-language description from SUBTYPE_PLAIN
- Section 3: "Questions to ask your doctor" — 5 bullet points specific to subtype:
  Luminal A: "Is hormone therapy (tamoxifen) appropriate?", "How often should I be monitored?", ...
  (write appropriate questions for each subtype from CONTEXT.md clinical facts)
- Footer: disclaimer text (same as UI disclaimer)
- FedMRI logo placeholder (grey box with text "FedMRI")

Task C — Global UX polish:

- Loading skeletons on all data-fetching pages (shadcn Skeleton)
- Error boundaries on all page-level components
- Toast notifications: upload complete, FL round complete (from WS event), model updated
- Responsive layout (mobile web — single column below 768px)
- Dark mode: Tailwind dark: classes throughout
- Persistent silo status bar on all doctor pages:
  "Your hospital silo is active — data stays here" with shield icon
  Color: green when FL round idle, amber when round running, green when complete

Write tests:
- PDF endpoint returns Content-Type: application/pdf
- PDF contains disclaimer text
- Patient result page shows SUBTYPE_PLAIN text, not SUBTYPE_CLINICAL
- Onboarding sets onboardingDone=true after "Got it"
```

## Acceptance criteria

- [ ] Patient onboarding shown on first login, not shown on second
- [ ] All patient-facing text uses plain-language subtype descriptions
- [ ] PDF downloads with correct Content-Type and contains disclaimer
- [ ] Silo status bar visible and correct state on all doctor pages
- [ ] Dark mode renders all pages without invisible text
