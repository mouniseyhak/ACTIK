// Mock WebSocket for Node.js
global.WebSocket = class {};

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://xwwddimlqqzdhdaxlglt.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3d2RkaW1scXF6ZGhkYXhsZ2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTMzMjIsImV4cCI6MjA5NjM2OTMyMn0.Uc5C-5HuzU2B_GNx6xT02aqpOQvhJmOuxYo0oSzdaYE"

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspect() {
  const { data, error } = await supabase.from('credentials').insert({
    issuer_id: '00000000-0000-0000-0000-000000000000',
    holder_email: 'test@example.com',
    degree_title: 'Test Degree',
    sd_jwt: 'test_jwt',
    claimed: false,
    encrypted: false
  })
  console.log('credentials test error message:', error?.message)
}

inspect()
