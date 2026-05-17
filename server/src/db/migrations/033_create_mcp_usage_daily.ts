import type { Knex } from 'knex';

/**
 * Daily roll-up of mcp_usage_events. Populated by mcpUsageAggregator. Used by
 * the admin dashboard and (eventually) the billing quota middleware to answer
 * "how many calls did this user make this month" without scanning the raw log.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mcp_usage_daily', (t) => {
    t.uuid('api_user_id').notNullable().references('id').inTable('api_users').onDelete('CASCADE');
    t.date('day').notNullable();
    t.integer('tool_calls').notNullable().defaultTo(0);
    t.bigInteger('total_bytes').notNullable().defaultTo(0);
    t.bigInteger('total_latency_ms').notNullable().defaultTo(0);
    t.integer('errors').notNullable().defaultTo(0);
    t.jsonb('tool_breakdown').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.primary(['api_user_id', 'day']);
  });

  await knex.raw('CREATE INDEX idx_mcp_usage_daily_day ON mcp_usage_daily(day DESC)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mcp_usage_daily');
}
