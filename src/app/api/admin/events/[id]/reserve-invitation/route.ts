import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

// POST — Reserve GA slots for invitations (marks seats as INVITATION)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { zoneName, quantity, showDateId } = body

    if (!zoneName || !quantity || quantity < 1) {
      return NextResponse.json({ error: 'Zone dan jumlah harus diisi' }, { status: 400 })
    }

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 })
    }

    // Determine if this is a multi-day event
    const showDates = await db.eventShowDate.findMany({
      where: { eventId: id },
      orderBy: { date: 'asc' },
    })

    const targetShowDateIds = showDateId
      ? [showDateId]
      : showDates.length > 0
        ? showDates.map(sd => sd.id)
        : [null]

    let totalReserved = 0

    for (const sdId of targetShowDateIds) {
      // Find existing seats in this zone
      const existingSeats = await db.seat.findMany({
        where: {
          eventId: id,
          zoneName,
          ...(sdId ? { eventShowDateId: sdId } : {}),
        },
        orderBy: { col: 'asc' },
      })

      const availableSeats = existingSeats.filter(s => s.status === 'AVAILABLE')

      // Calculate remaining capacity from zone config
      let zoneCapacity = 0
      try {
        if (event.gaZoneConfig) {
          const zones = JSON.parse(event.gaZoneConfig)
          const zone = zones.find((z: any) => z.name === zoneName)
          if (zone) zoneCapacity = zone.capacity || 0
        }
      } catch {}

      // Also check seat map layout for capacity
      if (zoneCapacity === 0 && event.seatMapId) {
        const seatMap = await db.seatMap.findUnique({ where: { id: event.seatMapId } })
        if (seatMap?.layoutData) {
          try {
            const layout = typeof seatMap.layoutData === 'string'
              ? JSON.parse(seatMap.layoutData)
              : seatMap.layoutData
            const zones = layout.zones || []
            const zone = zones.find((z: any) => z.name === zoneName)
            if (zone) zoneCapacity = zone.capacity || zone.rows * zone.cols || 0
          } catch {}
        }
      }

      // How many seats we need to reserve
      const toReserveFromExisting = Math.min(quantity, availableSeats.length)
      const toCreate = Math.max(0, quantity - availableSeats.length)

      // Validate: don't exceed zone capacity
      if (zoneCapacity > 0) {
        const totalAfterReserve = existingSeats.length + toCreate
        if (totalAfterReserve > zoneCapacity) {
          return NextResponse.json({
            error: `Tidak bisa reservi ${quantity} kursi. Zona "${zoneName}" kapasitas ${zoneCapacity}, sudah ada ${existingSeats.length} kursi. Maksimal reservi ${Math.max(0, zoneCapacity - existingSeats.length)} kursi lagi.`,
          }, { status: 400 })
        }
      }

      // Step 1: Mark available seats as INVITATION
      if (toReserveFromExisting > 0) {
        const seatsToMark = availableSeats.slice(0, toReserveFromExisting)
        await db.seat.updateMany({
          where: {
            id: { in: seatsToMark.map(s => s.id) },
          },
          data: {
            status: 'INVITATION',
            lockedUntil: null,
            lockedBy: null,
          },
        })
        totalReserved += toReserveFromExisting
      }

      // Step 2: Create new seats as INVITATION (if needed)
      if (toCreate > 0) {
        // Find the max col number to continue numbering
        const maxCol = existingSeats.length > 0
          ? Math.max(...existingSeats.map(s => s.col))
          : 0

        const priceCatId = existingSeats.find(s => s.priceCategoryId)?.priceCategoryId || null

        const newSeats = []
        for (let i = 1; i <= toCreate; i++) {
          newSeats.push({
            eventId: id,
            eventShowDateId: sdId,
            seatCode: `${zoneName}-${maxCol + i}`,
            status: 'INVITATION',
            row: zoneName,
            col: maxCol + i,
            priceCategoryId: priceCatId,
            zoneName,
          })
        }

        await db.seat.createMany({ data: newSeats, skipDuplicates: true })
        totalReserved += toCreate
      }
    }

    const dayLabel = targetShowDateIds.length > 1 ? ` (${targetShowDateIds.length} hari)` : ''
    await logActivity(
      request,
      'COMPLIMENTARY_TICKET',
      `Reservi ${totalReserved} slot undangan di zona "${zoneName}" — Event: "${event.title}"${dayLabel}`
    )

    return NextResponse.json({
      message: `Berhasil reservi ${totalReserved} slot undangan di zona "${zoneName}"${dayLabel}`,
      totalReserved,
      zoneName,
    })
  } catch (error) {
    console.error('Error reserving invitation slots:', error)
    return NextResponse.json({ error: 'Gagal reservi slot undangan' }, { status: 500 })
  }
}

// DELETE — Release invitation slots (revert INVITATION seats back to AVAILABLE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const zoneName = searchParams.get('zoneName')
    const showDateId = searchParams.get('showDateId')
    const quantity = parseInt(searchParams.get('quantity') || '0')

    if (!zoneName || quantity < 1) {
      return NextResponse.json({ error: 'Zone dan jumlah harus diisi' }, { status: 400 })
    }

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 })
    }

    // Find INVITATION seats in this zone (that don't have a transaction — not yet assigned to a guest)
    const whereClause: any = {
      eventId: id,
      zoneName,
      status: 'INVITATION',
    }
    if (showDateId) whereClause.eventShowDateId = showDateId

    const invitationSeats = await db.seat.findMany({
      where: whereClause,
      orderBy: { col: 'desc' }, // Release from the end
      take: quantity,
    })

    if (invitationSeats.length === 0) {
      return NextResponse.json({ error: `Tidak ada slot undangan yang bisa dilepas di zona "${zoneName}"` }, { status: 400 })
    }

    // Check which ones are linked to transactions (have been assigned)
    const seatCodes = invitationSeats.map(s => s.seatCode)
    const linkedTransactions = await db.transaction.findMany({
      where: {
        eventId: id,
        seatCodes: { in: seatCodes.map(code => ({ contains: code })) },
        paymentStatus: { in: ['PAID', 'PENDING'] },
      },
      select: { seatCodes: true },
    })

    // Parse which seat codes are linked
    const linkedCodes = new Set<string>()
    for (const trx of linkedTransactions) {
      try {
        const codes: string[] = JSON.parse(trx.seatCodes)
        for (const code of codes) linkedCodes.add(code)
      } catch {}
    }

    // Only release unlinked invitation seats
    const toRelease = invitationSeats.filter(s => !linkedCodes.has(s.seatCode))

    if (toRelease.length === 0) {
      return NextResponse.json({
        error: `Semua slot undangan di zona "${zoneName}" sudah terhubung dengan tiket tamu dan tidak bisa dilepas.`,
      }, { status: 400 })
    }

    // Release: set back to AVAILABLE, or delete if it was created on-the-fly
    await db.seat.updateMany({
      where: { id: { in: toRelease.map(s => s.id) } },
      data: { status: 'AVAILABLE', lockedUntil: null, lockedBy: null },
    })

    await logActivity(
      request,
      'UPDATE_SEATS',
      `Lepas ${toRelease.length} slot undangan di zona "${zoneName}" — Event: "${event.title}"`
    )

    return NextResponse.json({
      message: `Berhasil melepas ${toRelease.length} slot undangan di zona "${zoneName}"`,
      released: toRelease.length,
    })
  } catch (error) {
    console.error('Error releasing invitation slots:', error)
    return NextResponse.json({ error: 'Gagal melepas slot undangan' }, { status: 500 })
  }
}
