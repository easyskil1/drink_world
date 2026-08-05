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

  // vevőnevek + termékndevek
  const custIds = [...new Set(orders.map((o) => o.customer_id))]
  const unitIds = [...new Set(orders.flatMap((o) => o.order_items.map((i) => i.product_unit_id)))]

  const [custRes, unitRes] = await Promise.all([
    custIds.length
      ? supabase.from('customers').select('id, ceg_nev').in('id', custIds)
      : Promise.resolve({ data: [] as { id: string; ceg_nev: string | null }[] }),
    unitIds.length
      ? supabase
          .from('product_units')
          .select('id, mennyiseg_alapegysegben, products(nev)')
          .in('id', unitIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const cegOf = new Map(((custRes.data ?? []) as { id: string; ceg_nev: string | null }[]).map((c) => [c.id, c.ceg_nev]))
  const unitOf = new Map(
    ((unitRes.data ?? []) as { id: string; mennyiseg_alapegysegben: number; products: { nev: string } | null }[]).map(
      (u) => [u.id, `${u.products?.nev ?? 'Termék'}${u.mennyiseg_alapegysegben > 1 ? ` (${u.mennyiseg_alapegysegben} db)` : ''}`]
    )
  )

  const view: OrderView[] = orders.map((o) => ({
    id: o.id,
    statusz: o.statusz,
    created_at: o.created_at,
    kivant_szallitas: o.kivant_szallitas,
    megjegyzes: o.megjegyzes,
    ceg_nev: cegOf.get(o.customer_id) ?? '(ismeretlen vevő)',
    items: o.order_items.map((i) => ({
      nev: unitOf.get(i.product_unit_id) ?? 'Termék',
      mennyiseg: i.mennyiseg,
      egysegar_brutto: i.egysegar_brutto ?? 0,
    })),
  }))

  const ujCount = view.filter((o) => o.statusz === 'uj').length

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900">Rendelések</h1>
      <p className="mt-1 text-sm text-slate-500">A webshopból beérkezett vevői rendelések.</p>
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
