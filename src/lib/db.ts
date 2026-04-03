import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Use explicit Supabase pooler URL to avoid system env override
const DATABASE_URL = process.env.DATABASE_URL?.startsWith('postgresql')
  ? process.env.DATABASE_URL
  : 'postgresql://postgres.lpdujkpjkcpyiptzyeml:SXcu1zaz1sYqki3R@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
