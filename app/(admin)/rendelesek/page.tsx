import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { RendelesekList, type OrderView } from './RendelesekList'

export default async function RendelesekPage() {
  await requireStaff()
  const supabase = await createClient()

  const { data: ordersData } = await supabase
    .from('orders')
    .select('id, statusz, created_at, kivant_szallitas, megjegyzes, customer_id, order_items(product_unit_id, mennyiseg, egysegar_brutto)')
    .order('created_at', { ascending: false })

  type Raw = {
    id: string
    statusz: string
    created_at: string
    kivant_szallitas: string | null
    megjegyzes: string | null
    customer_id: string
    order_items: { product_unit_id: string; mennyiseg: number; egysegar_brutto: number | null }[]
  }
  const orders = (ordersData ?? []) as Raw[]

  const custIds = [...new Set(orders.map((o) => o.customer_id))]
  const unitIds = [...new Set(orders.flatMap((o) => o.order_items.map((i) => i.product_unit_id)))]
  const orderIds = orders.map((o) => o.id)

  const [custRes, unitRes, pickedRes] = await Promise.all([
    custIds.length
      ? supabase.from('customers').select('id, ceg_nev').in('id', custIds)
      : Promise.resolve({ data: [] as { id: string; ceg_nev: string | null }[] }),
    unitIds.length
      ? supabase.from('product_units').select('id, product_id, mennyiseg_alapegysegben, products(nev)').in('id', unitIds)
      : Promise.resolve({ data: [] as unknown[] }),
    orderIds.length
      ? supabase.from('stock_items').select('order_id, product_id, mennyiseg_alapegysegben').in('order_id', orderIds).eq('statusz', 'kigyujtve')
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const cegOf = new Map(((custRes.data ?? []) as { id: string; ceg_nev: string | null }[]).map((c) => [c.id, c.ceg_nev]))
  type UnitMeta = { id: string; product_id: string; mennyiseg_alapegysegben: number; products: { nev: string } | null }
  const unitOf = new Map(((unitRes.data ?? []) as UnitMeta[]).map((u) => [u.id, u]))

  // kigyűjtött base mennyiség: order_id -> product_id -> base
  const pickedByOrder = new Map<string, Map<string, number>>()
  for (const s of (pickedRes.data ?? []) as { order_id: string; product_id: string; mennyiseg_alapegysegben: number }[]) {
    if (!pickedByOrder.has(s.order_id)) pickedByOrder.set(s.order_id, new Map())
    const m = pickedByOrder.get(s.order_id)!
    m.set(s.product_id, (m.get(s.product_id) ?? 0) + s.mennyiseg_alapegysegben)
  }

  const view: OrderView[] = orders.map((o) => {
    // igény termékenként base egységben
    const needByProduct = new Map<string, { nev: string; needed: number }>()
    for (const it of o.order_items) {
      const u = unitOf.get(it.product_unit_id)
      if (!u) continue
      const base = it.mennyiseg * u.mennyiseg_alapegysegben
      const cur = needByProduct.get(u.product_id) ?? { nev: u.products?.nev ?? 'Termék', needed: 0 }
      cur.needed += base
      needByProduct.set(u.product_id, cur)
    }
    const pickedMap = pickedByOrder.get(o.id) ?? new Map()
    const products = [...needByProduct.entries()].map(([pid, v]) => {
      const picked = pickedMap.get(pid) ?? 0
      return { product_nev: v.nev, needed: v.needed, picked, done: picked >= v.needed }
    })
    return {
      id: o.id,
      statusz: o.statusz,
      created_at: o.created_at,
      kivant_szallitas: o.kivant_szallitas,
      megjegyzes: o.megjegyzes,
      ceg_nev: cegOf.get(o.customer_id) ?? '(ismeretlen vevő)',
      items: o.order_items.map((i) => ({
        nev: unitOf.get(i.product_unit_id)?.products?.nev ?? 'Termék',
        mennyiseg: i.mennyiseg,
        egysegar_brutto: i.egysegar_brutto ?? 0,
      })),
      picking: products,
      fullyPicked: products.length > 0 && products.every((p) => p.done),
    }
  })

  const ujCount = view.filter((o) => o.statusz === 'uj').length

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900">Rendelések / Kigyűjtés</h1>
      <p className="mt-1 text-sm text-slate-500">
        Beérkezett vevői rendelések: kigyűjtés (szkenneléssel vagy FEFO-automatikusan) és
        kiszállítás.
      </p>
      {ujCount > 0 && (
        <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {ujCount} új rendelés vár feldolgozásra.
        </p>
      )}
      <div className="mt-6">
        <RendelesekList orders={view} />
      </div>
    </div>
  )
}
