import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

// DELETE /api/admin/short-links/[id] — Delete a short link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const shortLink = await db.shortLink.findUnique({
      where: { id },
      include: { event: { select: { title: true } } },
    })

    if (!shortLink) {
      return NextResponse.json(
        { error: 'Short link tidak ditemukan' },
        { status: 404 }
      )
    }

    await db.shortLink.delete({ where: { id } })

    await logActivity(request, 'DELETE_SHORT_LINK', `Menghapus short link "/${shortLink.slug}" dari event "${shortLink.event.title}"`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting short link:', error)
    return NextResponse.json(
      { error: 'Failed to delete short link' },
      { status: 500 }
    )
  }
}
