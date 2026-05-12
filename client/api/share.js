// Vercel serverless function: /api/share?join=XXXXXX
// Returns HTML with dynamic OG meta tags so link previews (iMessage, WhatsApp, etc.)
// show "Blokus Trigon Online: Room XXXXXX", then redirects real users to the app.
export default function handler(req, res) {
  const rawCode = req.query.join || ''
  // Sanitize: only allow alphanumeric + hyphens, max 12 chars
  const roomCode = rawCode.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12).toUpperCase()

  const host = (req.headers.host || 'localhost:5173').replace(/[^a-zA-Z0-9.\-:]/g, '')
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const origin = `${protocol}://${host}`

  if (!roomCode) {
    res.redirect(302, '/')
    return
  }

  const title = `Blokus Trigon Online: Room ${roomCode}`
  const description = 'Join a Blokus Trigon game! Enter the room code to play.'
  const imageUrl = `${origin}/og-image.png`
  const joinUrl = `${origin}/?join=${roomCode}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta property="og:type" content="website">
  <meta property="og:url" content="${joinUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta http-equiv="refresh" content="0;url=${joinUrl}">
  <script>window.location.replace('${joinUrl}')</script>
</head>
<body>
  <p>Joining game… <a href="${joinUrl}">Click here if not redirected.</a></p>
</body>
</html>`)
}
