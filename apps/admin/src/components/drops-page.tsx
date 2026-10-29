'use client';

import { useEffect, useState } from 'react';
import { PackageSearch, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { listDrops, type Drop } from '../lib/catalog-api';
import { useAdminCatalogApi } from '../lib/admin-catalog-api';
import { ApiError } from '../lib/api-error';
import { toDateTimeInputValue } from '../lib/format';
import { EmptyState, Pill } from './bits';
import { Button } from './ui/button';

const STATUS_TONE = { LIVE: 'success', UPCOMING: 'info', ENDED: 'muted' } as const;

export function DropsPage() {
  const { initialized, authenticated } = useRequireAuth();
  const { keycloak } = useAuth();
  const { createDrop, updateDrop } = useAdminCatalogApi();

  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');

  function resetForm() {
    setEditingId(null);
    setName('');
    setOpensAt('');
    setClosesAt('');
  }

  function startEditing(drop: Drop) {
    setEditingId(drop.id);
    setName(drop.name);
    setOpensAt(toDateTimeInputValue(drop.opensAt));
    setClosesAt(toDateTimeInputValue(drop.closesAt));
    setFormError(null);
  }

  const isAdmin = keycloak?.tokenParsed?.realm_access?.roles?.includes('admin') ?? false;

  function load() {
    listDrops()
      .then(setDrops)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'failed to load drops');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name,
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
      };
      if (editingId) {
        await updateDrop(editingId, payload);
      } else {
        await createDrop(payload);
      }
      resetForm();
      load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : `failed to ${editingId ? 'update' : 'create'} drop`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Drops</h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{editingId ? 'Edit drop' : 'New drop'}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
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
            Opens at
            <input
              required
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            Closes at
            <input
              required
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </label>
        </div>
        {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
        <div className="mt-3 flex gap-2">
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? 'Saving…' : editingId ? 'Update drop' : 'Create drop'}
          </Button>
          {editingId && (
            <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {error && <EmptyState icon={TriangleAlert} title="Couldn't load drops" body={error} />}

      {!error && drops === null && (
        <EmptyState icon={PackageSearch} title="Loading…" body="One moment." />
      )}

      {!error && drops !== null && drops.length === 0 && (
        <EmptyState icon={PackageSearch} title="No drops yet" body="Create the first one above." />
      )}

      {!error && drops !== null && drops.length > 0 && (
        <ul className="space-y-3">
          {drops.map((drop) => (
            <li key={drop.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <p className="font-medium">{drop.name}</p>
                <p className="text-sm text-muted-foreground">
                  {drop.products.length} {drop.products.length === 1 ? 'product' : 'products'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Pill tone={STATUS_TONE[drop.status]}>{drop.status}</Pill>
                <Button size="sm" variant="ghost" onClick={() => startEditing(drop)}>
                  Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
