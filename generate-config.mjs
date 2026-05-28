import { writeFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY environment variables.');
  process.exit(1);
}

const contents = `export const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};
`;

writeFileSync(new URL('./config.js', import.meta.url), contents);
console.log('Wrote config.js');
