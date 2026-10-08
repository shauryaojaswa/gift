export interface GoogleReviewLink {
  url: string | null
  error: string | null
}

export const DEFAULT_GOOGLE_REVIEW_URL =
  'https://search.google.com/local/writereview?placeid=ChIJwVPgCwAdwTsR7AHj3vrZvA4'

export function configuredGoogleReviewUrl(storeUrl: string | null): GoogleReviewLink {
  const envUrl = import.meta.env.VITE_GOOGLE_REVIEW_URL?.trim()
  const candidate = envUrl || storeUrl?.trim() || DEFAULT_GOOGLE_REVIEW_URL
  if (!candidate) {
    return {
      url: null,
      error: 'Google review link is not set up yet. Please ask the store administrator to add it in Store Settings or set VITE_GOOGLE_REVIEW_URL.',
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
      error: 'The Google review link is invalid. Please ask the store administrator to check Store Settings or VITE_GOOGLE_REVIEW_URL.',
    }
  }
}
