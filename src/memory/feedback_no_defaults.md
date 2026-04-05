---
name: No default parameters
description: Steve dislikes default parameters — callers should be explicit
type: feedback
---

Avoid default parameter values. Require callers to be explicit about what they're passing. This applies to TypeScript and Go.

**Why:** Default parameters hide intent and make call sites less readable. Steve prefers explicit over implicit.

**How to apply:** When adding optional-feeling parameters, make them required instead. If something truly needs to be optional, use a union type with undefined and let the caller pass undefined explicitly, or handle it with an if-check at the call site.
