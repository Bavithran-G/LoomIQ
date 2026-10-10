import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Shell } from './components/Shell'
import { Empty, LoadingBlock } from './components/ui'
import Landing from './pages/Landing'
import Login from './pages/Login'
import PublicRoll from './pages/PublicRoll'

const Overview = lazy(() => import('./pages/Overview'))
const Orders = lazy(() => import('./pages/Orders'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Production = lazy(() => import('./pages/Production'))
const Machines = lazy(() => import('./pages/Machines'))
const Quality = lazy(() => import('./pages/Quality'))
const Rolls = lazy(() => import('./pages/Rolls'))
const Passport = lazy(() => import('./pages/Passport'))
const Dispatch = lazy(() => import('./pages/Dispatch'))
const PackingList = lazy(() => import('./pages/PackingList'))
const Cost = lazy(() => import('./pages/Cost'))
const Insights = lazy(() => import('./pages/Insights'))
const Portal = lazy(() => import('./pages/Portal'))
const Admin = lazy(() => import('./pages/Admin'))

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(perm)) return <Empty title="You don't have access to this page">Your role does not include this module. Ask an administrator if you need it.</Empty>
  return <>{children}</>
}

export default function App() {
  const { user, ready } = useAuth()
  const loc = useLocation()

  if (loc.pathname.startsWith('/r/') && !user && ready) {
    return <Routes><Route path="/r/:rollNo" element={<PublicRoll />} /></Routes>
  }

  if (!ready) return <LoadingBlock rows={6} />

  // If user is not logged in:
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // Direct each role to their natural starting module
  const roleHome: Record<string, string> = {
    buyer: '/portal',
    finance: '/cost',
    storekeeper: '/inventory',
    quality_inspector: '/quality',
    dispatch_operator: '/dispatch',
    production_manager: '/app',
    admin: '/app',
  }
  const home = roleHome[user.role] ?? '/app'

  return (
    <Shell>
      <Suspense fallback={<LoadingBlock rows={8} />}>
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/login" element={<Navigate to={home} replace />} />
          <Route path="/app" element={user.role === 'buyer' ? <Navigate to="/portal" replace /> : (user.role === 'finance' ? <Navigate to="/cost" replace /> : (user.role === 'storekeeper' ? <Navigate to="/inventory" replace /> : (user.role === 'quality_inspector' ? <Navigate to="/quality" replace /> : (user.role === 'dispatch_operator' ? <Navigate to="/dispatch" replace /> : <Guard perm="dashboard.view"><Overview /></Guard>))))} />
          <Route path="/orders" element={<Guard perm="orders.view"><Orders /></Guard>} />
          <Route path="/orders/:id" element={<Guard perm="orders.view"><OrderDetail /></Guard>} />
          <Route path="/inventory" element={<Guard perm="inventory.view"><Inventory /></Guard>} />
          <Route path="/production" element={<Guard perm="production.view"><Production /></Guard>} />
          <Route path="/machines" element={<Guard perm="production.view"><Machines /></Guard>} />
          <Route path="/quality" element={<Guard perm="quality.view"><Quality /></Guard>} />
          <Route path="/rolls" element={<Guard perm="rolls.view"><Rolls /></Guard>} />
          <Route path="/rolls/:ref" element={<Guard perm="rolls.view"><Passport /></Guard>} />
          <Route path="/r/:ref" element={user.role === 'buyer' ? <PublicRoll /> : <Guard perm="rolls.view"><Passport /></Guard>} />
          <Route path="/dispatch" element={<Guard perm="dispatch.view"><Dispatch /></Guard>} />
          <Route path="/dispatch/:id/packing-list" element={<PackingList />} />
          <Route path="/cost" element={<Guard perm="cost.view"><Cost /></Guard>} />
          <Route path="/insights" element={<Guard perm="insights.view"><Insights /></Guard>} />
          <Route path="/portal" element={<Guard perm="portal.view"><Portal /></Guard>} />
          <Route path="/portal/orders/:id" element={<Guard perm="portal.view"><Portal /></Guard>} />
          <Route path="/admin" element={<Guard perm="admin.manage"><Admin /></Guard>} />
          <Route path="*" element={<Empty title="Page not found" action={<a className="text-indigo-thread underline" href={home}>Go to start page</a>}>The address may be mistyped or the record was removed.</Empty>} />
        </Routes>
      </Suspense>
    </Shell>
  )
}
