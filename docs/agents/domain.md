# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo is **single-context**: one `GLOSSARY.md` at the repo root, and ADRs in `docs/adr/`.

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-typescript-only-stack.md
│   ├── 0005-monorepo-feature-slices.md
│   └── ...
└── packages/
    ├── kernel/        纯领域逻辑与端口定义
    ├── kernel-pg/     Postgres/Drizzle 适配器
    ├── app/           Fastify 参考 API
    ├── web/           TanStack Start 管理后台
    └── shared/        跨包通用能力
```

The `packages/` split is a **technical layering of one domain**, not multiple business contexts: dependency direction is `app → kernel-pg → kernel`, with `web` depending on `app` over HTTP only and `shared` depending on nothing above it. One root `GLOSSARY.md` and one `docs/adr/` therefore cover every package — do not create a `GLOSSARY-MAP.md` or per-package glossaries unless a genuinely separate business vocabulary appears.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root
- **`docs/adr/`**: read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
