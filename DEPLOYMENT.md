# GitHub Pages release

Production URL: `https://vertexarena.github.io`.
Repository: `VertexArena/vertexarena.github.io`, branch `main`.

## Release gates

1. Complete requested roadmap milestones and their browser acceptance tests.
2. Run `node scripts/validate-release.mjs` and `git diff --check`.
3. Apply immutable database migrations with the connected Supabase app. Verify
   policies and indexes, and retain the corresponding schema in `SCHEMA.sql`.
4. Clean up test uploads, users and competition records.
5. Commit the completed release, then push `main` without rewriting history.

The user explicitly waived the fresh-project test for this release. Do not list
that acceptance item as tested or create another Supabase project for it.

## Pages configuration

Use GitHub Actions as the Pages build source. `.github/workflows/pages.yml`
validates release files and packages only application HTML, public configuration,
assets, CSS, JavaScript, manifest and service worker. Tests, local fixture data,
SQL, node_modules and documentation are excluded from the deployed artifact.
Official actions are pinned to immutable commits. The deploy job has only
`pages: write` and `id-token: write`; packaging has `contents: read`.

The repository is a root-domain Pages site, so paths and manifest scope use `/`.
`404.html` stores the intended path before recovering the SPA. Valid nested routes
must restore without showing the custom 404. Unknown routes render Vertex's real
404 page. A nested route can return HTTP 404 during static-host recovery; this is
expected and must not be replaced by an offline response in the service worker.

After deployment, check the production commit, direct discovery and login routes,
a published competition, nested refresh, invalid routes, public configuration and
the manifest. Production browser checks must allow the actual CDN dependencies.

## Database and push worker

GitHub deployment does not apply migrations or deploy Supabase Edge Functions.
Use `SUPABASE.md` for those independent steps. Public browser configuration must
continue pointing to `hbadiyiopvypeffaigmc`; never include a service-role key,
worker token or private VAPID signing key. Those remain in the server environment
or Supabase Vault. Notification preferences and device ownership remain private.

## Updates and recovery

Change the service worker's `VERSION` when shipping shell changes. An open app
offers **Reload to update** and does not automatically reload unsaved work.
Static assets use network-first delivery, with a cached offline fallback when
the network fails. Authentication/API data and private files are never cached.

To undo a frontend release, revert the faulty commit and push the new revert.
Do not reset or force-push remote history. Applied database migrations stay
immutable; repair database behavior with a new migration. Do not blindly roll
back a frontend to a version that assumes older permissions or schema.
