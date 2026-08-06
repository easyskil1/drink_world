'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeTeljesKod, type LocationTipus } from '@/lib/locations'

export type LocationFormState = { error?: string }

const TIPUS_VALUES: LocationTipus[] = ['pick', 'raktar', 'puffer', 'karanten']

function parseForm(formData: FormData) {
  const terulet = String(formData.get('terulet') ?? '').trim()
  const sor = String(formData.get('sor') ?? '').trim()
  const polc = String(formData.get('polc') ?? '').trim()
  const tarhely = String(formData.get('tarhely') ?? '').trim()
  const tipusRaw = String(formData.get('tipus') ?? '')
  const aktiv = formData.get('aktiv') === 'on'
  const tipus = (TIPUS_VALUES as string[]).includes(tipusRaw)
    ? (tipusRaw as LocationTipus)
    : 'raktar'

  return { terulet, sor, polc, tarhely, tipus, aktiv }
}

function validate(v: ReturnType<typeof parseForm>): string | null {
  if (!v.terulet && !v.sor && !v.polc && !v.tarhely) {
    return 'Legalább egy mezőt (terület, sor, polc vagy tárhely) ki kell tölteni.'
  }
  return null
}

export async function createLocation(
  _prev: LocationFormState,
  formData: FormData
): Promise<LocationFormState> {
  const v = parseForm(formData)
  const err = validate(v)
  if (err) return { error: err }

  const supabase = await createClient()
  const qr_kod = computeTeljesKod(v)

  const { error } = await supabase.from('locations').insert({
    terulet: v.terulet,
    sor: v.sor,
    polc: v.polc,
    tarhely: v.tarhely,
    tipus: v.tipus,
    aktiv: v.aktiv,
    qr_kod,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ez a tárhely (vagy QR kód) már létezik.' }
    }
    return { error: 'Mentési hiba: ' + error.message }
  }

  revalidatePath('/helyek')
  updateTag('locations')
  redirect('/helyek')
}

export async function updateLocation(
  id: string,
  _prev: LocationFormState,
  formData: FormData
): Promise<LocationFormState> {
  const v = parseForm(formData)
  const err = validate(v)
  if (err) return { error: err }

  const supabase = await createClient()
  const qr_kod = computeTeljesKod(v)

  const { error } = await supabase
    .from('locations')
    .update({
      terulet: v.terulet,
      sor: v.sor,
      polc: v.polc,
      tarhely: v.tarhely,
      tipus: v.tipus,
      aktiv: v.aktiv,
      qr_kod,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ez a tárhely (vagy QR kód) már létezik.' }
    }
    return { error: 'Mentési hiba: ' + error.message }
  }

  revalidatePath('/helyek')
  updateTag('locations')
  redirect('/helyek')
}

export async function toggleLocationActive(id: string, aktiv: boolean) {
  const supabase = await createClient()
  await supabase.from('locations').update({ aktiv }).eq('id', id)
  revalidatePath('/helyek')
  updateTag('locations')
}

export type DeleteLocationResult = { error?: string }

export async function deleteLocation(id: string): Promise<DeleteLocationResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('locations').delete().eq('id', id)

  if (error) {
    // 23503 = FK violation: a tárhelyre készlet vagy mozgás hivatkozik.
    if (error.code === '23503') {
      return {
        error:
          'A tárhely nem törölhető, mert készlet vagy mozgás hivatkozik rá. Előbb ürítsd ki, vagy deaktiváld.',
      }
    }
    return { error: 'Törlési hiba: ' + error.message }
  }

  revalidatePath('/helyek')
  updateTag('locations')
  return {}
}
