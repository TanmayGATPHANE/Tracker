import { useEffect, useState } from 'react'
import { APP_VERSION, BUILD_SHA } from '../version.js'
import { api } from '../api.js'

// Short SHA prefix is plenty — we only need enough to tell two builds apart.
const short = (sha) => (sha && sha !== 'dev' && sha !== 'unknown' ? sha.slice(0, 7) : sha)

// Module-level cache. The footer is the only place that ever needs the
// backend version, so we keep one in-flight promise for the whole session
// and reuse it. StrictMode's double-mount in dev would otherwise fire two
// /api/version calls back-to-back.
let cache = null
let inflight = null
function loadVersion() {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = api.getVersion()
    .then(v => { cache = v; inflight = null; return v })
    .catch(e => { inflight = null; throw e })
  return inflight
}

/// Footer that shows the deployed frontend and backend versions.
/// Frontend version is baked in at build time; backend version is fetched
/// from the public /api/version endpoint so we know what's actually running
/// on Render (not what we think we deployed).
export default function VersionFooter() {
  const [be, setBe] = useState(cache)

  useEffect(() => {
    let cancelled = false
    loadVersion()
      .then((v) => { if (!cancelled) setBe(v) })
      .catch(() => { if (!cancelled) setBe({ error: true }) })
    return () => { cancelled = true }
  }, [])

  const beVersion = be && !be.error ? `v${be.version}` : 'v?'
  const beSha     = be && !be.error ? short(be.sha)    : '?'

  return (
    <div className="version-footer" title="Build identifier — confirms which code is running">
      <span className="vf-label">build</span>
      <span className="vf-cell">fe&nbsp;v{APP_VERSION} · {short(BUILD_SHA) || 'dev'}</span>
      <span className="vf-sep">/</span>
      <span className="vf-cell">be&nbsp;{beVersion} · {beSha}</span>
    </div>
  )
}