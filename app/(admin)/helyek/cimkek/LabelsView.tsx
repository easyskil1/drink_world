'use client'

import { useEffect, useState, type CSSProperties } from 'react'

export type LabelItem = {
  id: string
  kod: string
  tipusLabel: string
  svg: string
}

type Meret = { szelesseg: number; qr: number; betu: number }

const DEFAULT: Meret = { szelesseg: 45, qr: 22, betu: 12 }
const STORAGE_KEY = 'helyek-cimke-meret'

export function LabelsView({ labels }: { labels: LabelItem[] }) {
  const [m, setM] = useState<Meret>(DEFAULT)

  // A beállított méretek megjegyzése (böngészőnként).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      if (
        typeof parsed?.szelesseg === 'number' &&
        typeof parsed?.qr === 'number' &&
        typeof parsed?.betu === 'number'
      ) {
        setM(parsed)
      }
    } catch {
      // rossz adat: marad az alapértelmezés
    }
  }, [])

  function update(patch: Partial<Meret>) {
    setM((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const gridStyle = {
    '--label-w': `${m.szelesseg}mm`,
    '--label-qr': `${m.qr}mm`,
    '--label-code': `${m.betu}pt`,
  } as CSSProperties

  const numInput =
    'w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500'
  const field = 'flex items-center gap-1.5 text-sm font-medium text-slate-600'

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <label className={field}>
          Szélesség
          <input
            type="number"
            min={20}
            max={200}
            value={m.szelesseg}
            onChange={(e) => update({ szelesseg: Number(e.target.value) })}
            className={numInput}
          />
          mm
        </label>
        <label className={field}>
          QR méret
          <input
            type="number"
            min={8}
            max={120}
            value={m.qr}
            onChange={(e) => update({ qr: Number(e.target.value) })}
            className={numInput}
          />
          mm
        </label>
        <label className={field}>
          Betűméret
          <input
            type="number"
            min={5}
            max={40}
            value={m.betu}
            onChange={(e) => update({ betu: Number(e.target.value) })}
            className={numInput}
          />
          pt
        </label>
        <button
          type="button"
          onClick={() => update(DEFAULT)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Alaphelyzet
        </button>
      </div>

      <div className="labels-grid" style={gridStyle}>
        {labels.map((l) => (
          <div key={l.id} className="label">
            <div
              className="label-qr"
              dangerouslySetInnerHTML={{ __html: l.svg }}
            />
            <div className="label-text">
              <div className="label-code">{l.kod}</div>
              <div className="label-tipus">{l.tipusLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
