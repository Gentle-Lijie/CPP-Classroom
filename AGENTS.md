# Project conventions

- Never add Dockerfiles, Compose files, container workflows, or Docker-based setup. The user explicitly requires native processes.
- Frontend: Vue 3, TypeScript, shadcn-vue and Tailwind CSS. Use Composition API and `<script setup lang="ts">`.
- Target desktop browsers and desktop teaching/programming workflows. Responsive and mobile adaptation are out of scope unless the user explicitly requests them; do not require them for implementation or acceptance.
- Database: PostgreSQL. Use versioned Drizzle migrations; never silently reset developer data.
- Execution engine: go-judge, running natively on Linux. macOS support is experimental and must not be treated as production validation.
- Keep business API and untrusted code execution separate. Never execute student code directly in the API process.
- Keep secrets in ignored local files. Local development connects to the machine's native PostgreSQL (Homebrew service on macOS, port 5432); the Linux deployment keeps its PostgreSQL data under ignored `.local/` via `deploy.sh`. Commit `.env.example` and `pnpm-lock.yaml`.
- The current scope is infrastructure. Do not imply authentication, classroom permissions, code execution, or interactive EOF have been implemented until they are actually verified.
- Run `pnpm check`, `pnpm test`, and `pnpm build` for infrastructure changes. Use `pnpm db:migrate` and `pnpm queue:probe` when changing database or queue integration.
