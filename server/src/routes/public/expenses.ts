/**
 * Public read endpoints for MK constituent-contact expenses.
 * Mirrors the shape of /api/public/events but with expense-specific fields.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination.js';
import { validate } from '../../middleware/validate.js';

export const expensesRouter = Router();

const searchSchema = z.object({
  q: z.string().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  person_ids: z.string().optional(),     // comma-separated UUIDs
  category: z.string().optional(),
  page: z.coerce.number().optional(),
  per_page: z.coerce.number().optional(),
  sort: z.enum(['date_asc', 'date_desc', 'amount_desc', 'amount_asc']).optional(),
});

// GET /api/public/expenses
expensesRouter.get('/', validate(searchSchema, 'query'), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof searchSchema>;
    const { page, per_page, offset } = parsePagination(q);
    const personIds = q.person_ids ? q.person_ids.split(',').filter(Boolean) : undefined;

    let query = db('mk_expenses as e')
      .leftJoin('people as p', 'p.id', 'e.person_id');

    if (q.q) {
      const like = `%${q.q}%`;
      query = query.where((b) => {
        b.whereILike('e.category', like)
          .orWhereILike('e.vendor', like)
          .orWhereILike('e.notes', like)
          .orWhereILike('e.mk_name_raw', like);
      });
    }
    if (q.from_date) query = query.where('e.expense_date', '>=', q.from_date);
    if (q.to_date)   query = query.where('e.expense_date', '<=', q.to_date);
    if (q.category)  query = query.where('e.category', q.category);
    if (personIds?.length) query = query.whereIn('e.person_id', personIds);

    const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();

    const sort = q.sort ?? 'date_desc';
    if (sort === 'date_asc')         query = query.orderBy('e.expense_date', 'asc');
    else if (sort === 'date_desc')   query = query.orderBy('e.expense_date', 'desc');
    else if (sort === 'amount_desc') query = query.orderBy('e.amount', 'desc');
    else if (sort === 'amount_asc')  query = query.orderBy('e.amount', 'asc');

    query = query
      .select(
        'e.id', 'e.expense_date', 'e.category', 'e.vendor', 'e.amount', 'e.currency',
        'e.notes', 'e.credit', 'e.receipt_url',
        'e.mk_name_raw', 'e.source_year', 'e.source_row_index',
        'p.id as person_id', 'p.name as person_name',
      )
      .offset(offset)
      .limit(per_page);

    const [rows, countResult] = await Promise.all([query, countQuery]);
    res.json({
      data: rows,
      pagination: buildPaginationMeta(page, per_page, Number(countResult?.total ?? 0)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/expenses/categories — distinct categories with counts
expensesRouter.get('/categories', async (_req, res, next) => {
  try {
    const rows = await db('mk_expenses')
      .select('category')
      .count('* as count')
      .groupBy('category')
      .orderBy('count', 'desc');
    res.json({ data: rows.map((r) => ({ category: r.category, count: Number(r.count) })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/expenses/summary — per-day per-person aggregates for calendar overlay
const summarySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  person_ids: z.string().optional(),
});

expensesRouter.get('/summary', validate(summarySchema, 'query'), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof summarySchema>;
    const personIds = q.person_ids ? q.person_ids.split(',').filter(Boolean) : undefined;

    let query = db('mk_expenses as e')
      .leftJoin('people as p', 'p.id', 'e.person_id')
      .where('e.expense_date', '>=', q.from_date)
      .where('e.expense_date', '<=', q.to_date)
      .select('e.expense_date', 'e.person_id', 'p.name as person_name')
      .count('* as count')
      .sum('e.amount as total_amount')
      .groupBy('e.expense_date', 'e.person_id', 'p.name')
      .orderBy('e.expense_date', 'asc');

    if (personIds?.length) query = query.whereIn('e.person_id', personIds);

    const rows = (await query) as Array<{
      expense_date: string | Date;
      person_id: string | null;
      person_name: string | null;
      count: string | number;
      total_amount: string | number | null;
    }>;
    res.json({
      data: rows.map((r) => ({
        expense_date:
          typeof r.expense_date === 'string'
            ? r.expense_date
            : new Date(r.expense_date as Date).toISOString().slice(0, 10),
        person_id: r.person_id,
        person_name: r.person_name,
        count: Number(r.count),
        total_amount: Number(r.total_amount ?? 0),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/expenses/:id
expensesRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await db('mk_expenses as e')
      .leftJoin('people as p', 'p.id', 'e.person_id')
      .leftJoin('mk_expense_imports as i', 'i.id', 'e.import_id')
      .select(
        'e.*',
        'p.name as person_name',
        'i.filename as import_filename',
        'i.created_at as imported_at',
      )
      .where('e.id', req.params.id)
      .first();
    if (!row) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});
