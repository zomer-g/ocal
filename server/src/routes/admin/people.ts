import { Router } from 'express';
import { db } from '../../config/database.js';
import { PersonModel } from '../../models/Person.js';
import { OrganizationModel } from '../../models/Organization.js';

export const adminPeopleRouter = Router();

// GET /api/admin/people — list all people with org join
adminPeopleRouter.get('/', async (_req, res, next) => {
  try {
    const data = await PersonModel.findAll();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/people/search?q= — search people by name
adminPeopleRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) { res.json({ data: [] }); return; }
    const data = await PersonModel.search(q);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/people/:id
adminPeopleRouter.get('/:id', async (req, res, next) => {
  try {
    const person = await PersonModel.findById(req.params.id);
    if (!person) { res.status(404).json({ error: 'Person not found' }); return; }
    res.json(person);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/people — create a person
adminPeopleRouter.post('/', async (req, res, next) => {
  try {
    const { name, wikipedia_link, notes, organization_id } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const person = await PersonModel.create({ name: name.trim(), wikipedia_link, notes, organization_id });
    res.status(201).json(person);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/people/:id — update a person
adminPeopleRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name, wikipedia_link, notes, organization_id } = req.body;
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (wikipedia_link !== undefined) update.wikipedia_link = wikipedia_link;
    if (notes !== undefined) update.notes = notes;
    if (organization_id !== undefined) update.organization_id = organization_id;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    const person = await PersonModel.update(req.params.id, update);
    if (!person) { res.status(404).json({ error: 'Person not found' }); return; }
    res.json(person);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/people/:id
adminPeopleRouter.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await PersonModel.delete(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'Person not found' }); return; }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/people/bulk-import
// Body: { rows: Array<{ name, wikipedia_link?, notes?, organization_name? }> }
adminPeopleRouter.post('/bulk-import', async (req, res, next) => {
  try {
    const rows: Array<{
      name?: string;
      wikipedia_link?: string;
      notes?: string;
      organization_name?: string;
    }> = req.body.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'rows array is required' });
      return;
    }

    // Pre-fetch organizations for name→id resolution
    const allOrgs = await OrganizationModel.findAll();
    const orgByName = new Map<string, string>(
      allOrgs.map((o: { name: string; id: string }) => [o.name.toLowerCase().trim(), o.id])
    );

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const name = (row.name ?? '').trim();
      if (!name) continue;

      // Resolve organization_name → organization_id
      let organization_id: string | undefined;
      if (row.organization_name) {
        const normalized = row.organization_name.toLowerCase().trim();
        organization_id = orgByName.get(normalized) ?? undefined;
        // If org not found, create it automatically
        if (!organization_id) {
          try {
            const newOrg = await OrganizationModel.create({ name: row.organization_name.trim() });
            organization_id = newOrg.id;
            orgByName.set(normalized, newOrg.id);
          } catch {
            // org might have been created by concurrent request — try lookup
            const existing = await db('organizations')
              .whereRaw('LOWER(name) = ?', [normalized])
              .first();
            if (existing) {
              organization_id = existing.id;
              orgByName.set(normalized, existing.id);
            }
          }
        }
      }

      try {
        // Upsert by name (requires unique index idx_people_name_unique from migration 012)
        const [result] = await db('people')
          .insert({
            name,
            wikipedia_link: row.wikipedia_link ?? null,
            notes: row.notes ?? null,
            organization_id: organization_id ?? null,
          })
          .onConflict('name')
          .merge({ wikipedia_link: row.wikipedia_link ?? null, notes: row.notes ?? null, organization_id: organization_id ?? null })
          .returning('*');

        // Knex returns the row on both insert and update; check created_at vs updated_at
        if (result.created_at === result.updated_at) {
          created++;
        } else {
          updated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row "${name}": ${msg}`);
      }
    }

    res.json({ created, updated, errors });
  } catch (err) {
    next(err);
  }
});
