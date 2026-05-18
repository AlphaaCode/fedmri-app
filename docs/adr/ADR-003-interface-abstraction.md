# ADR-003: Mock-to-prod uses interface abstraction, not feature flags

**Status**: Accepted

Each swappable layer (inference, FL, storage, attention, AL) has an abstract base class
and two concrete implementations. Selected at startup via env var.
Application code calls only the interface — zero awareness of which mode is active.
