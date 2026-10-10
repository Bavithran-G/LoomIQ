export type StageProgress = { stage: string; done_m: number; pct: number }
export type Metrics = {
  produced_m: number; accepted_m: number; rejected_m: number; rework_m: number; hold_m: number
  pending_inspection_m: number; dispatched_m: number; ready_m: number; remaining_to_weave_m: number
  quality_shortfall_m: number; projected_shortfall_m: number; rejection_rate: number | null
}
export type Order = {
  id: number; order_no: string; buyer_po: string; buyer_id: number; buyer: string; fabric_spec_id: number; fabric: string
  fabric_code: string; colour: string; quantity: number; unit: string; order_date: string; promised_date: string
  priority: string; status: string; hold_reason: string; metrics: Metrics; dispatch_status: string
  progress: StageProgress[]; notes: string; internal_notes?: string; risk?: { band: string; score: number | null } | null
}
export type RiskFactor = { kind: string; points: number; detail: string; rule: string; data: Record<string, unknown> }
export type Risk = {
  order_id: number; order_no: string; buyer?: string; priority?: string; promised_date?: string; band: string
  score: number | null; confidence?: string; factors: RiskFactor[]; summary: string; recommendation: string
  projected_finish?: string | null; assessed_at: string; method?: string; data: Record<string, unknown>
}
export type Requirement = {
  material_id: number; sku: string; name: string; uom: string; qty_per_m: number; required: number; consumed: number
  reserved: number; still_needed: number; free_available: number; on_order: number; shortage: number
}
export type Job = {
  id: number; job_no: string; order_id: number; order_no: string; buyer: string; fabric: string; colour: string
  priority: string; promised_date: string; stage_code: string; machine_id: number | null; machine: string | null
  shift: string; planned_date: string; planned_qty: number; actual_qty: number; status: string; operator: string
  started_at: string | null; completed_at: string | null; delay_reason: string; downtime_min: number
}
export type Roll = {
  id: number; roll_no: string; order_id: number; order_no: string; buyer: string; fabric: string; colour: string
  length_m: number; stage: string; quality: string; location: string; machine: string | null; weaving_job: string | null
  material_lots: string[]; produced_on: string; open_inspection_id?: number | null
}
export type Defect = { type: string; bbox: [number, number, number, number]; area_px: number; score: number; explanation: string }
export type Inspection = {
  id: number; roll_id: number; roll_no: string; order_no: string; method: string; has_image: boolean
  image_width: number | null; image_height: number | null; analysis_version: string; inferred_at: string | null
  suggested_outcome: string | null; suggested_defects: Defect[]; suggested_types: string[]; anomaly_score: number | null
  model_confidence: number | null; analysis_error: string; explanation: string; status: string; decision: string | null
  confirmed_defect: string; reviewer: string | null; reviewed_at: string | null; review_notes: string
  buyer_visible_note: string; created_at: string
}
export type CostBlock = {
  currency: string; unit_estimate: Record<string, number>; estimated: Record<string, number>; estimated_total: number
  actual: Record<string, number>; actual_total: number; accepted_m: number; actual_cost_per_accepted_m: number | null
  estimated_cost_per_m: number
  quality: { rework_cost_actual: number; cost_embedded_in_rejected: number; replacement_estimate: number; note: string }
  entries?: { id: number; category: string; amount: number; source_type: string; source_id: number; description: string; created_at: string }[]
}
export type Material = {
  id: number; sku: string; name: string; material_type: string; colour: string; uom: string; reorder_threshold: number
  standard_cost: number; supplier: string | null; supplier_id: number | null; available: number; reserved: number
  consumed: number; on_order: number; low_stock: boolean
}
export type Machine = {
  id: number; code: string; name: string; stage_code: string; capacity_per_shift: number; state: string; state_note: string
  status: string; status_source: string; current_job: Job | null; downtime_7d_min: number
}
export type Ev = { id: number; type: string; message: string; severity: string; user?: string | null; at: string; order_id?: number | null }
