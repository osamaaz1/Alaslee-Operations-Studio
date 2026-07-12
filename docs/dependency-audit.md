# Dependency Audit

## CRM additions

| Dependency | Purpose | Decision |
| --- | --- | --- |
| `pg` | Parameterized PostgreSQL pooling and transactions | Required for the selected local PostgreSQL boundary. |
| `zod` | Shared browser/server edge validation | Required to keep one validation contract and reject invalid input before services. |
| `libphonenumber-js` | E.164 normalization and country-aware phone validation | Required for searchable international calling codes and Saudi defaults. |
| SheetJS `xlsx@0.20.3` official archive | Controlled CSV/XLS/XLSX historical import | Used only on trusted local exports with size/row limits. The vulnerable npm registry release was removed. |

`npm audit --audit-level=high` must report zero known vulnerabilities before release.
