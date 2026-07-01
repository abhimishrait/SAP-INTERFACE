// Spec section 4.1: flexible status mapping.

// Returns boolean (Active=true / Inactive=false) or null when unrecognized.
function toBool(v) {
  if (v === true || v === false) return v;
  if (v === 1 || v === 0) return v === 1;
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (['Y', '1', 'A', 'APPROVED', 'TRUE', 'ACTIVE'].includes(s)) return true;
  if (['N', '0', 'T', 'TERMINATED', 'FALSE', 'INACTIVE'].includes(s)) return false;
  return null;
}

// Order Status Sync (3.16) — normalize to DMS sales_orders.status enum.
// The DMS uses LOWERCASE tokens (draft/initiated/forwarded/approved/
// partially_delivered/delivered/closed/cancelled) — see
// apps.orders.models.SalesOrder.STATUS_CHOICES. Writing uppercase
// silently falls through to grey / default pill styling in the FE.
function toOrderStatus(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (['CANCEL', 'CANCELLED', 'CANCELED'].includes(s)) return 'cancelled';
  if (['CLOSE', 'CLOSED', 'COMPLETED'].includes(s)) return 'closed';
  if (['OPEN', 'PENDING', 'APPROVED'].includes(s)) return 'approved';
  return null;
}

module.exports = { toBool, toOrderStatus };
