import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getTripayConfig, createTransactionSignature, createTripayTransaction, LEGACY_METHOD_MAP } from '@/lib/tripay'

const CHECKOUT_PREFIX = 'CK:'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      eventId, showDateId, customerName, customerEmail, customerWa, seatCodes, sessionId,
      promoCodeId, merchandise, paymentMethod,
    } = body

    if (!eventId || !customerName || !customerEmail || !customerWa || !seatCodes || !Array.isArray(seatCodes) || seatCodes.length === 0) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Session tidak valid. Silakan refresh halaman.' }, { status: 400 })
    }

    const checkoutId = CHECKOUT_PREFIX + sessionId

    // Validate seats — if showDateId is provided, filter by it
    const seatWhere: any = { eventId, seatCode: { in: seatCodes } }
    if (showDateId) {
      seatWhere.eventShowDateId = showDateId
    }
    const seats = await db.seat.findMany({ where: seatWhere })
    if (seats.length !== seatCodes.length) return NextResponse.json({ error: 'Kursi tidak ditemukan' }, { status: 404 })

    const invalidSeats = seats.filter((s) => s.status === 'SOLD')
    if (invalidSeats.length > 0) {
      return NextResponse.json({ error: 'Kursi ' + invalidSeats.map((s) => s.seatCode).join(', ') + ' sudah terjual' }, { status: 409 })
    }

    const notOurs = seats.filter((s) => s.status === 'LOCKED_TEMPORARY' && s.lockedBy !== checkoutId)
    if (notOurs.length > 0) {
      return NextResponse.json({ error: 'Kursi ' + notOurs.map((s) => s.seatCode).join(', ') + ' sedang dipilih orang lain.' }, { status: 409 })
    }

    // Re-lock seats
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000)
    await db.seat.updateMany({
      where: { eventId, seatCode: { in: seatCodes }, lockedBy: checkoutId },
      data: { status: 'LOCKED_TEMPORARY', lockedUntil, lockedBy: checkoutId },
    })

    // Get event for admin fee + publish check
    const event = await db.event.findUnique({ where: { id: eventId }, select: { adminFee: true, isPublished: true } })

    // Block checkout for unpublished events
    if (!event?.isPublished) {
      return NextResponse.json({ error: 'Penjualan tiket untuk event ini sudah ditutup.' }, { status: 403 })
    }

    // Resolve payment method — accept Tripay channel codes or legacy QRIS/NON_QRIS
    let resolvedMethod = paymentMethod || 'BCAVA'
    if (LEGACY_METHOD_MAP[resolvedMethod]) {
      resolvedMethod = LEGACY_METHOD_MAP[resolvedMethod]
    }

    // Calculate seat prices (use same showDateId filter as validation above)
    const priceCats = await db.priceCategory.findMany({ where: { eventId } })
    const seatPrices = await db.seat.findMany({ where: seatWhere, select: { seatCode: true, priceCategoryId: true } })

    let seatTotal = 0
    const items: any[] = []
    for (const s of seatPrices) {
      const cat = priceCats.find((p) => p.id === s.priceCategoryId)
      if (!cat) return NextResponse.json({ error: 'Harga kursi belum diatur' }, { status: 400 })
      seatTotal += cat.price
      items.push({ id: s.seatCode, price: cat.price, quantity: 1, name: 'Kursi ' + s.seatCode, category: 'Tiket' })
    }

    // Admin fee — flat per ticket
    const adminFeePerTicket = event?.adminFee || 0
    const adminFeeTotal = adminFeePerTicket * seatCodes.length

    if (adminFeeTotal > 0) {
      items.push({ id: 'ADMIN-FEE', price: adminFeeTotal, quantity: 1, name: 'Biaya Admin', category: 'Biaya' })
    }

    // Promo code - calculate discount (using Jakarta timezone)
    const JAKARTA_OFFSET = 7 * 60
    const toJakarta = (d: Date) => {
      const utcMs = d.getTime() + d.getTimezoneOffset() * 60 * 1000
      return new Date(utcMs + JAKARTA_OFFSET * 60 * 1000)
    }

    let discountAmount = 0
    let promoCodeData: Awaited<ReturnType<typeof db.promoCode.findUnique>> | null = null
    let promoTarget = 'ALL'
    if (promoCodeId) {
      promoCodeData = await db.promoCode.findUnique({ where: { id: promoCodeId } })
      promoTarget = promoCodeData?.target || 'ALL'
      if (promoCodeData && promoCodeData.isActive && promoCodeData.currentUses < promoCodeData.maxUses) {
        const now = new Date()
        const nowJakarta = toJakarta(now)
        const fromJakarta = toJakarta(new Date(promoCodeData.validFrom))
        const untilJakarta = toJakarta(new Date(promoCodeData.validUntil))

        if (nowJakarta >= fromJakarta && nowJakarta <= untilJakarta) {
          const hasMerch = merchandise && Array.isArray(merchandise) && merchandise.length > 0

          if (seatCodes.length < (promoCodeData.minTickets || 0)) {
            return NextResponse.json({ error: `Promo ini berlaku untuk pembelian minimal ${promoCodeData.minTickets} tiket` }, { status: 400 })
          }
          if (!hasMerch && (promoCodeData.minMerchItems || 0) > 0) {
            return NextResponse.json({ error: `Promo ini berlaku jika membeli minimal ${promoCodeData.minMerchItems} merchandise` }, { status: 400 })
          }

          if (promoTarget === 'BUNDLING' && !(seatCodes.length > 0 && hasMerch)) {
            return NextResponse.json({ error: 'Promo bundling hanya berlaku jika membeli tiket + merchandise' }, { status: 400 })
          }
          if (promoTarget === 'MERCH' && !hasMerch) {
            return NextResponse.json({ error: 'Promo ini hanya berlaku untuk merchandise' }, { status: 400 })
          }
        } else {
          // Promo date invalid — clear promo so it doesn't get applied
          promoCodeData = null
        }
      } else {
        // Promo inactive or max uses reached — clear promo
        promoCodeData = null
      }
    }

    // Merchandise - use DB price, not client-sent price
    let merchDataToSave: any = null
    if (merchandise && Array.isArray(merchandise) && merchandise.length > 0) {
      merchDataToSave = []
      let merchTotal = 0

      for (const merch of merchandise) {
        const merchItem = await db.merchandise.findUnique({ where: { id: merch.merchandiseId } })
        if (!merchItem) {
          return NextResponse.json({ error: 'Merchandise "' + merch.name + '" tidak ditemukan' }, { status: 404 })
        }
        if (merchItem.stock < merch.quantity || merch.quantity < 1) {
          return NextResponse.json({ error: 'Stok "' + merchItem.name + '" tidak cukup (sisa: ' + merchItem.stock + ')' }, { status: 409 })
        }

        const subtotal = merchItem.price * merch.quantity
        merchTotal += subtotal

        merchDataToSave.push({
          merchandiseId: merch.merchandiseId,
          name: merchItem.name,
          price: merchItem.price,
          quantity: merch.quantity,
        })

        items.push({
          id: 'MERCH-' + merch.merchandiseId,
          price: merchItem.price,
          quantity: merch.quantity,
          name: merchItem.name,
          category: 'Merchandise',
        })
      }

      for (const merch of merchandise) {
        await db.merchandise.update({
          where: { id: merch.merchandiseId },
          data: { stock: { decrement: merch.quantity } },
        })
      }
    }

    const merchTotalCalc = merchDataToSave ? merchDataToSave.reduce((s: number, m: any) => s + m.price * m.quantity, 0) : 0

    // ── Calculate discount AFTER merchandise is resolved ──
    // This handles ALL promo targets (TICKET, ALL, MERCH, BUNDLING) in one place
    if (promoCodeData) {
      const isPerItem = promoCodeData.isPerItem === true
      const ticketSubtotal = seatTotal + adminFeeTotal

      if (promoTarget === 'TICKET') {
        if (isPerItem) {
          const perItemDiscount =
            promoCodeData.discountType === 'PERCENT'
              ? Math.round((ticketSubtotal / seatCodes.length) * promoCodeData.discountValue / 100)
              : Math.min(promoCodeData.discountValue, ticketSubtotal / seatCodes.length)
          discountAmount = perItemDiscount * seatCodes.length
        } else {
          discountAmount =
            promoCodeData.discountType === 'PERCENT'
              ? Math.round(ticketSubtotal * promoCodeData.discountValue / 100)
              : Math.min(promoCodeData.discountValue, ticketSubtotal)
        }
      } else if (promoTarget === 'MERCH' && merchTotalCalc > 0) {
        const totalMerchQty = merchDataToSave ? merchDataToSave.reduce((s: number, m: any) => s + m.quantity, 0) : 0
        if (isPerItem && totalMerchQty > 0) {
          const perItemDiscount =
            promoCodeData.discountType === 'PERCENT'
              ? Math.round((merchTotalCalc / totalMerchQty) * promoCodeData.discountValue / 100)
              : Math.min(promoCodeData.discountValue, merchTotalCalc / totalMerchQty)
          discountAmount = perItemDiscount * totalMerchQty
        } else {
          discountAmount =
            promoCodeData.discountType === 'PERCENT'
              ? Math.round(merchTotalCalc * promoCodeData.discountValue / 100)
              : Math.min(promoCodeData.discountValue, merchTotalCalc)
        }
      } else if (promoTarget === 'ALL' || promoTarget === 'BUNDLING') {
        // ALL: discount on everything (tickets + admin fee + merch)
        // BUNDLING: same as ALL but requires both tickets + merch (validated above)
        const targetSubtotal = ticketSubtotal + merchTotalCalc
        const totalItems = seatCodes.length + (merchDataToSave ? merchDataToSave.reduce((s: number, m: any) => s + m.quantity, 0) : 0)

        if (isPerItem && totalItems > 0) {
          const perItemDiscount =
            promoCodeData.discountType === 'PERCENT'
              ? Math.round((targetSubtotal / totalItems) * promoCodeData.discountValue / 100)
              : Math.min(promoCodeData.discountValue, targetSubtotal / totalItems)
          discountAmount = perItemDiscount * totalItems
        } else {
          discountAmount =
            promoCodeData.discountType === 'PERCENT'
              ? Math.round(targetSubtotal * promoCodeData.discountValue / 100)
              : Math.min(promoCodeData.discountValue, targetSubtotal)
        }
      }
    }

    // Final total = seats + admin fee + merch - discount
    const totalAmount = Math.max(seatTotal + adminFeeTotal + merchTotalCalc - discountAmount, 1)

    console.log('[checkout] seatTotal:', seatTotal, 'adminFee:', adminFeeTotal, 'discount:', discountAmount, 'merchTotal:', merchTotalCalc, 'totalAmount:', totalAmount)

    // Increment promo code usage
    if (promoCodeId) {
      try {
        await db.promoCode.update({
          where: { id: promoCodeId },
          data: { currentUses: { increment: 1 } },
        })
        console.log('[checkout] Promo code usage incremented for', promoCodeId)
      } catch (promoErr) {
        console.error('[checkout] Failed to increment promo usage:', promoErr)
      }
    }

    // Generate transaction ID
    const tid = 'TRX-' + randomUUID().slice(0, 8).toUpperCase()

    // ── Tripay: Create closed payment transaction ──
    const tripayConfig = getTripayConfig()
    if (!tripayConfig.apiKey) {
      console.error('[checkout] TRIPAY_API_KEY is not configured')
      return NextResponse.json(
        { error: 'Payment gateway belum dikonfigurasi. Hubungi admin untuk mengatur API key Tripay.' },
        { status: 503 }
      )
    }

    const expiredTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    const signature = createTransactionSignature(tid, totalAmount)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Build order_items for Tripay
    const orderItems = discountAmount === 0
      ? items.map((item) => ({
          sku: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        }))
      : [{
          sku: 'SUMMARY',
          name: seatCodes.length + ' Tiket' + (merchDataToSave ? ' + Merchandise' : ''),
          price: totalAmount,
          quantity: 1,
        }]

    const tripayPayload = {
      method: resolvedMethod,
      merchant_ref: tid,
      amount: totalAmount,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerWa,
      order_items: orderItems,
      callback_url: appUrl + '/api/webhooks/tripay',
      return_url: appUrl + '/verify/' + tid,
      expired_time: expiredTime,
      signature,
    }

    console.log('[checkout] Tripay creating transaction:', resolvedMethod, 'amount:', totalAmount, 'tid:', tid)

    const tripayRes = await createTripayTransaction(tripayPayload)

    if (!tripayRes.ok) {
      const errText = await tripayRes.text().catch(() => 'Unknown error')
      console.error('[checkout] Tripay error:', tripayRes.status, errText)
      // Parse Tripay error response for a more helpful message
      let userMessage = 'Gagal menghubungi payment gateway (error ' + tripayRes.status + ')'
      try {
        const errJson = JSON.parse(errText)
        const tripayMsg = errJson.message || errJson.error || ''
        if (tripayRes.status === 401) {
          userMessage = 'API key Tripay tidak valid. Pastikan TRIPAY_API_KEY sudah benar di environment variables.'
          if (tripayMsg) userMessage += ' (' + tripayMsg + ')'
        } else if (tripayRes.status === 403) {
          userMessage = 'Akses Tripay ditolak. Kemungkinan: (1) Mode production/sandbox tidak sesuai — set TRIPAY_IS_PRODUCTION=true jika menggunakan API key production, (2) Private key atau merchant code salah — cek TRIPAY_PRIVATE_KEY dan TRIPAY_MERCHANT_CODE, (3) IP server belum di-whitelist di dashboard Tripay (production mode).'
          if (tripayMsg) userMessage += ' Detail: ' + tripayMsg
        } else if (tripayRes.status === 400) {
          userMessage = 'Permintaan ke Tripay tidak valid: ' + (tripayMsg || errText)
        }
      } catch {}
      return NextResponse.json({ error: userMessage }, { status: 502 })
    }

    const tripayData = await tripayRes.json()

    if (!tripayData.success || !tripayData.data) {
      const errMsg = tripayData.message || 'Gagal membuat transaksi pembayaran'
      console.error('[checkout] Tripay API error:', errMsg, JSON.stringify(tripayData).slice(0, 500))
      return NextResponse.json({ error: 'Tripay: ' + errMsg }, { status: 502 })
    }

    const { reference, checkout_url, pay_url, pay_code, status } = tripayData.data

    // Determine payment URL: prefer checkout_url (works for all channels)
    const paymentUrl = checkout_url || pay_url || null

    console.log('[checkout] Tripay success — reference:', reference, 'checkout_url:', !!paymentUrl, 'pay_code:', !!pay_code)

    // Save transaction to DB
    await db.transaction.create({
      data: {
        transactionId: tid,
        eventId,
        showDateId: showDateId || null,
        customerName,
        customerEmail,
        customerWa,
        seatCodes: JSON.stringify(seatCodes),
        totalAmount,
        paymentStatus: 'PENDING',
        adminFeeApplied: adminFeeTotal,
        promoCodeId: discountAmount > 0 ? promoCodeId : null,
        merchandiseData: merchDataToSave ? JSON.stringify(merchDataToSave) : null,
        midtransId: reference,       // Store Tripay reference (backward compat field name)
        paymentMethod: resolvedMethod,
        paymentUrl: paymentUrl,
      },
    })

    return NextResponse.json({
      reference,
      checkoutUrl: paymentUrl,
      payCode: pay_code,
      transactionId: tid,
      paymentMethod: resolvedMethod,
    })
  } catch (error) {
    console.error('[checkout] Fatal error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan server. Coba lagi.' }, { status: 500 })
  }
}
