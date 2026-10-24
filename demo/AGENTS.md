# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Current scope: real local Python/OpenCV/FFmpeg pipeline, not a frontend-only simulation. Default scene is kindergarten, using the archived kindergarten concept as the visual direction; adventure mode reuses the same real pipeline. Never replace inference results with canned clusters. Preserve original user media, version/approval boundaries, signed-session isolation and explicit synthetic fixture labels. Do not commit runtime source media, face embeddings, session keys or ONNX weights.

Durable UI preference: selected navigation items use background and text color only; never add a left-side accent stripe (including inset shadows or pseudo-elements). Story analysis uses explicitly consented OpenRouter/Luna calls, never canned model results; preserve source audio by default and keep teacher review before delivery.

Durable product preference: support Chinese and English in the UI and the public-facing README guides. Persist the interface language; use it for new AI drafts without rewriting saved user content. Keep product copy user-facing, remove decorative microcopy and development diagnostics from normal flows, and guide the four steps of import, people confirmation, story editing, and review/delivery. Use separate Story/Clips/People tabs to keep large projects manageable.

Completed examples must feature real everyday activities (prefer kindergarten/school or amusement settings) with multiple people, source sound, actual saved outputs and attribution. Deliberately curated public fixtures in `public/examples/` are the documented exception to the runtime-media exclusion above; never include user runtime originals, keys, embeddings or session secrets. Example viewing must not call a paid model or substitute fixtures for new inference. Keep technical evaluation in QA/docs. Do not imply that short source footage demonstrates a full week or that a draft translation was a new model analysis. Repository visibility and a future code license require a separate explicit decision.
