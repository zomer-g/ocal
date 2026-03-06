import type { Knex } from 'knex';

// Default content values seeded on creation
const DEFAULTS: Array<{ key: string; value: string }> = [
  {
    key: 'header',
    value: JSON.stringify({
      siteName: 'יומן לעם',
    }),
  },
  {
    key: 'footer',
    value: JSON.stringify({
      tagline: 'יומן לעם — פלטפורמה לשקיפות ציבורית',
      subtext: 'הנתונים מבוססים על מידע ממאגר הנתונים הפתוח של ישראל',
    }),
  },
  {
    key: 'about',
    value: JSON.stringify({
      title: 'אודות יומן לעם',
      paragraphs: [
        'יומן לעם הוא פלטפורמה ציבורית המאחדת יומני עבודה של נבחרי ציבור וגורמים ממשלתיים בישראל, במטרה לקדם שקיפות ציבורית.',
        'הנתונים מגיעים ממאגר הנתונים הפתוח של ישראל ומוצגים בממשק ידידותי לחיפוש ולוח שנה.',
      ],
      features: [
        'לחפש אירועים ביומני נבחרי ציבור',
        'לצפות בלוח שנה משולב של כל היומנים',
        'לסנן לפי מקור, תאריך, מיקום ומשתתפים',
      ],
      accessibilityNote: 'אתר זה נבנה בהתאם להנחיות נגישות WCAG 2.1 ברמה AA. אם נתקלתם בבעיית נגישות, אנא פנו אלינו.',
    }),
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('site_content', (table) => {
    table.text('key').primary();
    table.text('value').notNullable();
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Seed with defaults
  await knex('site_content').insert(DEFAULTS);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('site_content');
}
