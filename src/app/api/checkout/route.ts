import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getTripayConfig, createTransactionSignature, createTripayTransaction, LEGACY_METHOD_MAP } from '@/lib/tripay'
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit'

const CHECKOUT_PREFIX = 'CK:'

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP: max 5 checkouts per minute
    const ip = getClientIp(request)
    const rateResult = checkoutLimiter.check(`checkout:${ip}`)
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak request. Tunggu beberapa saat dan coba lagi.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const {
      eventId, showDateId, customerName, customerEmail, customerWa, seatCodes, sessionId,
      promoCodeId, merchandise, paymentMethod,
      festivalPackage,
    } = body

    const isFestivalCheckout = !!festivalPackage

    // Validation: festival mode needs festivalPackage; regular mode needs seatCodes
    if (!eventId || !customerName || !customerEmail || !customerWa) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }
    if (!isFestivalCheckout && (!seatCodes || !Array.isArray(seatCodes) || seatCodes.length === 0)) {
      return NextResponse.json({ error: 'Pilih kursi terlebih dahulu' }, { status: 400 })
    }
    if (isFestivalCheckout && (!festivalPackage.quantity || festivalPackage.quantity < 1)) {
      return NextResponse.json({ error: 'Jumlah tiket festival tidak valid' }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Session tidak valid. Silakan refresh halaman.' }, { status: 400 })
    }

    const checkoutId = CHECKOUT_PREFIX + sessionId

    // Get event with all needed fields
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: {
        adminFee: true,
        isPublished: true,
        eventMode: true,
        seatType: true,
      },
    })

    // Block checkout for unpublished events
    if (!event?.isPublished) {
      return NextResponse.json({ error: 'Penjualan tiket untuk event ini sudah ditutup.' }, { status: 403 })
    }

    // Festival Mode: validate package + auto-pick GA seats from each applicable day
    let festivalAutoSeats: { id: string; seatCode: string; eventShowDateId: string; priceCategoryId: string }[] = []
    let festivalTicketCount = 0
    let festivalSeatCodes: string[] = []
    let festivalPriceCategoryId: string | null = null

    if (isFestivalCheckout) {
      const pkg = festivalPackage
      const qty = parseInt(pkg.quantity, 10)
      if (!Number.isFinite(qty) || qty < 1) {
        return NextResponse.json({ error: 'Jumlah tiket tidak valid' }, { status: 400 })
      }
      festivalTicketCount = qty

      // Validate price category
      const priceCat = await db.priceCategory.findUnique({ where: { id: pkg.priceCategoryId } })
      if (!priceCat || priceCat.eventId !== eventId) {
        return NextResponse.json({ error: 'Kategori harga tidak valid' }, { status: 400 })
      }
      festivalPriceCategoryId = priceCat.id

      // ── Sales lock guard (Kunci Penjualan) ──
      // Admin can manually lock a festival package's sales — e.g., to pause
      // sales during a flash issue or when the package is being reconfigured.
      // Usher/admin complimentary tickets bypass this (handled in their route).
      if (priceCat.salesLocked) {
        const reason = priceCat.salesLockReason?.trim()
        return NextResponse.json({
          error: reason
            ? `Penjualan paket "${priceCat.name}" sedang dikunci: ${reason}`
            : `Penjualan paket "${priceCat.name}" sedang dikunci sementara. Silakan coba lagi nanti.`,
        }, { status: 403 })
      }

      // Resolve applicable day IDs
      let applicableDayIds: string[] = pkg.applicableDayIds || []
      if (priceCat.packageType === 'FULL') {
        // FULL = all days
        const allDates = await db.eventShowDate.findMany({ where: { eventId }, orderBy: { date: 'asc' } })
        applicableDayIds = allDates.map(d => d.id)
      } else if (priceCat.applicableDayIds) {
        try { applicableDayIds = JSON.parse(priceCat.applicableDayIds) } catch { /* ignore */ }
      }

      if (applicableDayIds.length === 0) {
        return NextResponse.json({ error: 'Paket festival tidak memiliki hari yang berlaku. Hubungi admin.' }, { status: 400 })
      }

      // ─── NEW MODEL: 1 tiket = 1 seat (single pool, no per-day duplication) ───
      // Multi-day access is encoded in the seatCode stored on the transaction:
      //   "VIP-1@day1abc,day2def,day3ghi"
      // The seat itself has eventShowDateId = null. The applicable days are
      // derived from the price category's applicableDayIds at checkout time.
      //
      // Availability = count of AVAILABLE seats in this package's zone, period.
      // No per-day breakdown, no min-across-days.
      const allPickedSeats: { id: string; seatCode: string; priceCategoryId: string }[] = []

      // Find `qty` available GA seats in this price category's zone
      // (zoneName === price category name in our auto-built GA config)
      const availableSeats = await db.seat.findMany({
        where: {
          eventId,
          priceCategoryId: priceCat.id,
          status: 'AVAILABLE',
        },
        orderBy: { seatCode: 'asc' },
        take: qty,
      })

      if (availableSeats.length < qty) {
        return NextResponse.json({
          error: `Tiket tinggal ${availableSeats.length} (Anda pesan ${qty}). Kurangi jumlah atau pilih paket lain.`,
        }, { status: 409 })
      }

      for (const s of availableSeats) {
        allPickedSeats.push({
          id: s.id,
          seatCode: s.seatCode,
          priceCategoryId: s.priceCategoryId!,
        })
      }

      // Lock the picked seats under this checkout session
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000)
      await db.seat.updateMany({
        where: { id: { in: allPickedSeats.map(s => s.id) } },
        data: { status: 'LOCKED_TEMPORARY', lockedUntil, lockedBy: checkoutId },
      })

      festivalAutoSeats = allPickedSeats as any
      // Encode applicable day IDs into seatCode string for check-in:
      // "VIP-1@day1abc,day2def,day3ghi" — usher scans, system knows ticket
      // is valid for any of those days.
      const dayIdsJoined = applicableDayIds.join(',')
      festivalSeatCodes = allPickedSeats.map(s => `${s.seatCode}@${dayIdsJoined}`)
    } else {
      // REGULAR Mode: validate seats as before
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
    }

    // Resolve payment method — accept Tripay channel codes or legacy QRIS/NON_QRIS
    let resolvedMethod = paymentMethod || 'BCAVA'
    if (LEGACY_METHOD_MAP[resolvedMethod]) {
      resolvedMethod = LEGACY_METHOD_MAP[resolvedMethod]
    }

    // Calculate seat prices & items
    const priceCats = await db.priceCategory.findMany({ where: { eventId } })

    let seatTotal = 0
    const items: any[] = []

    if (isFestivalCheckout) {
      // Festival Mode: each ticket = 1 festival package (covers all applicable days)
      // We charge `quantity` × package price (not per-day seats)
      const pkg = festivalPackage
      const qty = festivalTicketCount
      const pkgPrice = pkg.unitPrice
      seatTotal = pkgPrice * qty

      items.push({
        id: `FESTIVAL-${pkg.priceCategoryId}`,
        price: pkgPrice,
        quantity: qty,
        name: `${pkg.packageName} (Festival Pass — ${pkg.applicableDayIds?.length || 0} hari)`,
        category: 'Tiket Festival',
        priceCategoryId: pkg.priceCategoryId,
      })
    } else {
      // REGULAR Mode: use seat prices as before
      const seatWhere: any = { eventId, seatCode: { in: seatCodes } }
      if (showDateId) {
        seatWhere.eventShowDateId = showDateId
      }
      const seatPrices = await db.seat.findMany({ where: seatWhere, select: { seatCode: true, priceCategoryId: true } })

      for (const s of seatPrices) {
        const cat = priceCats.find((p) => p.id === s.priceCategoryId)
        if (!cat) return NextResponse.json({ error: 'Harga kursi belum diatur' }, { status: 400 })
        seatTotal += cat.price
        items.push({ id: s.seatCode, price: cat.price, quantity: 1, name: 'Kursi ' + s.seatCode, category: 'Tiket', priceCategoryId: s.priceCategoryId })
      }
    }

    // Admin fee — flat per ticket (festival uses festivalTicketCount)
    const adminFeePerTicket = event?.adminFee || 0
    const effectiveTicketCount = isFestivalCheckout ? festivalTicketCount : seatCodes.length
    const adminFeeTotal = adminFeePerTicket * effectiveTicketCount

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

          // Use effectiveTicketCount so festival mode (where seatCodes is empty) still validates correctly
          const ticketCountForPromo = isFestivalCheckout ? festivalTicketCount : seatCodes.length

          if (ticketCountForPromo < (promoCodeData.minTickets || 0)) {
            return NextResponse.json({ error: `Promo ini berlaku untuk pembelian minimal ${promoCodeData.minTickets} tiket` }, { status: 400 })
          }
          if (!hasMerch && (promoCodeData.minMerchItems || 0) > 0) {
            return NextResponse.json({ error: `Promo ini berlaku jika membeli minimal ${promoCodeData.minMerchItems} merchandise` }, { status: 400 })
          }

          if (promoTarget === 'BUNDLING' && !(ticketCountForPromo > 0 && hasMerch)) {
            return NextResponse.json({ error: 'Promo bundling hanya berlaku jika membeli tiket + merchandise' }, { status: 400 })
          }
          if (promoTarget === 'MERCH' && !hasMerch) {
            return NextResponse.json({ error: 'Promo ini hanya berlaku untuk merchandise' }, { status: 400 })
          }

          // --- Zone restriction validation ---
          // applicableZoneNames: JSON array of zone/category names
          // Matches: priceCategory.name (Numbered Seating) or zoneName (General Admission)
          // Festival Mode: package name (which is also zone name in GA config)
          if (promoCodeData.applicableZoneNames) {
            try {
              const allowedZones: string[] = JSON.parse(promoCodeData.applicableZoneNames)
              if (Array.isArray(allowedZones) && allowedZones.length > 0) {
                let allBuyerZones: string[] = []

                if (isFestivalCheckout) {
                  // Festival: use package name (= price category name = zone name)
                  const festivalCat = priceCats.find(p => p.id === festivalPriceCategoryId)
                  if (festivalCat?.name) allBuyerZones.push(festivalCat.name)
                } else {
                  // Regular: get zone names from seats + price category names
                  const seatWhere: any = { eventId, seatCode: { in: seatCodes } }
                  if (showDateId) seatWhere.eventShowDateId = showDateId
                  const seatsForZones = await db.seat.findMany({
                    where: seatWhere,
                    select: { seatCode: true, zoneName: true, priceCategoryId: true },
                  })
                  const buyerZoneNames = seatsForZones
                    .map((s) => s.zoneName)
                    .filter(Boolean) as string[]
                  const buyerCategoryNames = seatsForZones
                    .map((s) => {
                      const cat = priceCats.find((p) => p.id === s.priceCategoryId)
                      return cat?.name
                    })
                    .filter(Boolean) as string[]
                  allBuyerZones = [...new Set([...buyerZoneNames, ...buyerCategoryNames])]
                }

                const matchingZones = allBuyerZones.filter((name) => allowedZones.includes(name))
                if (matchingZones.length === 0) {
                  return NextResponse.json({ error: `Promo ini hanya berlaku untuk zona: ${allowedZones.join(', ')}` }, { status: 400 })
                }
              }
            } catch {
              // If JSON parse fails, ignore category restriction
            }
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
    if (promoCodeData) {
      const isPerItem = promoCodeData.isPerItem === true
      const ticketSubtotal = seatTotal + adminFeeTotal
      // Use effectiveTicketCount for festival mode (where seatCodes is empty)
      const ticketCount = isFestivalCheckout ? festivalTicketCount : seatCodes.length

      // --- Bundling discount calculation ---
      if (promoCodeData.bundleSize > 0 && promoCodeData.bundleDiscount > 0) {
        const bundleCount = Math.floor(ticketCount / promoCodeData.bundleSize)
        if (bundleCount > 0) {
          discountAmount = bundleCount * promoCodeData.bundleDiscount
        }
      } else if (promoTarget === 'TICKET') {
        if (isPerItem && ticketCount > 0) {
          const perItemDiscount =
            promoCodeData.discountType === 'PERCENT'
              ? Math.round((ticketSubtotal / ticketCount) * promoCodeData.discountValue / 100)
              : Math.min(promoCodeData.discountValue, ticketSubtotal / ticketCount)
          discountAmount = perItemDiscount * ticketCount
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
        const targetSubtotal = ticketSubtotal + merchTotalCalc
        const totalItems = ticketCount + (merchDataToSave ? merchDataToSave.reduce((s: number, m: any) => s + m.quantity, 0) : 0)

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

    // Build order_items for Tripay — always itemized so admin fee is visible
    let orderItems: { sku: string; name: string; price: number; quantity: number }[]

    if (discountAmount === 0) {
      orderItems = items.map((item) => ({
        sku: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }))
    } else {
      // Distribute discount proportionally across items so the total matches
      const totalItemValue = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      let remainingDiscount = discountAmount

      orderItems = items.map((item, idx) => {
        const itemSubtotal = item.price * item.quantity
        let itemDiscount: number

        if (idx === items.length - 1) {
          // Last item gets the remaining discount to avoid rounding issues
          itemDiscount = remainingDiscount
        } else {
          itemDiscount = Math.round(discountAmount * (itemSubtotal / totalItemValue))
          remainingDiscount -= itemDiscount
        }

        const discountedPrice = Math.max(itemSubtotal - itemDiscount, 1)
        return {
          sku: item.id,
          name: item.name + (itemDiscount > 0 ? ' (diskon)' : ''),
          price: Math.ceil(discountedPrice / item.quantity),
          quantity: item.quantity,
        }
      })
    }

    // Verify order_items total matches amount (Tripay validates this)
    const itemsTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    if (itemsTotal !== totalAmount) {
      // Adjust the last item's price to fix rounding differences
      const diff = totalAmount - itemsTotal
      const lastItem = orderItems[orderItems.length - 1]
      lastItem.price = Math.max(lastItem.price + Math.round(diff / lastItem.quantity), 1)
    }

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
    // Festival Mode: use festival seat codes (with day prefix) so each day's seat is tracked
    const finalSeatCodes = isFestivalCheckout ? festivalSeatCodes : seatCodes

    await db.transaction.create({
      data: {
        transactionId: tid,
        eventId,
        showDateId: showDateId || null,
        customerName,
        customerEmail,
        customerWa,
        seatCodes: JSON.stringify(finalSeatCodes),
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
