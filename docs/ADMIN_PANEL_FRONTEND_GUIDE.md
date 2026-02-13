# Seone Admin Panel — Frontend Implementation Guide

**From**: Backend Team
**To**: Frontend Team
**Date**: 2026-02-12

---

## What Changed

Templates and their assets (logos) are now stored in **Firebase Firestore** and **Google Cloud Storage** instead of hardcoded JSON files. The rendering worker automatically fetches templates from Firestore + downloads assets from GCS at render time.

**Your job**: Build an admin panel so users can create, edit, and delete templates and pages without any backend deployment.

---

## Architecture

```
┌─────────────────────┐
│   Admin Panel (FE)  │
│   Firebase JS SDK   │
└──────┬──────┬───────┘
       │      │
  Firestore  GCS (Firebase Storage)
       │      │
       │      │    ┌──────────────────────┐
       └──────┼───→│  Rendering Worker    │
              │    │  (reads at render)   │
              └───→│  Downloads assets    │
                   └──────────────────────┘
```

**No backend API needed.** The frontend writes directly to Firestore and GCS using the Firebase client SDK. The worker picks up changes automatically (5-minute cache TTL).

---

## Setup

### 1. Register Firebase Web App

```bash
# Run once (backend team can do this for you)
gcloud auth login
firebase projects:addfirebase seone-platform
firebase apps:create WEB "Seone Admin" --project seone-platform
```

This outputs the web config values you need.

### 2. Install Firebase SDK

```bash
npm install firebase
```

### 3. Firebase Config

```typescript
// src/config/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "seone-platform",
  apiKey: "<from step 1>",
  authDomain: "seone-platform.firebaseapp.com",
  storageBucket: "seone-platform.firebasestorage.app",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

---

## Firestore Collections

### `templates/{template_id}`

**Document ID format**: `{slug}_v{version}` — e.g. `chaturnath_v1`, `brand_xyz_v2`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Template ref used in job payloads, e.g. `"chaturnath/v1"` |
| `template_version` | string | ✅ | Always `"1.0"` for now |
| `name` | string | ✅ | Display name, e.g. `"Chaturnath Hindi"` |
| `description` | string | ❌ | Optional description |
| `canvas` | object | ✅ | `{ width: 1080, height: 1080 }` |
| `zones` | array | ✅ | Layout zones (see Zone Schema below) |
| `styles` | object | ✅ | Style definitions |
| `assets` | object | ❌ | Asset references with GCS paths |

### Zone Schema (inside `zones` array)

Every template has exactly **3 zones**:

#### Text Zone (title bar)

```json
{
  "id": "title_band",
  "type": "text",
  "content_ref": "pov_text",
  "bounds": { "x": 0, "y": 0, "width": 1080, "height": 270 },
  "z": 10,
  "text": {
    "max_lines": 3,
    "overflow": "shrink",
    "font": { "family": "NotoSansDevanagari", "weight": 700, "size": 60 },
    "width_percent": 75,
    "min_font_size": 24
  },
  "style_ref": "title_style"
}
```

#### Video Zone (main content)

```json
{
  "id": "video_main",
  "type": "video",
  "bounds": { "x": 0, "y": 270, "width": 1080, "height": 810 },
  "z": 0,
  "media": { "fit": "cover", "crop_anchor": "center" }
}
```

#### Image Zone (logo overlay)

```json
{
  "id": "logo_mark",
  "type": "image",
  "asset_ref": "logo_mark",
  "bounds": { "x": 30, "y": 30, "width": 200, "height": 80 },
  "z": 20
}
```

### Asset Schema (inside `assets` object)

```json
{
  "logo_mark": {
    "type": "image",
    "gcs_path": "templates/my_brand/assets/logo.png",
    "path": "assets/logo.png"
  }
}
```

> **Critical**: `gcs_path` is what the worker reads. It must match the path you upload the file to in GCS.

### `pages/{page_id}` (NEW — you create this)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Page display name |
| `tenant_id` | string | ✅ | User/org ID from auth |
| `template_id` | string | ✅ | Firestore doc ID, e.g. `"chaturnath_v1"` |
| `copy_language` | string | ✅ | `"hi"` or `"en"` |
| `active` | boolean | ✅ | Whether the page is active |
| `created_at` | timestamp | ✅ | Firestore server timestamp |
| `created_by` | string | ✅ | Email of creator |

```json
{
  "name": "Chaturnath Hindi",
  "tenant_id": "user-uuid",
  "template_id": "chaturnath_v1",
  "copy_language": "hi",
  "active": true,
  "created_by": "aryan@creativefuel.io"
}
```

---

## Logo Upload Flow

```typescript
import { ref, uploadBytes } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { storage, db } from "./config/firebase";

async function createTemplate(
  slug: string,
  templateData: object,
  logoFile: File
) {
  // 1. Upload logo to GCS
  const gcsPath = `templates/${slug}/assets/logo.png`;
  const storageRef = ref(storage, gcsPath);
  await uploadBytes(storageRef, logoFile);

  // 2. Set gcs_path in template data
  const data = {
    ...templateData,
    assets: {
      logo_mark: {
        type: "image",
        gcs_path: gcsPath,
        path: "assets/logo.png",
      },
    },
  };

  // 3. Write to Firestore
  const docId = `${slug}_v1`;
  await setDoc(doc(db, "templates", docId), data);

  return docId;
}
```

---

## Existing API Endpoints (unchanged)

| Endpoint | Method | What It Returns |
|---|---|---|
| `GET /api/v1/pages` | GET | List of all templates (now reads from Firestore, falls back to filesystem) |
| `GET /api/v1/pages/{page_id}` | GET | Single template details |

**Response schema is unchanged.** Your existing template picker will continue to work.

---

## Firestore Security Rules

Ask the backend team to deploy these:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /templates/{templateId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.auth.token.email.matches('.*@creativefuel\\.io$');
    }
    match /pages/{pageId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.auth.token.email.matches('.*@creativefuel\\.io$');
      allow update, delete: if request.auth != null
        && resource.data.created_by == request.auth.token.email;
    }
  }
}
```

---

## Font Options

| Language | Font Family | Value for `font.family` |
|---|---|---|
| Hindi | NotoSansDevanagari | `"NotoSansDevanagari"` |
| English | NotoSans | `"NotoSans"` |

---

## Checklist Before First Admin-Created Template Goes Live

- [ ] Firebase Web App registered and config values obtained
- [ ] Firebase Auth enabled (Google provider, restrict to @creativefuel.io)
- [ ] Firestore Security Rules deployed
- [ ] GCS CORS configured (if uploading from browser)
- [ ] First template created via admin panel
- [ ] Test render submitted with new `template_ref`
- [ ] Video output verified with correct logo
