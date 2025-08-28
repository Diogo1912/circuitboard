const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

app.post('/api/chat', async (req, res) => {
  try {
    // Optionally allow passing key from client header for dev
    const headerKey = req.get('X-API-Key')
    const key = headerKey || OPENAI_API_KEY
    if (!key) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })
    const body = req.body || {}
    const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const text = await r.text()
      return res.status(r.status).json({ error: 'openai_error', detail: text })
    }
    const data = await r.json()
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: 'proxy_failed' })
  }
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: Boolean(OPENAI_API_KEY), baseUrl: OPENAI_BASE_URL })
})

const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`backend listening on http://localhost:${port}`)
})


