import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

// DELETE /api/admin/reviews/[reviewId] — Admin deletes a guest review
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  try {
    const { reviewId } = await params

    const review = await db.review.findUnique({
      where: { id: reviewId },
      select: { id: true, authorName: true, eventId: true },
    })

    if (!review) {
      return NextResponse.json({ error: 'Review tidak ditemukan' }, { status: 404 })
    }

    await db.review.delete({ where: { id: reviewId } })

    await logActivity(request, 'DELETE_REVIEW', `Menghapus review dari "${review.authorName}"`)

    return NextResponse.json({ message: 'Review berhasil dihapus' })
  } catch (error) {
    console.error('Error deleting review:', error)
    return NextResponse.json(
      { error: 'Gagal menghapus review.' },
      { status: 500 }
    )
  }
}
