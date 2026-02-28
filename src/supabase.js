import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xwjskbhmwdeadgepsbns.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3anNrYmhtd2RlYWRnZXBzYm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTk1ODksImV4cCI6MjA4NzUzNTU4OX0.sycZpTy4VzFsOvHUjPZgvGG1BKO2d5DodgSklwDGeII'

export const supabase = createClient(supabaseUrl, supabaseKey)