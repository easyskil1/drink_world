'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanButton } from '@/components/ScanButton'
import { playBeep } from '@/components/beep'
import {
  setOrderStatusAction,
  pickOrderFefoAction,
  pickScanAction,
  issueOrderAction,
  type OrderStatusz,
} from './actions'

export type PickingProduct = { product_nev: string; needed: number; picked: number; done: boolean }
export type OrderView = {
  id: string
  statusz: string
  created_at: string
  kivant_szallitas: string | null
  megjegyzes: string | null
  ceg_nev: string
  items: { nev: string; mennyiseg: number; egysegar_brutto: number }[]
  picking: PickingProduct[]
  fullyPicked: boolean
}

const ft = new Intl.NumberFormat('hu-HU')
const fmtFt = (n: number) => `${ft.format(n)} Ft`

const STATUSZOK: { value: OrderStatusz; label: string }[] = [
  { value: 'uj', label: 'Új' },
  { value: 'visszaigazolt', label: 'Visszaigazolva' },
  { value: 'teljesitve', label: 'Teljesítve' },
  { value: 'torolt', label: 'Törölve' },
]
const STATUSZ_CLS: Record<string, string> = {
  uj: 'bg-blue-50 text-blue-700',
  visszaigazolt: 'bg-emerald-50 text-emerald-700',
  teljesitve: 'bg-slate-100 text-slate-600',
  torolt: 'bg-red-50 text-red-700',
}

function OrderCard({ o }: { o: OrderView }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const total = o.items.reduce((s, i) => s + i.mennyiseg * i.egysegar_brutto, 0)
  const closed = o.statusz === 'teljesitve' || o.statusz === 'torolt'

  async function change(statusz: OrderStatusz) {
    setError(null); setPending(true)
    const res = await setOrderStatusAction(o.id, statusz)
    setPending(false)
    if (res.error) return setError(res.error)
    router.refresh()
  }

  async function autoPick() {
    setError(null); setFlash(null); setPending(true)
    const res = await pickOrderFefoAction(o.id)
    setPending(false)
    if (res.error) return setError(res.error)
    if (res.shortfall && res.shortfall > 0) {
      setError(`FEFO-kigyűjtés: ${res.picked ?? 0} db kigyűjtve, de ${res.shortfall} db hiányzik a betárolt készletből.`)
    } else {
      setFlash(`Kigyűjtve: ${res.picked ?? 0} db.`)
    }
    router.refresh()
  }

  async function onScan(code: string) {
    setError(null)
    const res = await pickScanAction(o.id, code)
    if (res.error) { setError(res.error); return }
    playBeep()
    setFlash(`✓ ${res.product_nev} +${res.picked_base} db`)
    router.refresh()
  }

  async function issue() {
    setError(null); setPending(true)
    const res = await issueOrderAction(o.id)
    setPending(false)
    if (res.error) return setError(res.error)
    setFlash('Kiszállítva, szállítólevél elkészült.')
    router.refresh()
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{o.ceg_nev}</p>
          <p className="text-xs text-slate-500">
            {new Date(o.created_at).toLocaleString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {o.kivant_szallitas ? ` · kért szállítás: ${o.kivant_szallitas}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUSZ_CLS[o.statusz] ?? 'bg-slate-100 text-slate-600'}`}>
            {STATUSZOK.find((s) => s.value === o.statusz)?.label ?? o.statusz}
          </span>
          <select
            value={o.statusz}
            disabled={pending}
            onChange={(e) => change(e.target.value as OrderStatusz)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-60"
          >
            {STATUSZOK.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <ul className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm">
        {o.items.map((it, idx) => (
          <li key={idx} className="flex justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {it.nev} <span className="text-slate-400">× {it.mennyiseg}</span>
            </span>
            <span className="tabular-nums text-slate-500">{fmtFt(it.mennyiseg * it.egysegar_brutto)}</span>
          </li>
        ))}
      </ul>

      {o.megjegyzes && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">Megjegyzés: {o.megjegyzes}</p>
      )}

      <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold text-slate-900">
        <span>Összesen (bruttó)</span>
        <span className="tabular-nums">{fmtFt(total)}</span>
      </div>

      {/* ---- Kigyűjtés ---- */}
      {!closed && o.picking.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Kigyűjtés</span>
            <ScanButton title="Termék vonalkód" allowContinuous onScan={onScan} />
          </div>

          <ul className="flex flex-col gap-1">
            {o.picking.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-slate-700">
                  {p.done ? (
                    <svg className="shrink-0 text-emerald-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-11" /></svg>
                  ) : (
                    <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-slate-300" />
                  )}
                  <span className="truncate">{p.product_nev}</span>
                </span>
                <span className={`shrink-0 tabular-nums ${p.done ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {p.picked} / {p.needed} db
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={autoPick}
              disabled={pending || o.fullyPicked}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              FEFO auto-kigyűjtés
            </button>
            <button
              type="button"
              onClick={issue}
              disabled={pending || !o.fullyPicked}
              title={o.fullyPicked ? '' : 'Előbb gyűjtsd ki az összes tételt'}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              Kiszállítás (kiadás)
            </button>
          </div>
        </div>
      )}

      {flash && <p className="mt-2 text-sm font-medium text-emerald-700">{flash}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </article>
  )
}

export function RendelesekList({ orders }: { orders: OrderView[] }) {
  if (orders.length === 0) {
    return <p className="text-slate-500">Még nincs beérkezett rendelés.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {orders.map((o) => <OrderCard key={o.id} o={o} />)}
    </div>
  )
}
