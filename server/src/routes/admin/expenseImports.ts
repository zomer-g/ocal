/**
 * Admin endpoints for MK expense ledger imports.
 *
 *   POST   /api/admin/expense-imports/preview   — parse + match (no DB writes)
 *   POST   /api/admin/expense-imports           — full commit
 *   GET    /api/admin/expense-imports           — history
 *   GET    /api/admin/expense-imports/:id       — single import + first 100 rows
 *   DELETE /api/admin/expense-imports/:id       — undo (cascade deletes rows)
 */

import { Router } from 'express';
import multer from 'multer';
import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import {
  previewImport,
  commitImport,
  UnsupportedSchemaError,
} from '../../services/expenseImporter.js';

export const adminExpenseImportsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — Knesset 2025 file is ~5 MB
});

// ──────────────────────────────────────────────
// POST /preview — dry-run
// ──────────────────────────────────────────────
adminExpenseImportsRouter.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'יש לצרף קובץ xlsx (שדה "file")' });
      return;
    }
    try {
      const result = await previewImport(file.buffer);
      res.json(result);
    } catch (err) {
      if (err instanceof UnsupportedSchemaError) {
        res.status(422).json({ error: err.message });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// POST / — full commit
// ──────────────────────────────────────────────
adminExpenseImportsRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'יש לצרף קובץ xlsx (שדה "file")' });
      return;
    }
    // Decode latin1 → utf8 to preserve Hebrew characters in filename (multer
    // mangles non-ASCII otherwise; same fix as in manual PDF uploads).
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');

    try {
      const result = await commitImport(file.buffer, filename, req.adminUser?.id ?? null);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof UnsupportedSchemaError) {
        res.status(422).json({ error: err.message });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      // Hash conflict (re-import) is a 409 not a 500
      if (msg.includes('כבר נטען בעבר')) {
        res.status(409).json({ error: msg });
        return;
      }
      logger.error({ err }, 'Expense import failed');
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// GET / — list past imports
// ──────────────────────────────────────────────
adminExpenseImportsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db('mk_expense_imports as i')
      .leftJoin('admin_users as u', 'u.id', 'i.uploaded_by')
      .select(
        'i.id', 'i.filename', 'i.source_year', 'i.total_rows', 'i.rows_inserted',
        'i.mks_matched', 'i.mks_created', 'i.warnings', 'i.created_at',
        'u.email as uploaded_by_email',
      )
      .orderBy('i.created_at', 'desc');
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// GET /:id — single import + first 100 rows
// ──────────────────────────────────────────────
adminExpenseImportsRouter.get('/:id', async (req, res, next) => {
  try {
    const importRow = await db('mk_expense_imports').where({ id: req.params.id }).first();
    if (!importRow) {
      res.status(404).json({ error: 'Import not found' });
      return;
    }
    const sampleRows = await db('mk_expenses as e')
      .leftJoin('people as p', 'p.id', 'e.person_id')
      .where('e.import_id', req.params.id)
      .select(
        'e.id', 'e.expense_date', 'e.category', 'e.vendor', 'e.amount',
        'e.mk_name_raw', 'e.source_row_index',
        'p.name as person_name', 'p.id as person_id',
      )
      .orderBy('e.source_row_index', 'asc')
      .limit(100);
    res.json({ import: importRow, sample_rows: sampleRows });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// DELETE /:id — cascade deletes mk_expenses rows
// ──────────────────────────────────────────────
adminExpenseImportsRouter.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db('mk_expense_imports').where({ id: req.params.id }).del();
    if (!deleted) {
      res.status(404).json({ error: 'Import not found' });
      return;
    }
    // ON DELETE CASCADE on mk_expenses removes the line items automatically.
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
