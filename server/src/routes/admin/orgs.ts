import { Router } from 'express';
import { OrganizationModel } from '../../models/Organization.js';

export const adminOrgsRouter = Router();

// GET /api/admin/organizations — list all organizations
adminOrgsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await OrganizationModel.findAll();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/organizations/search?q=
adminOrgsRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) { res.json({ data: [] }); return; }
    const data = await OrganizationModel.search(q);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/organizations/:id
adminOrgsRouter.get('/:id', async (req, res, next) => {
  try {
    const org = await OrganizationModel.findById(req.params.id);
    if (!org) { res.status(404).json({ error: 'Organization not found' }); return; }
    res.json(org);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/organizations — create
adminOrgsRouter.post('/', async (req, res, next) => {
  try {
    const { name, website, description } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const org = await OrganizationModel.create({ name: name.trim(), website, description });
    res.status(201).json(org);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/organizations/:id
adminOrgsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name, website, description } = req.body;
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (website !== undefined) update.website = website;
    if (description !== undefined) update.description = description;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    const org = await OrganizationModel.update(req.params.id, update);
    if (!org) { res.status(404).json({ error: 'Organization not found' }); return; }
    res.json(org);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/organizations/:id
adminOrgsRouter.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await OrganizationModel.delete(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'Organization not found' }); return; }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
