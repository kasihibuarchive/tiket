import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSessionToken, validateSessionToken, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'

// Auto-seed: ensure default admin accounts exist
async function ensureAdminExists() {
  try {
    const existingAdmin = await db.admin.findFirst({ where: { username: 'admin' } })
    if (!existingAdmin) {
      const hashedPw = hashPassword('admin123')
      await db.admin.create({
        data: {
          username: 'admin',
          password: hashedPw,
          name: 'Administrator',
          role: 'admin',
        },
      })
      console.log('[auth] Auto-seeded default admin account (admin/admin123)')
    }

    const existingTripay = await db.admin.findFirst({ where: { username: 'tripayadmin' } })
    if (!existingTripay) {
      const hashedPw = hashPassword('admin3pay')
      await db.admin.create({
        data: {
          username: 'tripayadmin',
          password: hashedPw,
          name: 'Tripay Admin',
          role: 'admin',
        },
      })
      console.log('[auth] Auto-seeded tripayadmin account (tripayadmin/admin3pay)')
    }
  } catch (e) {
    console.error('[auth] Auto-seed failed:', e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username dan password harus diisi' },
        { status: 400 }
      )
    }

    // Ensure admin account exists before checking credentials
    await ensureAdminExists()

    const admin = await db.admin.findFirst({
      where: { username },
      select: { id: true, username: true, password: true, name: true, role: true, isActive: true },
    })

    if (!admin) {
      return NextResponse.json(
        { error: 'Username atau password salah' },
        { status: 401 }
      )
    }

    // Check if account is disabled
    if (admin.isActive === false) {
      return NextResponse.json(
        { error: 'Akun dinonaktifkan. Hubungi admin untuk informasi lebih lanjut.' },
        { status: 403 }
      )
    }

    if (!verifyPassword(password, admin.password)) {
      return NextResponse.json(
        { error: 'Username atau password salah' },
        { status: 401 }
      )
    }

    // Log login activity
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') || null
    try {
      await db.activityLog.create({
        data: {
          adminId: admin.id,
          adminName: admin.name || admin.username,
          action: 'LOGIN',
          details: `Login sebagai ${admin.role}`,
          ipAddress: clientIp,
        },
      })
    } catch {}

    const token = createSessionToken(admin.username)

    const response = NextResponse.json({
      message: 'Login berhasil',
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    })

    const isProduction = process.env.NODE_ENV === 'production'
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    // Set role cookie (non-httpOnly so middleware can read it)
    response.cookies.set('admin_role', admin.role || 'admin', {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan' },
      { status: 500 }
    )
  }
}

// GET - check auth status
export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const result = validateSessionToken(token)

  if (!result.valid) {
    // Token invalid (possibly APP_SECRET changed after server restart)
    // Try to auto-recreate session if the admin account still exists
    try {
      await ensureAdminExists()
      const admin = await db.admin.findFirst({
        where: { username: result.username },
        select: { id: true, username: true, name: true, role: true },
      })
      if (admin) {
        // Re-issue a valid session token
        const newToken = createSessionToken(admin.username)
        const response = NextResponse.json({
          authenticated: true,
          admin: {
            id: admin.id,
            username: admin.username,
            name: admin.name,
            role: admin.role,
          },
        })
        const isProd = process.env.NODE_ENV === 'production'
        response.cookies.set('admin_session', newToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          maxAge: 24 * 60 * 60,
          path: '/',
        })
        response.cookies.set('admin_role', admin.role || 'admin', {
          httpOnly: false,
          secure: isProd,
          sameSite: 'lax',
          maxAge: 24 * 60 * 60,
          path: '/',
        })
        return response
      }
    } catch {
      // ignore, fall through to 401
    }
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  try {
    const admin = await db.admin.findFirst({
      where: { username: result.username },
      select: { id: true, username: true, name: true, role: true },
    })

    if (!admin) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
