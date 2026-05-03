import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, fileName } = await request.json()

    if (!imageBase64 || !fileName) {
      return NextResponse.json({ error: 'Missing imageBase64 or fileName' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const buffer = Buffer.from(imageBase64, 'base64')

    const storageRes = await fetch(
      `${supabaseUrl}/storage/v1/object/layout-images/${fileName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: buffer,
      }
    )

    if (!storageRes.ok) {
      const errText = await storageRes.text()
      console.error('Storage upload failed:', errText)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/layout-images/${fileName}`

    return NextResponse.json({ url: publicUrl })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
