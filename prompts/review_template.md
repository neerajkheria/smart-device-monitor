# Reusable Prompt: Engineering Code Review

**Task**: Conduct a pre-commit code review on the provided changes.
**Context**: @git-diff or specified @file references.
**Checklist**:
1. Conformance with `.cursor/rules/architecture.mdc`.
2. Missing input validation or unhandled promise rejections.
3. Absence of unit tests for newly introduced branches.
4. Leakage of credentials or telemetry debug tokens[cite: 7].
**Output**: Structured markdown table with Severity (Blocker, Major, Nit), File:Line, Issue Description, and Suggested Fix.