import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://eraxxsshqefrabhzekfz.supabase.co'
const supabaseKey = 'sb_publishable_8DYwvNCN5YxmXo87eXsubg_RbBUBD66'

export const supabase = createClient(supabaseUrl, supabaseKey)
