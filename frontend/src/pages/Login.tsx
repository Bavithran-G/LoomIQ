import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, Notice } from '../components/ui'
import { Wordmark } from '../components/brand'
import { ROLES } from '../lib/format'
import KineticGrid from '../components/ui/kinetic-grid'

/* ─── Demo accounts ─────────────────────────────────────────── */
const DEMO = [
  ['admin', 'admin'],
  ['pm.ravi', 'production_manager'],
  ['store.meena', 'storekeeper'],
  ['qc.anitha', 'quality_inspector'],
  ['dispatch.karthik', 'dispatch_operator'],
  ['finance.priya', 'finance'],
  ['buyer.cae', 'buyer'],
  ['buyer.nhl', 'buyer'],
]

/* ─── Main page ─────────────────────────────────────────────── */
export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (username = u, password = p) => {
    setErr(null)
    if (!username || !password) { setErr('Enter your username and password.'); return }
    setBusy(true)
    try {
      const user = await login(username.trim().toLowerCase(), password)
      nav(user.role === 'buyer' ? '/portal' : '/', { replace: true })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');

        .login-root {
          display: grid;
          grid-template-columns: 60% 40%;
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
        }
        .yarn-panel {
          position: relative;
          overflow: hidden;
          min-width: 0;
        }
        .yarn-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 50%, rgba(20,40,75,0.4) 0%, rgba(9,14,23,0.85) 100%);
          pointer-events: none;
          z-index: 1;
        }
        .yarn-content {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 3rem 4rem;
          pointer-events: none;
          z-index: 2;
        }
        .yarn-headline {
          font-family: 'Manrope', sans-serif;
          font-size: clamp(2.5rem, 4vw, 3.5rem);
          font-weight: 800;
          line-height: 1.05;
          color: #ffffff;
          max-width: 600px;
          text-shadow: 0 4px 32px rgba(0,0,0,0.8);
          letter-spacing: -0.02em;
          margin-bottom: 1.25rem;
        }
        .yarn-sub {
          font-family: 'Inter', sans-serif;
          font-size: 1.1rem;
          color: #a8bdd8;
          max-width: 500px;
          line-height: 1.6;
          text-shadow: 0 2px 12px rgba(0,0,0,0.6);
        }
        .yarn-footer {
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          color: rgba(143,166,204,0.6);
        }
        .login-panel {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 3rem;
          background: #ffffff;
          overflow-y: auto;
          box-shadow: -20px 0 40px rgba(0,0,0,0.25);
          z-index: 10;
        }
        .login-box {
          width: 100%;
          max-width: 380px;
        }
        
        /* Typography Expansion on Hover */
        .expand-on-hover {
          transition: letter-spacing 0.3s ease, color 0.3s ease;
        }
        .expand-on-hover:hover {
          letter-spacing: 0.05em;
        }

        .login-title {
          font-family: 'Manrope', sans-serif;
          font-size: 32px;
          font-weight: 800;
          color: #13294b;
          margin: 0 0 6px 0;
          letter-spacing: -0.03em;
        }
        
        .login-sub {
          font-family: 'Inter', sans-serif;
          font-size: 14.5px;
          color: #6b7a8d;
          margin: 0 0 2rem 0;
        }
        .login-form-area {
          font-family: 'Inter', sans-serif;
        }
        .demo-box {
          margin-top: 2rem;
          border-radius: 12px;
          border: 1px solid #e1e6ed;
          background: #f8fafc;
          padding: 16px;
        }
        .demo-label {
          font-family: 'Inter', sans-serif;
          font-size: 11.5px;
          font-weight: 700;
          color: #8fa6cc;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .demo-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .demo-btn {
          background: #ffffff;
          border: 1px solid #e1e6ed;
          border-radius: 8px;
          padding: 8px 10px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Inter', sans-serif;
        }
        .demo-btn:hover { 
          background: #f1f5f9; 
          border-color: #cbd5e1;
          transform: translateY(-1px);
        }
        
        /* Expand letter spacing of demo button names on hover */
        .demo-btn:hover .demo-btn-name {
          letter-spacing: 0.03em;
        }

        .demo-btn-name {
          display: block;
          font-size: 13.5px;
          font-weight: 600;
          color: #1a2333;
          transition: letter-spacing 0.3s ease;
        }
        .demo-btn-role {
          display: block;
          font-size: 11.5px;
          color: #75808f;
          margin-top: 2px;
        }
        .divider-line {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 2rem 0;
        }

        @media (max-width: 992px) {
          .login-root {
            grid-template-columns: 1fr;
            grid-template-rows: 350px 1fr;
          }
          .yarn-panel { min-height: 350px; }
          .yarn-headline { font-size: 2rem; }
          .yarn-content { padding: 2rem; }
          .login-panel { padding: 2rem; }
        }
      `}</style>

      <div className="login-root">
        {/* ── LEFT: 60% — Kinetic Grid Background ───────────────────── */}
        <div className="yarn-panel">
          <KineticGrid globalColor="default">
            <div className="yarn-overlay" />
            <div className="yarn-content">
              <Wordmark light />
              <div>
                <h1 className="yarn-headline">
                  Every roll traceable.<br />Every order visible.<br />Every decision informed.
                </h1>
                <p className="yarn-sub">
                  One shared record from yarn receipt to dispatch — stock, looms,
                  inspection, rolls and cost for Everest Textile Mills.
                </p>
              </div>
              <p className="yarn-footer">
                Machine status in this demo is derived from job records, not live sensors.
              </p>
            </div>
          </KineticGrid>
        </div>

        {/* ── RIGHT: 40% — Refined Login Form ──────────────────────── */}
        <div className="login-panel">
          <div className="login-box">
            <div className="login-form-area">
              <Wordmark className="mb-8 lg:hidden" />
              <h2 className="login-title expand-on-hover">Sign in</h2>
              <p className="login-sub expand-on-hover">Access your mill operations account.</p>

              <form className="space-y-4.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
                <Field label="Username">
                  {(id) => (
                    <Input
                      id={id}
                      autoComplete="username"
                      value={u}
                      onChange={(e) => setU(e.target.value)}
                      autoFocus
                      style={{ fontFamily: 'Inter, sans-serif', height: 44 }}
                    />
                  )}
                </Field>
                <Field label="Password">
                  {(id) => (
                    <Input
                      id={id}
                      type="password"
                      autoComplete="current-password"
                      value={p}
                      onChange={(e) => setP(e.target.value)}
                      style={{ fontFamily: 'Inter, sans-serif', height: 44 }}
                    />
                  )}
                </Field>
                {err && <Notice tone="bad">{err}</Notice>}
                <div className="pt-2">
                  <Button
                    variant="primary"
                    type="submit"
                    loading={busy}
                    className="w-full expand-on-hover shadow-md shadow-indigo-loom/20 hover:shadow-lg transition-shadow"
                    style={{ fontFamily: 'Inter, sans-serif', height: 46, fontSize: '15px' }}
                  >
                    Sign in
                  </Button>
                </div>
              </form>

              <hr className="divider-line" />

              <div className="demo-box">
                <p className="demo-label expand-on-hover">Quick demo accounts (PW: loomiq@2026)</p>
                <div className="demo-grid">
                  {DEMO.map(([name, role]) => (
                    <button
                      key={name}
                      type="button"
                      className="demo-btn"
                      onClick={() => { setU(name); setP('loomiq@2026'); submit(name, 'loomiq@2026') }}
                    >
                      <span className="demo-btn-name">{name}</span>
                      <span className="demo-btn-role">{ROLES[role]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
