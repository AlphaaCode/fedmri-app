# ADR-004: Federated optimization objective + live FL test

## Status
Accepted (2026-06-02)

## Context
The supervisor requires the app to (a) implement a federated-learning test model
and (b) specify the optimization objective. Full re-training is ~12 h/run on GPU.

## Decision
- State the global objective F(w)=Σ (n_k/n)·F_k(w) with class-balanced CE locals,
  the four aggregation rules (FedAvg/Momentum/SCAFFOLD/FedSCRT), and macro-F1 as
  the metric, surfaced in the researcher portal + CONTEXT.md.
- Surface the real offline experiment results (no fabricated FL numbers).
- Provide a live FL test that runs the genuinely-federated head aggregation in
  seconds over cached frozen-backbone features (numpy, no GPU). The federated step
  is real; the expensive backbone feature extraction is precomputed offline.

## Consequences
- Honest, reproducible FL demonstration without GPU at click time.
- The live numpy head optimizes the same class-balanced CE objective as the
  training code's nn.Linear+Adam head; the demonstrated quantity is aggregation.
- rawDataTransmitted stays 0 (only head weights move).
