// Force correct DATABASE_URL before anything loads
// Use port 6543 (Transaction Pooler) for connection pooling — NOT port 5432 (direct)
if (!process.env.DATABASE_URL?.startsWith('postgresql')) {
  process.env.DATABASE_URL = 'postgresql://postgres.lpdujkpjkcpyiptzyeml:SXcu1zaz1sYqki3R@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres'
}

export async function register() {
  // Next.js instrumentation hook
}
