import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-log'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: 'Logout berhasil' })
  response.cookies.set('admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  response.cookies.set('admin_role', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  await logActivity(request, 'LOGOUT', 'Logout dari sistem')
  return response
}
