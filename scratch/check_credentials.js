// Define a mock WebSocket class to bypass Supabase realtime client environment check in Node.js
global.WebSocket = class {};

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://xwwddimlqqzdhdaxlglt.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3d2RkaW1scXF6ZGhkYXhsZ2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTMzMjIsImV4cCI6MjA5NjM2OTMyMn0.Uc5C-5HuzU2B_GNx6xT02aqpOQvhJmOuxYo0oSzdaYE"

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data: creds, error: err1 } = await supabase
    .from('credentials')
    .select('*')
  
  const { data: pending, error: err2 } = await supabase
    .from('pending_credentials')
    .select('*')

  console.log('--- credentials table ---')
  if (err1) console.error(err1)
  else console.table(creds)

  console.log('--- pending_credentials table ---')
  if (err2) console.error(err2)
  else console.table(pending)
}

check()
