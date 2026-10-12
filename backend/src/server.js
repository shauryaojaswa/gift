import express from 'express'
import cookieParser from 'cookie-parser'
import { attachUser } from './auth.js'
import { migrate } from './migrate.js'
import { pool } from './db.js'
import authRouter from './routes/auth.js'
import publicRouter from './routes/public.js'
import ownerRouter from './routes/owner.js'
import adminRouter from './routes/admin.js'
import billingRouter, { webhookRouter } from './routes/billing.js'

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(cookieParser())

// The payment webhook must receive the raw body to verify its signature.
app.use('/api/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRouter)

app.use(express.json({ limit: '1mb' }))
app.use(attachUser)

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('select 1')
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})

app.use('/api/auth', authRouter)
app.use('/api/public', publicRouter)
app.use('/api/owner', ownerRouter)
app.use('/api/owner', billingRouter)
app.use('/api/admin', adminRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// Central error handler: never leak internals or customer data to the client.
app.use((error, _req, res, _next) => {
  console.error('[api]', error.message)
  if (res.headersSent) return
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

const port = Number(process.env.PORT ?? 4000)

migrate()
  .then(() => {
    app.listen(port, '0.0.0.0', () => console.log(`[api] listening on ${port}`))
  })
  .catch((error) => {
    console.error('[api] failed to start:', error.message)
    process.exit(1)
  })
