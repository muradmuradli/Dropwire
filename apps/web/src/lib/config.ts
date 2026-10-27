// No 'use client' here deliberately — this needs to be importable from server components
// (catalog-api.ts's plain functions run server-side too) as well as client ones. Exporting a
// plain constant from a 'use client' file (as this used to live in api-client.ts) breaks for a
// server-component importer: Next's RSC bundler proxies *every* export of a client module into
// a client-only reference, even a plain string, regardless of whether it's actually a function.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
