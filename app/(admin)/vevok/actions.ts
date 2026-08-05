'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function setApprovedAction(
  id: string,
  jovahagyva: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()
  // Admin session -> is_staff() igaz, a guard trigger engedi a jovahagyva váltást.
  const { error } = await supabase.from('customers').update({ jovahagyva }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/vevok')
  return {}
}
