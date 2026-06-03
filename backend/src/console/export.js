// /console/export — download sap_sync_logs (multi-module SAP traffic) in CSV, NDJSON, or XLSX.
//   ?hours=24       (default 24, max 720 = 30d)
//   ?format=xlsx    (default; or "csv" / "ndjson")
//   ?module=foo     (optional module_id filter)
//
// XLSX output is a real Excel workbook (exceljs) with:
//   - Sheet 1 "Summary"      — totals + per-module breakdown
//   - Sheet 2 "Transactions" — frozen header, colored status, NPT timestamps
const express = require('express');
const ExcelJS = require('exceljs');
const { query } = require('../db');

const router = express.Router();

const FIELDS = [
  'id', 'correlation_id', 'direction', 'module_id', 'method', 'path', 'resource_id',
  'status_code', 'pipeline_stage', 'error_message',
  'duration_ms', 'bytes_in', 'bytes_out', 'retry_count',
  'distributor_name', 'customer_code', 'doc_number',
  'remote_ip', 'created_at',
];

const NPT_TZ = 'Asia/Kathmandu';
function fmtNpt(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  // "sv-SE" formatter happens to render "YYYY-MM-DD HH:MM:SS" cleanly.
  return date.toLocaleString('sv-SE', { timeZone: NPT_TZ, hour12: false });
}

