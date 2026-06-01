import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Separate queries — NO include (crashes Next.js 16)
    const [event, priceCategories, seats, transactions, showDates] = await withDbRetry(() =>
      Promise.all([
        db.event.findUnique({ where: { id } }),
        db.priceCategory.findMany({ where: { eventId: id } }),
        db.seat.findMany({ where: { eventId: id } }),
        db.transaction.findMany({
          where: { eventId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        db.eventShowDate.findMany({
          where: { eventId: id },
          orderBy: { date: 'asc' },
        }),
      ])
    )

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Attach priceCategory to each seat
    const seatsWithCat = seats.map((seat) => {
      const cat = priceCategories.find((pc) => pc.id === seat.priceCategoryId) || null
      return { ...seat, priceCategory: cat }
    })

    return NextResponse.json({
      event: { ...event, priceCategories, seats: seatsWithCat, transactions, showDates },
    })
  } catch (error) {
    console.error('Error fetching admin event:', error)
    return NextResponse.json(
      { error: 'Failed to fetch event' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      title,
      category,
      showDate,
      openGate,
      location,
      posterUrl,
      synopsis,
      isPublished,
      isCompleted,
      adminFee,
      adminFeeQris,
      adminFeeNonQris,
      priceCategories,
      showDates,
      teaserVideoUrl,
      layoutImage,
      gaZoneConfig,
      seatType,
      castData,
      reviewsData,
      hideSeatAvailability,
      hideSoldCount,
    } = body

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Determine effective showDate (earliest from showDates, or provided showDate)
    let effectiveShowDate = showDate ? new Date(showDate) : event.showDate
    let effectiveOpenGate = openGate ? new Date(openGate) : event.openGate

    if (showDates && Array.isArray(showDates) && showDates.length > 0) {
      const sorted = [...showDates].sort(
        (a: { date: string }, b: { date: string }) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      effectiveShowDate = new Date(sorted[0].date)
      if (sorted[0].openGate) {
        effectiveOpenGate = new Date(sorted[0].openGate)
      }
    }

    await db.event.update({
      where: { id },
      data: {
        title: title ?? event.title,
        category: category ?? event.category,
        showDate: effectiveShowDate,
        openGate: effectiveOpenGate,
        location: location ?? event.location,
        posterUrl: posterUrl !== undefined ? posterUrl : event.posterUrl,
        teaserVideoUrl: teaserVideoUrl !== undefined ? teaserVideoUrl : event.teaserVideoUrl,
        synopsis: synopsis ?? event.synopsis,
        isPublished: isPublished !== undefined ? isPublished : event.isPublished,
        isCompleted: isCompleted !== undefined ? isCompleted : event.isCompleted,
        adminFee: adminFee !== undefined ? adminFee : event.adminFee,
        adminFeeQris: adminFeeQris !== undefined ? adminFeeQris : event.adminFeeQris,
        adminFeeNonQris: adminFeeNonQris !== undefined ? adminFeeNonQris : event.adminFeeNonQris,
        layoutImage: layoutImage !== undefined ? layoutImage : event.layoutImage,
        gaZoneConfig: gaZoneConfig !== undefined ? gaZoneConfig : event.gaZoneConfig,
        seatType: seatType !== undefined ? seatType : event.seatType,
        castData: castData !== undefined ? castData : event.castData,
        reviewsData: reviewsData !== undefined ? reviewsData : event.reviewsData,
        hideSeatAvailability: hideSeatAvailability !== undefined ? hideSeatAvailability : event.hideSeatAvailability,
        hideSoldCount: hideSoldCount !== undefined ? hideSoldCount : event.hideSoldCount,
      },
    })

    // Update price categories if provided — UPSERT strategy (safe when seats exist)
    // We match by name to preserve existing IDs that seats reference.
    if (priceCategories && Array.isArray(priceCategories)) {
      const existingCats = await db.priceCategory.findMany({ where: { eventId: id } })
      const existingByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]))
      const incomingNames = new Set(
        priceCategories.map((pc: { name: string }) => pc.name?.toLowerCase()).filter(Boolean)
      )

      // 1. Update existing categories (matched by name, preserve ID)
      for (const pc of priceCategories as Array<{ name: string; price: number; colorCode: string }>) {
        const existing = existingByName.get(pc.name.toLowerCase())
        if (existing) {
          await db.priceCategory.update({
            where: { id: existing.id },
            data: { price: pc.price, colorCode: pc.colorCode },
          })
        } else {
          await db.priceCategory.create({
            data: { eventId: id, name: pc.name, price: pc.price, colorCode: pc.colorCode },
          })
        }
      }

      // 2. Delete removed categories — only if no seats reference them
      const toDeleteCats = existingCats.filter((c) => !incomingNames.has(c.name.toLowerCase()))
      for (const cat of toDeleteCats) {
        const refCount = await db.seat.count({ where: { priceCategoryId: cat.id } })
        if (refCount > 0) {
          // Cannot delete — seats still reference this category.
          // Keep it as-is (it will become orphaned but harmless).
          // Admin can manage it from the seat editor.
          continue
        }
        await db.priceCategory.delete({ where: { id: cat.id } })
      }
    }

    // Update show dates if provided — UPSERT strategy (never cascade-delete existing seats!)
    // 1. Fetch existing show dates
    const existingShowDates = await db.eventShowDate.findMany({ where: { eventId: id } })
    const existingIds = new Set(existingShowDates.map((sd) => sd.id))
    const incomingIds = new Set(
      (showDates as Array<{ id?: string; date: string; openGate?: string; label?: string }>)
        ?.filter((sd) => sd.id)
        .map((sd) => sd.id!)
    )

    // 2. Delete only removed show dates (ones that exist in DB but not in incoming)
    const toDelete = existingShowDates.filter((sd) => !incomingIds.has(sd.id))
    for (const sd of toDelete) {
      // Check if this show date has sold seats — prevent deletion if so
      const soldCount = await db.seat.count({
        where: { eventShowDateId: sd.id, status: 'SOLD' },
      })
      if (soldCount > 0) {
        return NextResponse.json({
          error: `Tidak bisa menghapus tanggal "${sd.label || new Date(sd.date).toLocaleDateString('id-ID')}". Masih ada ${soldCount} kursi terjual.`,
        }, { status: 409 })
      }
    }
    if (toDelete.length > 0) {
      await db.eventShowDate.deleteMany({
        where: { id: { in: toDelete.map((sd) => sd.id) } },
      })
    }

    // 3. Update existing + create new
    if (showDates && Array.isArray(showDates) && showDates.length > 0) {
      for (const sd of showDates as Array<{ id?: string; date: string; openGate?: string; label?: string }>) {
        if (sd.id && existingIds.has(sd.id)) {
          // Update existing
          await db.eventShowDate.update({
            where: { id: sd.id },
            data: {
              date: new Date(sd.date),
              openGate: sd.openGate ? new Date(sd.openGate) : null,
              label: sd.label || null,
            },
          })
        } else {
          // Create new
          await db.eventShowDate.create({
            data: {
              eventId: id,
              date: new Date(sd.date),
              openGate: sd.openGate ? new Date(sd.openGate) : null,
              label: sd.label || null,
            },
          })
        }
      }
    }

    // Re-fetch separately — NO include
    const updatedEvent = await db.event.findUnique({ where: { id } })
    const updatedPriceCats = await db.priceCategory.findMany({ where: { eventId: id } })
    const updatedShowDates = await db.eventShowDate.findMany({
      where: { eventId: id },
      orderBy: { date: 'asc' },
    })

    // Log specific changes
    const logDetails: string[] = []
    if (title && title !== event.title) logDetails.push(`judul: "${event.title}" → "${title}"`)
    if (isPublished !== undefined && isPublished !== event.isPublished) {
      logDetails.push(isPublished ? 'dipublish' : 'di-unpublish')
    }
    if (isCompleted !== undefined && isCompleted !== event.isCompleted) {
      logDetails.push(isCompleted ? 'ditandai selesai' : 'dibuka kembali')
    }
    if (location && location !== event.location) logDetails.push(`lokasi diubah`)
    if (synopsis && synopsis !== event.synopsis) logDetails.push(`sinopsis diubah`)
    await logActivity(request, 'UPDATE_EVENT', `Event "${event.title}": ${logDetails.length > 0 ? logDetails.join(', ') : 'diperbarui'}`)

    return NextResponse.json({
      event: { ...updatedEvent, priceCategories: updatedPriceCats, showDates: updatedShowDates },
    })
  } catch (error) {
    console.error('Error updating event:', error)
    return NextResponse.json(
      { error: 'Failed to update event' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    await logActivity(request, 'DELETE_EVENT', `Menghapus event "${event.title}" beserta semua data terkait`)
    await db.transaction.deleteMany({ where: { eventId: id } })
    await db.seat.deleteMany({ where: { eventId: id } })
    await db.priceCategory.deleteMany({ where: { eventId: id } })
    await db.eventShowDate.deleteMany({ where: { eventId: id } })
    await db.event.delete({ where: { id } })

    return NextResponse.json({ message: 'Event deleted successfully' })
  } catch (error) {
    console.error('Error deleting event:', error)
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    )
  }
}
