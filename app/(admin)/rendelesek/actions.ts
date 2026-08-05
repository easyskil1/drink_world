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
