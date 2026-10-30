'use client';

import { useEffect, useState } from 'react';
import { PackageSearch, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { listProducts, listDrops, type Product, type Drop } from '../lib/catalog-api';
import { useAdminCatalogApi, type UpdateProductInput } from '../lib/admin-catalog-api';
import { ApiError } from '../lib/api-error';
import { EmptyState } from './bits';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

// Same brand yellow as the sidebar logo mark (see components/logo.tsx) — used on the primary
// create/edit actions so they stand out against the neutral admin palette.
const BRAND_BUTTON =
  'bg-[oklch(0.86_0.22_128)] text-[oklch(0.18_0.03_128)] hover:bg-[oklch(0.86_0.22_128)]/90';

export function ProductsPage() {
  const { initialized, authenticated } = useRequireAuth();
  const { keycloak } = useAuth();
  const { createProduct, updateProduct, deleteProduct, getUploadUrl } = useAdminCatalogApi();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [dropId, setDropId] = useState('');

  function resetForm() {
    setEditingId(null);
    setExistingImageUrl(null);
    setName('');
    setDescription('');
    setPrice('');
    setImage(null);
    setDropId('');
  }

  function startEditing(product: Product) {
    setEditingId(product.id);
    setExistingImageUrl(product.imageUrl);
    setName(product.name);
    setDescription(product.description ?? '');
    setPrice((product.priceCents / 100).toFixed(2));
    setImage(null);
    setDropId(product.dropId ?? '');
    setFormError(null);
  }

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
      // A new file always replaces the image; no file chosen means "leave whatever's there" on
      // edit (imageUrl simply isn't in the request) or "no image" on create (unchanged from
      // before).
      const newImageUrl = image ? await uploadImage(image) : undefined;

      if (editingId) {
        const payload: UpdateProductInput = {
          name,
          priceCents,
          description: description.trim() === '' ? null : description,
          dropId: dropId === '' ? null : dropId,
        };
        if (newImageUrl !== undefined) {
          payload.imageUrl = newImageUrl;
        }
        await updateProduct(editingId, payload);
      } else {
        await createProduct({
          name,
          description: description.trim() === '' ? undefined : description,
          priceCents,
          imageUrl: newImageUrl,
          dropId: dropId === '' ? undefined : dropId,
        });
      }
      resetForm();
      load();
    } catch (err) {
      setFormError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : `failed to ${editingId ? 'update' : 'create'} product`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProduct(pendingDeleteId);
      setPendingDeleteId(null);
      if (editingId === pendingDeleteId) {
        resetForm();
      }
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'failed to delete product');
    } finally {
      setDeleting(false);
    }
  }

  const pendingDeleteProduct = products?.find((p) => p.id === pendingDeleteId) ?? null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Products</h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{editingId ? 'Edit product' : 'New product'}</h2>
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
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            {editingId ? 'Replace image (optional)' : 'Image (optional)'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm file:mr-2 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
            />
            {editingId && existingImageUrl && !image && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Current: {existingImageUrl}
              </p>
            )}
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
        <div className="mt-3 flex gap-2">
          <Button type="submit" size="sm" disabled={submitting} className={BRAND_BUTTON}>
            {submitting ? 'Saving…' : editingId ? 'Update product' : 'Create product'}
          </Button>
          {editingId && (
            <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
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
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold">{money(product.priceCents)}</span>
                <Button size="sm" className={BRAND_BUTTON} onClick={() => startEditing(product)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setPendingDeleteId(product.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteProduct
                ? `"${pendingDeleteProduct.name}" will be permanently deleted. This can't be undone.`
                : 'This product will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
