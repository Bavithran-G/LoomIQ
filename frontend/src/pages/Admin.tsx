import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import type { User } from '../lib/auth'
import { Badge, Button, Field, Input, LoadingBlock, Modal, Notice, PageHeader, Panel, Select, TableWrap, Tabs, useToast } from '../components/ui'
import { ROLES, money2 } from '../lib/format'

type Stage = { id: number; code: string; name: string; sequence: number; active: boolean; job_based: boolean }
type Spec = { id: number; code: string; name: string; construction: string; gsm: number; width_cm: number; labour_cost_per_m: number; processing_cost_per_m: number; rework_cost_per_m: number; materials: { sku: string; qty_per_m: number; standard_cost: number }[] }

export default function Admin() {
  const [tab, setTab] = useState<'users' | 'roles' | 'stages' | 'specs'>('users')
  return (
    <div>
      <PageHeader title="Administration" subtitle="Users, role permissions, production stages and fabric specifications." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'users', label: 'Users' }, { value: 'roles', label: 'Roles and permissions' }, { value: 'stages', label: 'Production stages' }, { value: 'specs', label: 'Fabric specs' }]} />
      <div className="mt-4">{tab === 'users' ? <Users /> : tab === 'roles' ? <Roles /> : tab === 'stages' ? <Stages /> : <Specs />}</div>
    </div>
  )
}

function Users() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/admin/users') })
  const [open, setOpen] = useState(false)
  const toggle = useMutation({
    mutationFn: (u: User) => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('ok', 'User updated') },
    onError: (e) => toast('bad', (e as Error).message),
  })
  if (isLoading) return <LoadingBlock />
  return (
    <Panel bodyClass="p-0" actions={<Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>Add user</Button>} title="Users">
      <TableWrap><table className="data-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Buyer</th><th>Status</th><th /></tr></thead>
        <tbody>{data?.map((u) => <tr key={u.id}><td>{u.full_name}</td><td>{u.username}</td><td>{ROLES[u.role]}</td><td>{u.buyer_name ?? '–'}</td>
          <td><Badge tone={u.is_active ? 'ok' : 'neutral'}>{u.is_active ? 'Active' : 'Disabled'}</Badge></td>
          <td className="text-right"><Button size="sm" variant="ghost" onClick={() => toggle.mutate(u)}>{u.is_active ? 'Disable' : 'Enable'}</Button></td></tr>)}</tbody></table></TableWrap>
      {open && <NewUser onClose={() => setOpen(false)} />}
    </Panel>
  )
}

function NewUser({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<{ buyers: { id: number; name: string }[] }>('/api/reference') })
  const [f, setF] = useState({ username: '', full_name: '', password: '', role: 'quality_inspector', buyer_id: 0 })
  const m = useMutation({
    mutationFn: () => api('/api/admin/users', { body: { ...f, buyer_id: f.role === 'buyer' ? f.buyer_id : null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('ok', `User ${f.username} added`); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const valid = /^[a-z0-9_.]{3,}$/.test(f.username) && f.full_name.length > 1 && f.password.length >= 8 && (f.role !== 'buyer' || f.buyer_id)
  return (
    <Modal open onClose={onClose} title="Add user" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={m.isPending} onClick={() => m.mutate()}>Add user</Button></>}>
      <div className="grid gap-3">
        <Field label="Full name">{(id) => <Input id={id} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
        <Field label="Username" hint="Lowercase letters, numbers, dots and underscores">{(id) => <Input id={id} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} />}</Field>
        <Field label="Temporary password" hint="At least 8 characters">{(id) => <Input id={id} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
        <Field label="Role">{(id) => <Select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        {f.role === 'buyer' && <Field label="Buyer company">{(id) => <Select id={id} value={f.buyer_id} onChange={(e) => setF({ ...f, buyer_id: Number(e.target.value) })}><option value={0}>Select buyer</option>{ref.data?.buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}</Field>}
      </div>
    </Modal>
  )
}

function Roles() {
  const { data } = useQuery({ queryKey: ['roles'], queryFn: () => api<{ role: string; permissions: string[] }[]>('/api/admin/roles') })
  const all = [...new Set(data?.flatMap((r) => r.permissions) ?? [])].sort()
  return (
    <Panel bodyClass="p-0" title="Permission matrix" subtitle="Enforced by the API on every request, not only in the menu.">
      <TableWrap><table className="data-table min-w-[900px]"><thead><tr><th>Permission</th>{data?.map((r) => <th key={r.role} className="text-center">{ROLES[r.role]}</th>)}</tr></thead>
        <tbody>{all.map((p) => <tr key={p}><td className="font-medium">{p}</td>{data?.map((r) => <td key={r.role} className="text-center">{r.permissions.includes(p) ? <span className="text-ok" aria-label="allowed">●</span> : <span className="text-line-strong" aria-label="not allowed">·</span>}</td>)}</tr>)}</tbody></table></TableWrap>
    </Panel>
  )
}

function Stages() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['stages'], queryFn: () => api<Stage[]>('/api/production/stages') })
  const m = useMutation({
    mutationFn: (s: Stage) => api(`/api/admin/stages/${s.id}`, { method: 'PATCH', body: { active: !s.active } }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Stage updated') },
    onError: (e) => toast('bad', (e as Error).message),
  })
  return (
    <Panel title="Production route" subtitle="Rolls move through active stages in this order. Weaving and inspection are always on.">
      <Notice className="mb-3">Spinning is off by default because Everest buys yarn. Turning dyeing off sends woven rolls straight to inspection (for greige orders).</Notice>
      <ol className="divide-y divide-line rounded-md border border-line">
        {data?.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-6 text-ink-3">{i + 1}</span><span className="flex-1 font-medium">{s.name}</span>
            {!s.job_based && <Badge>Roll-based</Badge>}
            <Badge tone={s.active ? 'ok' : 'neutral'}>{s.active ? 'Active' : 'Off'}</Badge>
            <Button size="sm" variant="ghost" disabled={['weaving', 'inspection'].includes(s.code)} onClick={() => m.mutate(s)}>{s.active ? 'Turn off' : 'Turn on'}</Button>
          </li>))}
      </ol>
    </Panel>
  )
}

function Specs() {
  const { data } = useQuery({ queryKey: ['specs'], queryFn: () => api<Spec[]>('/api/admin/fabric-specs') })
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data?.map((s) => (
        <Panel key={s.id} title={`${s.code} · ${s.name}`} subtitle={`${s.construction} · ${s.gsm} gsm · ${s.width_cm} cm`}>
          <table className="data-table"><thead><tr><th>Material</th><th className="num">Per metre</th><th className="num">Std cost</th></tr></thead>
            <tbody>{s.materials.map((m) => <tr key={m.sku}><td>{m.sku}</td><td className="num">{m.qty_per_m} kg</td><td className="num">{money2(m.standard_cost)}</td></tr>)}</tbody></table>
          <p className="mt-2 text-[13px] text-ink-2">Labour {money2(s.labour_cost_per_m)}/m · processing {money2(s.processing_cost_per_m)}/m · rework {money2(s.rework_cost_per_m)}/m</p>
        </Panel>))}
    </div>
  )
}
