'use client';

import { useEffect, useState } from 'react';
import { PackageSearch, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { listProducts, listDrops, type Product, type Drop } from '../lib/catalog-api';
import { useAdminCatalogApi } from '../lib/admin-catalog-api';
import { ApiError } from '../lib/api-error';
import { EmptyState } from './bits';
import { Button } from './ui/button';

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function ProductsPage() {
  const { initialized, authenticated } = useRequireAuth();
  const { keycloak } = useAuth();
  const { createProduct, getUploadUrl } = useAdminCatalogApi();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [dropId, setDropId] = useState('');

  const isAdmin = keycloak?.tokenParsed?.realm_access?.roles?.includes('admin') ?? false;

  function load() {
    listProducts()
      .then(setProducts)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'failed to load products');
      });
    listDrops()
      .then(setDrops)
      .catch(() => {
        // The dropId picker just stays empty if this fails — not worth a separate error state
        // for a secondary list on this page.
      });
  }

  useEffect(() => {
    if (!authenticated || !isAdmin) {
      return;
    }
    load();
     
  }, [authenticated, isAdmin]);

  if (!initialized || !authenticated) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
        Redirecting…
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access"
          body="This account doesn't have the admin role. Sign in with an admin account."
        />
      </section>
    );
  }

  async function uploadImage(file: File): Promise<string> {
    const { uploadUrl, publicUrl } = await getUploadUrl(file.name, file.type);
    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!putResponse.ok) {
      // Most likely cause right now: the bucket doesn't exist yet, or its CORS policy
      // doesn't allow PUT from this origin — both are on the AWS side, not fixable here.
      throw new Error(`upload to S3 failed with status ${putResponse.status}`);
    }
    return publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const priceCents = Math.round(Number(price) * 100);
      const imageUrl = image ? await uploadImage(image) : undefined;
      await createProduct({
        name,
        description: description.trim() === '' ? undefined : description,
        priceCents,
        imageUrl,
        dropId: dropId === '' ? undefined : dropId,
      });
      setName('');
      setDescription('');
      setPrice('');
      setImage(null);
      setDropId('');
      load();
    } catch (err) {
      setFormError(
        err instanceof ApiError || err instanceof Error ? err.message : 'failed to create product',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Products</h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">New product</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            Price (USD)
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Description (optional)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            Image (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm file:mr-2 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
            />
          </label>
          <label className="text-sm">
            Drop (optional)
            <select
              value={dropId}
              onChange={(e) => setDropId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">Unassigned</option>
              {drops.map((drop) => (
                <option key={drop.id} value={drop.id}>
                  {drop.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
        <Button type="submit" size="sm" className="mt-3" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create product'}
        </Button>
      </form>

      {error && <EmptyState icon={TriangleAlert} title="Couldn't load products" body={error} />}

      {!error && products === null && (
        <EmptyState icon={PackageSearch} title="Loading…" body="One moment." />
      )}

      {!error && products !== null && products.length === 0 && (
        <EmptyState
          icon={PackageSearch}
          title="No products yet"
          body="Create the first one above."
        />
      )}

      {!error && products !== null && products.length > 0 && (
        <ul className="space-y-3">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex items-center justify-between rounded-xl border bg-card p-4"
            >
              <div>
                <p className="font-medium">{product.name}</p>
                {product.description && (
                  <p className="text-sm text-muted-foreground">{product.description}</p>
                )}
              </div>
              <span className="font-mono text-sm font-semibold">{money(product.priceCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
