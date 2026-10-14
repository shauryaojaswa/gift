export interface GoogleReviewLink {
  url: string | null
  error: string | null
}

export function configuredGoogleReviewUrl(storeUrl: string | null): GoogleReviewLink {
  const candidate = storeUrl?.trim()
  if (!candidate) {
    return {
      url: null,
      error: 'This store has not configured a Google review link.',
    }
  }

  try {
    const parsed = new URL(candidate)
    const hostname = parsed.hostname.toLowerCase()
    const isGoogleDomain =
      /(^|\.)google\.(com|co\.[a-z]{2}|[a-z]{2,})$/.test(hostname) ||
      hostname === 'g.page' ||
      hostname === 'maps.app.goo.gl' ||
      hostname === 'share.google'

    if (parsed.protocol !== 'https:' || !isGoogleDomain || parsed.username || parsed.password) {
      throw new Error('Invalid Google review URL')
    }

    return { url: parsed.href, error: null }
  } catch {
    return {
      url: null,
      error: 'This store’s Google review link is invalid. Please contact the store.',
    }
  }
}
