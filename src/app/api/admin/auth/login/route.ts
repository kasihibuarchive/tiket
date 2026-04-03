import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSessionToken, validateSessionToken } from '@/lib/auth'
import { db } from '@/lib/db'

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

    const admin = await db.admin.findFirst({
      where: { username },
      select: { id: true, username: true, password: true, name: true, role: true },
    })

    if (!admin) {
      return NextResponse.json(
        { error: 'Username atau password salah' },
        { status: 401 }
      )
    }

    if (!verifyPassword(password, admin.password)) {
      return NextResponse.json(
        { error: 'Username atau password salah' },
        { status: 401 }
      )
    }

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

    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    // Set role cookie (non-httpOnly so middleware can read it)
    response.cookies.set('admin_role', admin.role || 'admin', {
      httpOnly: false,
      secure: false,
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
