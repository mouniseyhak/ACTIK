interface RateLimitEntry {
  count: number
  firstRequestTime: number
  resetTime: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number
): Promise<{
  allowed: boolean
  remainingRequests: number
  resetTime: number
}> {
  const key = `${endpoint}:${identifier}`
  const now = Date.now()
  const windowMs = windowMinutes * 60 * 1000
  
  // Get or create entry
  let entry = rateLimitMap.get(key)
  
  if (!entry) {
    // First request in window
    entry = {
      count: 1,
      firstRequestTime: now,
      resetTime: now + windowMs
    }
    rateLimitMap.set(key, entry)
    
    return {
      allowed: true,
      remainingRequests: maxRequests - 1,
      resetTime: entry.resetTime
    }
  }
  
  // Check if window expired
  if (now > entry.resetTime) {
    // Reset the window
    entry.count = 1
    entry.firstRequestTime = now
    entry.resetTime = now + windowMs
    rateLimitMap.set(key, entry)
    
    return {
      allowed: true,
      remainingRequests: maxRequests - 1,
      resetTime: entry.resetTime
    }
  }
  
  // Window still active - increment count
  entry.count++
  
  const allowed = entry.count <= maxRequests
  
  return {
    allowed,
    remainingRequests: Math.max(0, maxRequests - entry.count),
    resetTime: entry.resetTime
  }
}

export function getClientIp(): string | null {
  try {
    return (window as any).clientIp || null
  } catch {
    return null
  }
}

export function cleanupExpiredLimits(): void {
  const now = Date.now()
  
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}

// Run cleanup on app startup (call from App.tsx useEffect)
export function initializeRateLimiting(): void {
  cleanupExpiredLimits()
  
  // Cleanup every 5 minutes
  setInterval(cleanupExpiredLimits, 5 * 60 * 1000)
}
