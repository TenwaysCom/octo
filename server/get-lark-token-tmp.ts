import { config } from 'dotenv';
config();
import { getSharedDatabase } from './src/adapters/postgres/database.js';

(async () => {
  const db = getSharedDatabase();
  const row = await db.selectFrom('user_tokens')
    .select(['user_token', 'base_url'])
    .where('provider', '=', 'lark')
    .orderBy('updated_at', 'desc')
    .executeTakeFirst();
  console.log(JSON.stringify(row ?? null));
  process.exit(0);
})();
