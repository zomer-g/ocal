import type { Knex } from 'knex';

/**
 * MK constituent-contact expenses (הוצאות קשר עם הציבור) — separate
 * tables, NOT a discriminator on diary_events.
 *
 * Two tables:
 *   - mk_expense_imports: one row per uploaded xlsx file (audit + bulk-undo)
 *   - mk_expenses: one row per expense line item, links to import + person
 *
 * Schema is intentionally narrow: MK name, date (no time — these aren't
 * scheduled events), category, vendor, amount, optional notes/credit/receipt.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mk_expense_imports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('uploaded_by').references('id').inTable('admin_users').onDelete('SET NULL');
    t.text('filename').notNullable();
    t.text('file_hash').notNullable().unique(); // sha256 hex; rejects re-import of identical file
    t.integer('source_year').notNullable();
    t.integer('total_rows').notNullable();
    t.integer('rows_inserted').notNullable();
    t.integer('mks_matched').notNullable();
    t.integer('mks_created').notNullable();
    t.jsonb('warnings').notNullable().defaultTo(knex.raw(`'[]'::jsonb`));
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('mk_expenses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('import_id').notNullable().references('id').inTable('mk_expense_imports').onDelete('CASCADE');
    t.uuid('person_id').references('id').inTable('people').onDelete('SET NULL');

    t.text('mk_name_raw').notNullable(); // verbatim from שם חבר הכנסת — audit trail
    t.date('expense_date').notNullable();
    t.text('category').notNullable();
    t.text('vendor');
    t.decimal('amount', 12, 2).notNullable(); // negatives for refunds / corrections
    t.text('currency').notNullable().defaultTo('ILS');
    t.text('notes');
    t.text('credit');
    t.text('receipt_url'); // אסמכתאות — always NULL in v1; ready for future

    t.integer('source_year').notNullable();
    t.integer('source_row_index').notNullable(); // 1-based row in xlsx for traceability

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['import_id', 'source_row_index']);
    t.index('expense_date', 'idx_mk_expenses_date');
    t.index(['person_id', 'expense_date'], 'idx_mk_expenses_person_date');
    t.index('category', 'idx_mk_expenses_category');
    t.index('source_year', 'idx_mk_expenses_year');
  });

  // Reuse the project-wide updated_at trigger function created in migration 010
  await knex.raw(`
    CREATE TRIGGER trg_updated_at BEFORE UPDATE ON mk_expenses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS trg_updated_at ON mk_expenses');
  await knex.schema.dropTableIfExists('mk_expenses');
  await knex.schema.dropTableIfExists('mk_expense_imports');
}
