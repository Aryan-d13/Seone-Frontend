# Seone Admin Template Storage Contract

**Last updated:** March 26, 2026

This is the production contract for template authoring and template asset storage.

## Production writer

- The only supported production template authoring surface is the embedded admin panel at `/dashboard/admin` in the Next frontend.
- The standalone Vite app in `template-builder/` is not the production writer.
- Browser Firebase template CRUD is deprecated and must not be reintroduced into the shipped frontend.

## Canonical template asset fields

- `source_uri` is the only canonical asset location for new template writes.
- `gcs_path` is legacy compatibility metadata for older Firebase/GCS-backed templates.
- `path` is optional local/template-relative metadata and is not the canonical cloud location.

### Allowed `source_uri` forms

- `azure://...`
- `gs://...`
- normalized storage keys such as `templates/chaturnath_v1/assets/logo.png`
- `http(s)://...` only for intentional remote assets, not Seone `/api/...` or `/data/...` gateway URLs

## Current production write flow

1. The admin panel uploads template logos to Azure Blob Storage.
2. The admin panel saves template documents through Seone's backend API.
3. New logo writes persist `source_uri=azure://seone-data/templates/<doc_id>/assets/logo.png`.
4. New writes must not store Azure blob keys in `gcs_path`.

## Read and preview flow

- Admin template previews load through the backend template asset proxy:
  - `GET /api/v1/pages/admin/templates/{doc_id}/assets/{asset_key}`
- Clip Studio template/logo previews load through the backend clip asset proxy:
  - `GET /api/v1/jobs/{job_id}/clips/{clip_index}/assets/{asset_key}`
- The browser should not guess between Firebase and Azure for template assets.

## Backend resolution order

For template assets:

1. exact `source_uri`
2. legacy `gcs_path` if `source_uri` is absent
3. provider fallback order for legacy refs:
   - Firebase/GCS
   - Azure
   - active storage backend
   - local/filesystem
4. compatibility key rewrites such as `templates/foo_v1/...` to `templates/foo/...` only after exact-key failure

## Admin persistence behavior

- Production must set `ALLOW_TEMPLATE_FILESYSTEM_FALLBACK=false`.
- In development, filesystem fallback may remain enabled.
- When filesystem fallback is disabled and Firestore is unavailable:
  - admin list/load/save/delete must fail
  - the backend must not silently write template documents to local disk

## Manifest contract

- `template_ir.assets` is the canonical asset metadata in manifests.
- `manifest.assets` is derived editor cache only.
- Studio/admin save paths must ignore or overwrite client-provided `manifest.assets`.
- Preview/export must read from `template_ir.assets`, not treat `manifest.assets` as canonical storage metadata.

## Required production environment

- `STORAGE_BACKEND`
- `GCS_BUCKET_NAME`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_CONTAINER_NAME`
- `ALLOW_TEMPLATE_FILESYSTEM_FALLBACK=false`

## Pre-deploy audit

Run the storage audit before production rollout:

```bash
python scripts/audit_template_storage.py --fail-on-findings
```

To apply deterministic Azure promotions where possible:

```bash
python scripts/audit_template_storage.py --write --fail-on-findings
```

The audit reports:

- templates with `gcs_path` but no `source_uri`
- assets where Azure-backed data appears to live only in `gcs_path`
- canonical refs that incorrectly point at `/data/...` or `/api/...`
- versioned/non-versioned asset key drift
- templates that exist only on local filesystem
