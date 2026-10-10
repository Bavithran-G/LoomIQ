import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Bell, Boxes, ChevronsLeft, ChevronsRight, ClipboardList, Cog, Factory, Gauge, IndianRupee, LineChart, LogOut, Menu,
  QrCode, ScanSearch, Search, ShieldCheck, Truck, Users, X,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { ROLES, ago } from '../lib/format'
import { Wordmark } from './brand'

export const NAV = [
  { to: '/app', label: 'Command Centre', icon: Gauge, perm: 'dashboard.view' },
  { to: '/orders', label: 'Sales Orders', icon: ClipboardList, perm: 'orders.view' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory.view' },
  { to: '/production', label: 'Production Planning', icon: Factory, perm: 'production.view' },
  { to: '/machines', label: 'Machine Monitoring', icon: Cog, perm: 'production.view' },
  { to: '/quality', label: 'Quality Inspection', icon: ScanSearch, perm: 'quality.view' },
  { to: '/rolls', label: 'Roll Traceability', icon: QrCode, perm: 'rolls.view' },
  { to: '/dispatch', label: 'Dispatch', icon: Truck, perm: 'dispatch.view' },
  { to: '/cost', label: 'Cost Intelligence', icon: IndianRupee, perm: 'cost.view' },
  { to: '/insights', label: 'Insights & Reports', icon: LineChart, perm: 'insights.view' },
  { to: '/portal', label: 'Buyer Portal', icon: Users, perm: 'portal.view' },
  { to: '/admin', label: 'Administration', icon: ShieldCheck, perm: 'admin.manage' },
]

/** Modules each role primarily uses — shown as role-specific welcome tiles. */
export const ROLE_MODULES: Record<string, string[]> = {
  admin: ['Command Centre', 'Sales Orders', 'Inventory', 'Production Planning', 'Quality Inspection', 'Dispatch', 'Cost Intelligence', 'Administration'],
  production_manager: ['Command Centre', 'Sales Orders', 'Production Planning', 'Machine Monitoring', 'Quality Inspection', 'Roll Traceability', 'Insights & Reports'],
  storekeeper: ['Inventory', 'Sales Orders', 'Roll Traceability', 'Production Planning'],
  quality_inspector: ['Quality Inspection', 'Roll Traceability', 'Sales Orders'],
  dispatch_operator: ['Dispatch', 'Roll Traceability', 'Sales Orders'],
  finance: ['Cost Intelligence', 'Insights & Reports', 'Sales Orders', 'Command Centre'],
  buyer: ['Buyer Portal'],
}

type Ev = { id: number; message: string; severity: string; at: string; order_id: number | null }

function useClickAway(ref: React.RefObject<HTMLElement | null>, fn: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fn() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, fn])
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('loomiq.nav') === '1' } catch { return false } })
  const [mobile, setMobile] = useState(false)
  const loc = useLocation()
  useEffect(() => setMobile(false), [loc.pathname])
  useEffect(() => { try { localStorage.setItem('loomiq.nav', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])
  const items = NAV.filter((n) => can(n.perm))
  const current = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))

  const nav = (isMobile: boolean) => (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3" aria-label="Main">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} title={collapsed && !isMobile ? n.label : undefined}
          className={({ isActive }) => clsx('flex h-10 items-center gap-3 rounded-md px-3 text-[14.5px] transition-colors',
            isActive ? 'bg-white/12 font-medium text-white' : 'text-[#b9c6dd] hover:bg-white/6 hover:text-white')}>
          {({ isActive }) => (<>
            <n.icon className={clsx('size-[18px] shrink-0', isActive ? 'text-[#2BB3A3]' : '')} aria-hidden />
            {(!collapsed || isMobile) && <span className="truncate">{n.label}</span>}
          </>)}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className={clsx('no-print sticky top-0 hidden h-screen shrink-0 flex-col bg-indigo-loom lg:flex', collapsed ? 'w-[68px]' : 'w-[244px]')}>
        <div className={clsx('flex h-14 items-center border-b border-white/10', collapsed ? 'justify-center' : 'px-4')}>
          <Link to="/" aria-label="LoomIQ home">{collapsed ? <Wordmark light className="[&>span:last-child]:hidden" /> : <Wordmark light />}</Link>
        </div>
        {nav(false)}
        <button onClick={() => setCollapsed((c) => !c)} className="m-2 flex h-9 items-center justify-center gap-2 rounded-md text-[13px] text-[#b9c6dd] hover:bg-white/6 hover:text-white" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
        </button>
      </aside>
      {/* mobile drawer */}
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-indigo-deep/50" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-indigo-loom">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <Wordmark light />
              <button onClick={() => setMobile(false)} className="p-1 text-white" aria-label="Close navigation"><X className="size-5" /></button>
            </div>
            {nav(true)}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5">
          <button className="rounded p-1.5 text-ink-2 hover:bg-sunk lg:hidden" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] text-ink-3">Everest Textile Mills{current && current.to !== '/' ? ` / ${current.label}` : ''}</div>
            <div className="truncate font-display text-[17px] leading-tight font-semibold text-indigo-loom">{current?.label ?? 'LoomIQ'}</div>
          </div>
          {user?.role !== 'buyer' && <GlobalSearch />}
          {can('dashboard.view') && <Notifications />}
          <UserMenu name={user?.full_name ?? ''} role={ROLES[user?.role ?? ''] ?? ''} onLogout={logout} />
        </header>
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-3 py-5 sm:px-5 lg:px-6">{children}</main>
      </div>
    </div>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const { can } = useAuth()
  useClickAway(ref, () => setOpen(false))
  const term = q.trim()
  const orders = useQuery({
    queryKey: ['search-orders', term], enabled: term.length >= 2 && can('orders.view'),
    queryFn: () => api<{ id: number; order_no: string; buyer: string; fabric: string }[]>(`/api/orders?q=${encodeURIComponent(term)}`),
  })
  const rolls = useQuery({
    queryKey: ['search-rolls', term], enabled: term.length >= 2 && can('rolls.view'),
    queryFn: () => api<{ id: number; roll_no: string; order_no: string; quality: string }[]>(`/api/rolls?q=${encodeURIComponent(term)}`),
  })
  const go = (to: string) => { setOpen(false); setQ(''); nav(to) }
  return (
    <div ref={ref} className="relative hidden md:block">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-3" aria-hidden />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Search orders, buyers, rolls" aria-label="Search orders, buyers and rolls"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const o = orders.data?.[0]; const r = rolls.data?.[0]
            if (/^RL-/i.test(term) && r) go(`/rolls/${r.roll_no}`)
            else if (o) go(`/orders/${o.id}`)
            else if (r) go(`/rolls/${r.roll_no}`)
          }
          if (e.key === 'Escape') setOpen(false)
        }}
        className="h-9 w-64 rounded-md border border-line bg-sunk pr-3 pl-8 text-sm focus:border-indigo-thread focus:bg-surface focus:outline-none xl:w-80" />
      {open && term.length >= 2 && (
        <div className="absolute right-0 mt-1 w-96 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          {(orders.data ?? []).slice(0, 5).map((o) => (
            <button key={o.id} onClick={() => go(`/orders/${o.id}`)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sunk">
              <span className="font-medium">{o.order_no}</span><span className="truncate text-ink-3">{o.buyer} · {o.fabric}</span>
            </button>
          ))}
          {(rolls.data ?? []).slice(0, 5).map((r) => (
            <button key={r.id} onClick={() => go(`/rolls/${r.roll_no}`)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sunk">
              <span className="font-medium">{r.roll_no}</span><span className="text-ink-3">{r.order_no}</span>
            </button>
          ))}
          {!orders.isFetching && !rolls.isFetching && !(orders.data?.length || rolls.data?.length) && (
            <p className="px-3 py-3 text-sm text-ink-3">No orders or rolls match “{term}”.</p>
          )}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickAway(ref, () => setOpen(false))
  const nav = useNavigate()
  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api<Ev[]>('/api/events?limit=30'), refetchInterval: 30000 })
  const important = (data ?? []).filter((e) => e.severity === 'critical' || e.severity === 'warning')
  const [seen, setSeen] = useState(() => { try { return Number(localStorage.getItem('loomiq.seen') ?? 0) } catch { return 0 } })
  const unread = important.filter((e) => e.id > seen).length
  const toggle = () => {
    setOpen((o) => !o)
    if (!open && important[0]) { setSeen(important[0].id); try { localStorage.setItem('loomiq.seen', String(important[0].id)) } catch { /* ignore */ } }
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} className="relative rounded-md p-2 text-ink-2 hover:bg-sunk" aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10.5px] font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          <div className="border-b border-line px-3 py-2 font-display font-semibold text-indigo-loom">Warnings and critical events</div>
          <div className="max-h-96 overflow-y-auto">
            {important.length === 0 && <p className="p-3 text-sm text-ink-3">Nothing needs attention.</p>}
            {important.slice(0, 15).map((e) => (
              <button key={e.id} onClick={() => { setOpen(false); if (e.order_id) nav(`/orders/${e.order_id}`) }}
                className="flex w-full gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-sunk">
                <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', e.severity === 'critical' ? 'bg-bad' : 'bg-warn')} />
                <span className="min-w-0 flex-1"><span className="block">{e.message}</span><span className="text-[12px] text-ink-3">{ago(e.at)}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserMenu({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickAway(ref, () => setOpen(false))
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('')
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-sunk" aria-label="User menu" aria-expanded={open}>
        <span className="grid size-8 place-items-center rounded-full bg-indigo-loom text-[13px] font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13.5px] font-medium">{name}</span>
          <span className="block text-[12px] text-ink-3">{role}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-xl">
          <div className="px-3 py-2 text-sm sm:hidden"><div className="font-medium">{name}</div><div className="text-ink-3">{role}</div></div>
          <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sunk"><LogOut className="size-4" /> Sign out</button>
        </div>
      )}
    </div>
  )
}
