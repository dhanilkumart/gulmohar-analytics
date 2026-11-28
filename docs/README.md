# Gulmohar Analytics — Documentation Index

**Prepared:** 27 November 2026  
**Purpose:** A compact, current-oriented documentation set consolidated from the project documents supplied for review.

## Active documents

| Document | Use it for |
|---|---|
| [Architecture](architecture.md) | System structure, modules, data flow and product/deployment decisions |
| [Security and RBAC](security-and-rbac.md) | Roles, authorization boundaries, sessions, rate limiting and seed safety |
| [Development setup](development-setup.md) | Local prerequisites, environment variables, database and common commands |
| [Pending features](pending-features.md) | Current verification tasks, deferred scope and future ideas |
| [Petpooja integration](integrations/petpooja-integration.md) | API, normalization, mapping, ingestion and sales-data rules |
| [Petpooja worker operations](operations/petpooja-worker-operations.md) | Daily worker, state, recovery, configuration and VPS activation procedure |
| [Petpooja sales reconciliation](audits/petpooja-sales-reconciliation.md) | Dated data/reconciliation observations and unresolved discrepancies |
| [VPS deployment checkpoint](deployment/GULMOHAR_VPS_DEPLOYMENT_CHECKPOINT.md) | Production VPS reference and deployment safety rules |

## Source-of-truth rules

1. Source code, `prisma/schema.prisma`, committed migrations and the live database are authoritative for actual implementation.
2. This documentation describes the state reported by the supplied audits, primarily dated 11–27 November 2026. Re-verify before acting.
3. The pending-features register is a planning document, not proof that an item is still outstanding.
4. Never copy secrets, customer information or raw POS payloads into documentation.
5. Do not treat historical webhook/Supabase exploration as the current integration.
6. Production actions require explicit approval and a fresh read-only preflight.

## Historical documents

Superseded audits and source reports should be kept outside the active documentation set (for example, in a temporary `docs/archive/`) until the team confirms the consolidated references are complete. Do not delete originals solely because this package was generated.
