# Project conventions

- Never add Dockerfiles, Compose files, container workflows, or Docker-based setup. The user explicitly requires native processes.
- Frontend: Vue 3, TypeScript, shadcn-vue and Tailwind CSS. Use Composition API and `<script setup lang="ts">`.
- All panels MUST use the shared `apps/web/src/components/classroom/ContentPanel.vue` component. This applies to every page, including lists, forms, settings, secondary panels, and empty states. Never build a separate panel with a native element's `class="panel"`, use `Card` directly outside the shared component, or create a competing panel component.
- Follow the shared panel structure and styles: use its header/actions/footer slots where appropriate, shared `panel-heading`, `table-controls`, `filter-tabs`, `search-field`, and `Pagination` for list content, and `panel-fill` with `fill-stack` wrappers for panels that fill the remaining desktop viewport. Do not override panel borders, backgrounds, radius, shadows, spacing, or heading/table typography per page. Keep page-specific CSS limited to the content's layout and semantics. Change the shared component or shared styles when a panel convention needs to change; do not add local exceptions.
- Target desktop browsers and desktop teaching/programming workflows. Responsive and mobile adaptation are out of scope unless the user explicitly requests them; do not require them for implementation or acceptance.
- Database: PostgreSQL. Use versioned Drizzle migrations; never silently reset developer data.
- Execution engine: go-judge, running natively on Linux. macOS support is experimental and must not be treated as production validation.
- Keep business API and untrusted code execution separate. Never execute student code directly in the API process.
- Keep secrets in ignored local files. Local development connects to the machine's native PostgreSQL (Homebrew service on macOS, port 5432); the Linux deployment keeps its PostgreSQL data under ignored `.local/` via `deploy.sh`. Commit `.env.example` and `pnpm-lock.yaml`.
- The current scope is infrastructure. Do not imply authentication, classroom permissions, code execution, or interactive EOF have been implemented until they are actually verified.
- Run `pnpm check`, `pnpm test`, and `pnpm build` for infrastructure changes. Use `pnpm db:migrate` and `pnpm queue:probe` when changing database or queue integration.
