This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## WebSocket Configuration

The frontend owns WebSocket URL construction. Configure via environment variables:

| Variable              | Description               | Default                 |
| --------------------- | ------------------------- | ----------------------- |
| `NEXT_PUBLIC_WS_URL`  | WebSocket server base URL | `ws://localhost:8000`   |
| `NEXT_PUBLIC_API_URL` | REST API base URL         | `http://localhost:8000` |

**Important:**

- For production (`https://` pages), `NEXT_PUBLIC_WS_URL` must use `wss://`
- The `ws_url` field in API job responses is **informational/deprecated** — the frontend does not consume it

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## GitHub Actions

This repo includes:

- `.github/workflows/ci.yml`: runs `npm ci`, `npm run lint`, and `npm run build` on PRs and pushes to `main`
- `.github/workflows/cd-cloud-run.yml`: deploys to Cloud Run on pushes to `main` (and supports manual trigger)

Set these in GitHub before enabling CD:

Secrets:

- `GCP_SA_KEY`: service account JSON key used by GitHub Actions

Variables:

- `GCP_PROJECT_ID` (example: `seone-platform`)
- `GCP_REGION` (example: `asia-south1`)
- `GCP_SERVICE_NAME` (example: `seone-frontend`)
- `NEXT_PUBLIC_API_URL` (example: `https://seone-api-778704547114.asia-south1.run.app`)
- `NEXT_PUBLIC_WS_URL` (example: `wss://seone-api-778704547114.asia-south1.run.app`)
- `NEXT_PUBLIC_DATA_URL` (example: `https://seone-api-778704547114.asia-south1.run.app/data`)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`

Service account roles typically required for Cloud Run source deploy:

- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/cloudbuild.builds.editor`
- `roles/artifactregistry.writer`
