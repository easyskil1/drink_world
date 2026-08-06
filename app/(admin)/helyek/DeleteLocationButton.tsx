'use client'

import { useState, useTransition } from 'react'
import { deleteLocation } from './actions'

export function DeleteLocationButton({
  id,
  kod,
}: {
  id: string
  kod: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!confirm(`Biztosan törlöd a(z) "${kod}" tárhelyet?`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteLocation(id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? 'Törlés…' : 'Törlés'}
      </button>
      {error && (
        <span className="w-full text-sm text-red-600" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