function csvValue(v, field) {
  if (v === null || v === undefined) return '';
  if (field === 'created_at') return fmtNpt(v);
  if (v instanceof Date) return fmtNpt(v);
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function fetchRows(hours, moduleFilter) {
  const params = [hours];
  let where = `WHERE module_id IS NOT NULL AND created_at >= NOW() - INTERVAL ? HOUR`;
  if (moduleFilter) { where += ` AND module_id = ?`; params.push(moduleFilter); }
  return query(
    `SELECT ${FIELDS.join(', ')}
       FROM sap_sync_logs
       ${where}
       ORDER BY created_at DESC`,
    params
  );
}

// ----- XLSX builder -----

const BRAND = {
  orange: 'FFE9821F',  // var(--orange)
  teal:   'FF22A186',  // var(--teal)
  amber:  'FFE8B96A',
  red:    'FFD0594F',
  ink0:   'FF1E1E1E',
  ink2:   'FF6B7280',
  bg0:    'FFFAFAF6',  // light cream
  bg1:    'FFEFE9DC',  // header band
  bg2:    'FFE8E2D2',
  line:   'FFD8D2C4',
};

function statusColor(code) {
  if (code >= 200 && code < 300) return BRAND.teal;
  if (code >= 400 && code < 500) return BRAND.amber;
  if (code >= 500) return BRAND.red;
  return BRAND.ink2;
}

async function buildXlsx(rows, opts) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SalesPort × SAP Integration Console';
  wb.created = new Date();

  // ============ Summary sheet ============
  const sum = wb.addWorksheet('Summary', { properties: { tabColor: { argb: BRAND.orange } } });
  sum.columns = [
    { width: 32 }, { width: 22 }, { width: 22 }, { width: 22 },
  ];

  // Title block
  sum.mergeCells('A1:D1');
  const title = sum.getCell('A1');
  title.value = 'SalesPort × SAP — Integration Report';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: BRAND.ink0 } };
  title.alignment = { vertical: 'middle' };
  sum.getRow(1).height = 32;

  sum.mergeCells('A2:D2');
  const subt = sum.getCell('A2');
  subt.value = `Window: last ${opts.hours} hours  ·  Exported: ${fmtNpt(new Date())} NPT  ·  Tenant: sujal-foods-${opts.env || 'staging'}` + (opts.module ? `  ·  Module filter: ${opts.module}` : '');
  subt.font = { italic: true, color: { argb: BRAND.ink2 }, size: 10 };
  sum.getRow(2).height = 18;

  // Headline stats (computed)
  const total = rows.length;
  const ok = rows.filter(r => r.status_code >= 200 && r.status_code < 400).length;
  const errors = rows.filter(r => r.status_code >= 400).length;
  const avgMs = total ? Math.round(rows.reduce((s, r) => s + Number(r.duration_ms || 0), 0) / total) : 0;

  const headlines = [
    ['Total calls',  total,    ''],
    ['Success',      ok,       total ? `${((ok/total)*100).toFixed(2)} %` : '—'],
    ['Errors',       errors,   total ? `${((errors/total)*100).toFixed(2)} %` : '—'],
    ['Avg latency',  `${avgMs} ms`, ''],
  ];
  let r = 4;
  for (const [label, val, sub] of headlines) {
    sum.getCell(`A${r}`).value = label;
    sum.getCell(`A${r}`).font = { bold: true, color: { argb: BRAND.ink2 }, size: 10 };
    sum.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bg1 } };
    sum.getCell(`B${r}`).value = val;
    sum.getCell(`B${r}`).font = { bold: true, size: 14, color: { argb: BRAND.ink0 } };
    sum.getCell(`C${r}`).value = sub;
    sum.getCell(`C${r}`).font = { color: { argb: BRAND.ink2 }, size: 10 };
    r++;
  }

  // Per-module breakdown
  r += 2;
  sum.getCell(`A${r}`).value = 'Per-module breakdown';
  sum.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: BRAND.orange } };
  r++;

  const headRow = ['Module', 'Calls', 'Errors', 'Success rate'];
  headRow.forEach((h, i) => {
    const cell = sum.getRow(r).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.orange } };
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: BRAND.line } } };
  });
  sum.getRow(r).height = 22;
  r++;

  const byMod = new Map();
  for (const row of rows) {
    const m = byMod.get(row.module_id) || { calls: 0, errors: 0 };
    m.calls++;
    if (row.status_code >= 400) m.errors++;
    byMod.set(row.module_id, m);
  }
  const sorted = [...byMod.entries()].sort((a, b) => b[1].calls - a[1].calls);
  let zebra = false;
  for (const [mod, stats] of sorted) {
    const row = sum.getRow(r);
    const rate = stats.calls ? 1 - (stats.errors / stats.calls) : 0;
    row.getCell(1).value = mod;
    row.getCell(2).value = stats.calls;
    row.getCell(3).value = stats.errors;
    row.getCell(4).value = rate;
    row.getCell(4).numFmt = '0.00%';
    row.getCell(4).font = {
      color: { argb: rate >= 0.99 ? BRAND.teal : rate >= 0.95 ? BRAND.amber : BRAND.red },
      bold: true,
    };
    if (zebra) {
      for (let c = 1; c <= 4; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bg0 } };
      }
    }
    for (let c = 2; c <= 4; c++) row.getCell(c).alignment = { horizontal: 'right' };
    row.getCell(1).font = { ...row.getCell(1).font, name: 'Consolas', size: 10 };
    zebra = !zebra;
    r++;
  }

  // ============ Transactions sheet ============
  const tx = wb.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 1 }] });

  const HEAD = [
    { header: '#',            key: 'id',            width: 6  },
    { header: 'Txn ID',       key: 'correlation_id', width: 22 },
    { header: 'Direction',    key: 'direction',     width: 10 },
    { header: 'Time · NPT',   key: 'created_at',    width: 22 },
    { header: 'Module',       key: 'module_id',     width: 22 },
    { header: 'Method',       key: 'method',        width: 8  },
    { header: 'Endpoint',     key: 'path',          width: 30 },
    { header: 'Status',       key: 'status_code',   width: 10 },
    { header: 'Stage',        key: 'pipeline_stage',width: 12 },
    { header: 'Duration (ms)', key: 'duration_ms',  width: 14 },
    { header: 'Bytes in',     key: 'bytes_in',      width: 10 },
    { header: 'Bytes out',    key: 'bytes_out',     width: 10 },
    { header: 'Retries',      key: 'retry_count',   width: 8  },
    { header: 'Distributor',  key: 'distributor_name', width: 22 },
    { header: 'Customer code', key: 'customer_code',width: 16 },
    { header: 'Doc #',        key: 'doc_number',    width: 14 },
    { header: 'Remote IP',    key: 'remote_ip',     width: 14 },
    { header: 'Error message',key: 'error_message', width: 40 },
  ];
  tx.columns = HEAD;

  // Header styling
  const headRowTx = tx.getRow(1);
  headRowTx.height = 26;
  headRowTx.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.orange } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: BRAND.ink0 } },
    };
  });

  // Body rows
  rows.forEach((row, i) => {
    const r = tx.addRow({
      ...row,
      created_at: fmtNpt(row.created_at),
    });
    // Zebra
    if (i % 2 === 0) {
      r.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bg0 } };
      });
    }
    // Status badge styling
    const statusCell = r.getCell('status_code');
    statusCell.font = { bold: true, color: { argb: statusColor(row.status_code) } };
    statusCell.alignment = { horizontal: 'center' };
    // Method tint
    const methodCell = r.getCell('method');
    methodCell.font = { bold: true, color: { argb: row.method === 'POST' ? BRAND.teal : BRAND.amber } };
    methodCell.alignment = { horizontal: 'center' };
    // Monospace columns
    for (const k of ['correlation_id', 'path', 'remote_ip', 'created_at']) {
      const c = r.getCell(k);
      c.font = { ...(c.font || {}), name: 'Consolas', size: 10 };
    }
    // Duration tint when slow
    const durCell = r.getCell('duration_ms');
    durCell.alignment = { horizontal: 'right' };
    if (Number(row.duration_ms) > 1000) durCell.font = { ...(durCell.font || {}), color: { argb: BRAND.red }, bold: true };
    else if (Number(row.duration_ms) > 500) durCell.font = { ...(durCell.font || {}), color: { argb: BRAND.amber } };
  });

  // AutoFilter on whole header
  tx.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: HEAD.length },
  };

  return wb;
}

router.get('/', async (req, res, next) => {
  try {
    const hours = Math.max(1, Math.min(Number(req.query.hours) || 24, 720));
    const fmt = String(req.query.format || 'xlsx').toLowerCase();
    const moduleFilter = req.query.module ? String(req.query.module) : null;
    const rows = await fetchRows(hours, moduleFilter);

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const base = `salesport-sap-${hours}h-${ts}`;

    if (fmt === 'ndjson' || fmt === 'json') {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.ndjson"`);
      for (const row of rows) {
        const out = { ...row };
        if (out.created_at) out.created_at_npt = fmtNpt(out.created_at);
        res.write(JSON.stringify(out) + '\n');
      }
      return res.end();
    }

    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      // Add BOM so Excel opens it with UTF-8.
      res.write('﻿');
      res.write(FIELDS.map(f => f === 'created_at' ? 'created_at_npt' : f).join(',') + '\n');
      for (const row of rows) {
        res.write(FIELDS.map(f => csvValue(row[f], f)).join(',') + '\n');
      }
      return res.end();
    }

    // Default: real XLSX with formatting
    const wb = await buildXlsx(rows, { hours, module: moduleFilter, env: req.query.env });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

module.exports = router;
