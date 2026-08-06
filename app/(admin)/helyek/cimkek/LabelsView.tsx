'use client'

import { useEffect, useState } from 'react'

export type LabelItem = {
  id: string
  kod: string
  tipusLabel: string
  svg: string
}

type Size = 's' | 'm' | 'l'

const SIZE_OPTIONS: { value: Size; label: string }[] = [
  { value: 's', label: 'Kicsi' },
  { value: 'm', label: 'Közepes' },
  { value: 'l', label: 'Nagy' },
]

const STORAGE_KEY = 'helyek-cimke-meret'

export function LabelsView({ labels }: { labels: LabelItem[] }) {
  const [size, setSize] = useState<Size>('m')

  // A választott méret megjegyzése (böngészőnként).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 's' || saved === 'm' || saved === 'l') setSize(saved)
  }, [])

  function pick(next: Size) {
    setSize(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <span className="text-sm font-medium text-slate-600">Címkeméret:</span>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {SIZE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              aria-pressed={size === o.value}
              className={
                'px-3 py-1.5 text-sm font-medium transition ' +
                (size === o.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50')
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="labels-grid" data-size={size}>
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
