import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { VevokManager } from './VevokManager'

export type Vevo = {
  id: string
  email: string
  ceg_nev: string | null
  adoszam: string | null
  telefon: string | null
  kapcsolattarto: string | null
  jovahagyva: boolean
  created_at: string
}

export default async function VevokPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [usersRes, custRes] = await Promise.all([
    supabase.rpc('admin_list_users'),
    supabase
      .from('customers')
      .select('id, ceg_nev, adoszam, telefon, kapcsolattarto, jovahagyva, created_at'),
  ])

  const emailOf = new Map(
    ((usersRes.data ?? []) as { id: string; email: string }[]).map((u) => [u.id, u.email])
  )
  const customers: Vevo[] = ((custRes.data ?? []) as Omit<Vevo, 'email'>[])
    .map((c) => ({ ...c, email: emailOf.get(c.id) ?? '' }))
    .sort((a, b) => Number(a.jovahagyva) - Number(b.jovahagyva) || (a.ceg_nev ?? '').localeCompare(b.ceg_nev ?? ''))

  const pending = customers.filter((c) => !c.jovahagyva).length

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900">Vevők</h1>
      <p className="mt-1 text-sm text-slate-500">
        Viszonteladói regisztrációk jóváhagyása. Jóváhagyásig a vevő böngészhet, de
        nem adhat le rendelést.
      </p>
      {pending > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {pending} jóváhagyásra váró vevő.
        </p>
      )}
      <div className="mt-6">
        <VevokManager customers={customers} />
      </div>
    </div>
  )
}
