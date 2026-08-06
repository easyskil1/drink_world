'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type OrderStatusz = 'uj' | 'visszaigazolt' | 'teljesitve' | 'torolt'

export async function setOrderStatusAction(
  id: string,
  statusz: OrderStatusz
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('orders').update({ statusz }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/rendelesek')
  return {}
}

// ---- Kigyűjtés (készletpontos, base egységben, terméknként) -----------------

/** Rendelés termék-szintű base-egység igénye (order_items × unit.mennyiseg_alapegysegben). */
async function orderNeeds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('order_items')
    .select('mennyiseg, product_units(product_id, mennyiseg_alapegysegben)')
    .eq('order_id', orderId)
  const need = new Map<string, number>()
  for (const r of (data ?? []) as unknown as {
    mennyiseg: number
    product_units: { product_id: string; mennyiseg_alapegysegben: number } | null
  }[]) {
    if (!r.product_units) continue
    const base = r.mennyiseg * r.product_units.mennyiseg_alapegysegben
    need.set(r.product_units.product_id, (need.get(r.product_units.product_id) ?? 0) + base)
  }
  return need
}

/** Termékenként a rendeléshez már kigyűjtött base mennyiség. */
async function orderPicked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('stock_items')
    .select('product_id, mennyiseg_alapegysegben')
    .eq('order_id', orderId)
    .eq('statusz', 'kigyujtve')
  const picked = new Map<string, number>()
  for (const r of (data ?? []) as { product_id: string; mennyiseg_alapegysegben: number }[]) {
    picked.set(r.product_id, (picked.get(r.product_id) ?? 0) + r.mennyiseg_alapegysegben)
  }
  return picked
}

/** Egy termékből `amount` base egység kigyűjtése FEFO szerint a betárolt készletből. */
async function pickProductFefo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  productId: string,
  amount: number
): Promise<number> {
  let remaining = amount
  const { data: stock } = await supabase
    .from('stock_items')
    .select('id, mennyiseg_alapegysegben')
    .eq('product_id', productId)
    .eq('statusz', 'betarolva')
    .gt('mennyiseg_alapegysegben', 0)
    .order('lejarat_datum', { ascending: true, nullsFirst: false })
  for (const s of (stock ?? []) as { id: string; mennyiseg_alapegysegben: number }[]) {
    if (remaining <= 0) break
    const take = Math.min(remaining, s.mennyiseg_alapegysegben)
    const { error } = await supabase.rpc('kigyujt_rendeleshez', {
      p_stock_item_id: s.id,
      p_mennyiseg: take,
      p_order_id: orderId,
    })
    if (error) break
    remaining -= take
  }
  return amount - remaining // ténylegesen kigyűjtött
}

/** Az egész rendelés automatikus FEFO-kigyűjtése a hiányzó mennyiségekre. */
export async function pickOrderFefoAction(
  orderId: string
): Promise<{ error?: string; picked?: number; shortfall?: number }> {
  const supabase = await createClient()
  const need = await orderNeeds(supabase, orderId)
  const picked = await orderPicked(supabase, orderId)
  let totalPicked = 0
  let shortfall = 0
  for (const [productId, neededBase] of need) {
    const remaining = neededBase - (picked.get(productId) ?? 0)
    if (remaining <= 0) continue
    const got = await pickProductFefo(supabase, orderId, productId, remaining)
    totalPicked += got
    shortfall += remaining - got
  }
  revalidatePath('/rendelesek')
  return { picked: totalPicked, shortfall }
}

/** Szken: vonalkód -> termék; egy csomagnyi (unit base) kigyűjtése FEFO-val. */
export async function pickScanAction(
  orderId: string,
  code: string
): Promise<{ error?: string; product_nev?: string; picked_base?: number }> {
  const supabase = await createClient()
  const ean = code.trim()
  const { data: unit } = await supabase
    .from('product_units')
    .select('product_id, mennyiseg_alapegysegben, products(nev)')
    .eq('vonalkod', ean)
    .maybeSingle<{ product_id: string; mennyiseg_alapegysegben: number; products: { nev: string } | null }>()
  if (!unit) return { error: `Ismeretlen vonalkód: ${ean}` }

  const need = await orderNeeds(supabase, orderId)
  if (!need.has(unit.product_id)) return { error: `Ez a termék nem szerepel a rendelésben.` }
  const picked = await orderPicked(supabase, orderId)
  const remaining = (need.get(unit.product_id) ?? 0) - (picked.get(unit.product_id) ?? 0)
  if (remaining <= 0) return { error: 'Ebből a termékből már minden kigyűjtve.' }

  const take = Math.min(unit.mennyiseg_alapegysegben, remaining)
  const got = await pickProductFefo(supabase, orderId, unit.product_id, take)
  revalidatePath('/rendelesek')
  if (got === 0) return { error: `Nincs betárolt készlet: ${unit.products?.nev ?? ''}` }
  return { product_nev: unit.products?.nev ?? '', picked_base: got }
}

/** A rendeléshez kigyűjtött tételek kiadása a vevőnek (rendelés -> teljesítve). */
export async function issueOrderAction(
  orderId: string
): Promise<{ error?: string; noteId?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kiad_rendeles', { p_order_id: orderId })
  if (error) return { error: error.message }
  revalidatePath('/rendelesek')
  return { noteId: data as string }
}
