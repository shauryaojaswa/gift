import jwt from 'jsonwebtoken'
import { query } from './db.js'

export const SESSION_COOKIE = 'gift_session'
const TOKEN_TTL = '30d'

function secret() {
  const value = process.env.JWT_SECRET
  if (!value) throw new Error('JWT_SECRET is not configured')
  return value
}

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, platformAdmin: Boolean(user.is_platform_admin) },
    secret(),
    { expiresIn: TOKEN_TTL },
  )
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** Attach req.user when a valid session cookie is present. Never rejects. */
export function attachUser(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (!token) return next()
  try {
    const payload = jwt.verify(token, secret())
    req.user = { id: payload.sub, email: payload.email }
  } catch {
    /* invalid or expired token: treat as anonymous */
  }
  next()
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  next()
}

export function requirePlatformAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  query('select 1 from platform_admins where user_id = $1', [req.user.id])
    .then((result) => {
      if (result.rowCount === 0) {
        return res.status(403).json({ error: 'Platform administrator access required' })
      }
      req.isPlatformAdmin = true
      next()
    })
    .catch(next)
}

/**
 * Resolve the caller's membership for a store, or null.
 * Every store-scoped route goes through this so tenancy is enforced server-side.
 */
export async function getMembership(userId, storeId) {
  const { rows } = await query(
    'select role from store_members where user_id = $1 and store_id = $2',
    [userId, storeId],
  )
  return rows[0] ?? null
}

export async function requireStoreMember(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  try {
    const membership = await getMembership(req.user.id, req.params.storeId)
    if (!membership) return res.status(403).json({ error: 'You do not have access to this store' })
    req.membership = membership
    next()
  } catch (error) {
    next(error)
  }
}

export function requireStoreOwner(req, res, next) {
  if (!req.membership || req.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the store owner can perform this action' })
  }
  next()
}
