import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { validateSessionToken } from '@/lib/auth'

export interface AdminIdentity {
  adminId: string
  adminName: string
  ipAddress: string | null
}

/**
 * Extract admin identity from the request.
 * Priority: x-admin-id/x-admin-name headers > session cookie lookup
 */
export async function getAdminFromRequest(request: NextRequest): Promise<AdminIdentity> {
  let adminId = 'system'
  let adminName = 'System'

  // Try headers first (set by frontend from localStorage)
  const authHeader = request.headers.get('x-admin-id')
  const authNameHeader = request.headers.get('x-admin-name')
  if (authHeader) adminId = authHeader
  if (authNameHeader) adminName = decodeURIComponent(authNameHeader)

  // If no header, try session cookie
  if (adminId === 'system') {
    const token = request.cookies.get('admin_session')?.value
    if (token) {
      const result = validateSessionToken(token)
      if (result.valid && result.username) {
        try {
          const admin = await db.admin.findFirst({
            where: { username: result.username },
            select: { id: true, name: true, username: true },
          })
          if (admin) {
            adminId = admin.id
            adminName = admin.name || admin.username
          }
        } catch {}
      }
    }
  }

  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null

  return { adminId, adminName, ipAddress }
}

/**
 * Create an activity log entry.
 * Silently catches errors to never break the main operation.
 */
export async function logActivity(
  request: NextRequest,
  action: string,
  details: string
): Promise<void> {
  try {
    const { adminId, adminName, ipAddress } = await getAdminFromRequest(request)
    await db.activityLog.create({
      data: { adminId, adminName, action, details, ipAddress },
    })
  } catch (error) {
    console.error('[ActivityLog] Failed to log:', error)
  }
}
