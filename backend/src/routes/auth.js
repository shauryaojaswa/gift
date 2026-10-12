import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query, withTransaction } from '../db.js'
import { signSession, setSessionCookie, clearSessionCookie, requireAuth } from '../auth.js'
import { isValidEmail } from '../validate.js'

const router = Router()

async function loadMemberships(userId) {
  const { rows } = await query(
    `select m.store_id, m.role, s.slug, s.name, s.status
       from store_members m
       join stores s on s.id = m.store_id
      where m.user_id = $1
      order by m.created_at asc`,
    [userId],
  )
  return rows
}

async function isPlatformAdmin(userId) {
  const { rowCount } = await query('select 1 from platform_admins where user_id = $1', [userId])
  return rowCount > 0
}

router.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const fullName = String(req.body?.fullName ?? '').trim() || null
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })

    const existing = await query('select 1 from profiles where lower(email) = $1', [email])
    if (existing.rowCount > 0) return res.status(409).json({ error: 'An account with this email already exists.' })

    const passwordHash = await bcrypt.hash(password, 10)
    const { rows } = await query(
      'insert into profiles (email, password_hash, full_name) values ($1,$2,$3) returning id, email, full_name, is_platform_admin',
      [email, passwordHash, fullName],
    )
    const user = rows[0]
    setSessionCookie(res, signSession(user))
    res.status(201).json({
      user: { id: user.id, email: user.email, fullName: user.full_name },
      memberships: [],
      isPlatformAdmin: false,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const { rows } = await query(
      'select id, email, full_name, password_hash, is_platform_admin from profiles where lower(email) = $1',
      [email],
    )
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' })
    }
    setSessionCookie(res, signSession(user))
    res.json({
      user: { id: user.id, email: user.email, fullName: user.full_name },
      memberships: await loadMemberships(user.id),
      isPlatformAdmin: await isPlatformAdmin(user.id),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

router.get('/me', async (req, res, next) => {
  try {
    if (!req.user) return res.json({ user: null, memberships: [], isPlatformAdmin: false })
    const { rows } = await query('select id, email, full_name from profiles where id = $1', [req.user.id])
    if (!rows[0]) return res.json({ user: null, memberships: [], isPlatformAdmin: false })
    res.json({
      user: { id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name },
      memberships: await loadMemberships(rows[0].id),
      isPlatformAdmin: await isPlatformAdmin(rows[0].id),
    })
  } catch (error) {
    next(error)
  }
})

export default router
export { loadMemberships, isPlatformAdmin }
