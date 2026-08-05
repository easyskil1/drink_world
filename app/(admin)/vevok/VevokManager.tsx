'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Vevo } from './page'
import { setApprovedAction } from './actions'

function VevoRow({ v }: { v: Vevo }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setError(null)
    setPending(true)
    const res = await setApprovedAction(v.id, !v.jovahagyva)
    setPending(false)
    if (res.error) return setError(res.error)
    router.refresh()
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
          {v.ceg_nev || v.email || 'Névtelen vevő'}
          {v.jovahagyva ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">jóváhagyva</span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">jóváhagyásra vár</span>
          )}
        </p>
        <p className="text-sm text-slate-500">{v.email}</p>
        <p className="text-xs text-slate-400">
          {[v.adoszam && `Adószám: ${v.adoszam}`, v.telefon && `Tel: ${v.telefon}`, v.kapcsolattarto && `Kapcsolat: ${v.kapcsolattarto}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
          v.jovahagyva
            ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            : 'bg-emerald-700 text-white hover:bg-emerald-800'
        }`}
      >
        {pending ? '…' : v.jovahagyva ? 'Jóváhagyás visszavonása' : 'Jóváhagyás'}
      </button>
    </li>
  )
}

export function VevokManager({ customers }: { customers: Vevo[] }) {
  if (customers.length === 0) {
    return <p className="text-slate-500">Még nincs regisztrált vevő.</p>
  }
  return (
    <ul className="flex flex-col gap-3">
      {customers.map((v) => (
        <VevoRow key={v.id} v={v} />
      ))}
    </ul>
  )
}
