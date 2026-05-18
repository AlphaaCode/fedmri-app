# Phase 4 — Chatbot (doctor + patient) with streaming

**Model**: claude-opus-4-6
**Skills**: tdd
**Complexity**: L4

## Prompt for Claude Code

```
Read CLAUDE.md and CONTEXT.md. Read packages/shared/src/types/index.ts.

Task A — NestJS ChatModule:

1. @WebSocketGateway (extend existing or new namespace '/chat'):
   - On 'chat:message' event: {content, caseId?, role:'doctor'|'patient'}
   - Build system prompt based on role:

   DOCTOR system prompt template:
   """
   You are a clinical AI assistant for oncologists using the FedMRI federated learning
   system. You have access to the following case context:
   {{CASE_CONTEXT}}
   The prediction was made by the global FL model (version {{MODEL_VERSION}}), trained
   across 3 hospitals using {{STRATEGY}} aggregation (F1 macro: {{F1_MACRO}}).
   Answer clinical questions about the prediction, explain the FL process, suggest
   literature, and help interpret the attention map. You may use medical terminology.
   Never fabricate citations. If unsure, say so.
   """

   PATIENT system prompt template:
   """
   You are a supportive health guide for patients using an AI breast MRI analysis tool.
   The AI was trained across 3 hospitals without sharing any patient records.
   Rules you must always follow:
   1. Never give clinical diagnosis, treatment recommendations, or medication advice.
   2. Always recommend consulting a certified oncologist for medical decisions.
   3. Use plain language — no jargon, no acronyms without explanation.
   4. If asked about prognosis or survival rates, acknowledge the question warmly then
      redirect to their oncologist.
   5. If asked about the AI prediction, explain in lay terms what the subtype means
      generally. Never say "you have" or "you don't have" cancer.
   """

2. Stream Anthropic API response token by token:
   - Use @anthropic-ai/sdk with streaming=true
   - Emit each token as WS event 'chat:token' {token, done:false}
   - Emit 'chat:token' {token:'', done:true} when stream ends
   - Rate limit: 10 messages/minute per user (Redis counter, key: chat_rate:{userId})

3. Persist messages to ChatMessage table (userId, caseId?, role, content)

4. GET /chat/history — last 50 messages for current user

Task B — Next.js chat UI:

1. Doctor chat page (/doctor/chat):
   - Full-page chat interface
   - If arriving from a case page (/doctor/cases/:id → chat), auto-inject caseId
   - Case context banner at top: shows subtype, confidence, model version
   - Message input + send button
   - Streaming: messages render token by token as they arrive
   - Suggested starters (disappear after first message):
     "Why was this classified as {{subtype}}?"
     "How confident should I be in this result?"
     "What does the attention map highlight?"
     "How did the FL round improve this prediction?"
   - Markdown rendering for assistant messages (react-markdown)

2. Patient chat page (/patient/chat):
   - Same streaming UI, simplified styling
   - No case context banner (patient may not have a case)
   - Suggested starters:
     "What does Luminal A mean in simple terms?"
     "What questions should I ask my oncologist?"
     "Is this type of cancer hereditary?"
     "What lifestyle changes are generally recommended?"
   - Persistent disclaimer bar (non-dismissable, always visible):
     "This AI provides general information only. Always consult a certified oncologist."

Write tests:
- WS 'chat:message' with DOCTOR role + valid caseId → receives streaming tokens
- WS 'chat:message' with PATIENT role → receives streaming tokens
- Rate limit: 11th message in 1 minute → error event 'chat:error' {code:'RATE_LIMIT'}
- GET /chat/history → returns messages in chronological order
- Patient message containing "what medication" → response contains redirect to doctor
  (test with a fixed seed/stub of the Anthropic response)
```

## Acceptance criteria

- [ ] Doctor chatbot streams tokens in real time
- [ ] Patient chatbot refuses clinical advice in response to "what medication should I take"
- [ ] Rate limit fires correctly on 11th message
- [ ] Chat history persisted and retrievable
- [ ] Case context correctly injected into doctor system prompt when caseId provided
