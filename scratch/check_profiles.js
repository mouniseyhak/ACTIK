// Define a mock WebSocket class to bypass Supabase realtime client environment check in Node.js
global.WebSocket = class {};

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://xwwddimlqqzdhdaxlglt.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3d2RkaW1scXF6ZGhkYXhsZ2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTMzMjIsImV4cCI6MjA5NjM2OTMyMn0.Uc5C-5HuzU2B_GNx6xT02aqpOQvhJmOuxYo0oSzdaYE"

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
  
  if (error) {
    console.error('Error fetching profiles:', error)
  } else {
    console.log('Profiles list:')
    console.table(data)
  }
}

check()
