// 3.4 Circles → towns (FK zone_id)
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');
const { findIdByName } = require('../lib/lookup');

const router = express.Router();
const { create, update } = buildSimpleMaster({
  table: 'towns',
  // greater_circle_name is optional — zone assignment is mapped manually in
  // the DMS UI, not derived from the SAP payload. If a value IS supplied we
  // still resolve it to a zone_id (and error on an unknown zone) so the
  // caller gets immediate feedback rather than silent loss.
  extra: async ({ body }) => {
    const errors = {};
    const columns = {};
    if (body.greater_circle_name) {
      const zoneId = await findIdByName('zones', body.greater_circle_name);
      if (!zoneId) errors.greater_circle_name = [`Zone '${body.greater_circle_name}' does not exist.`];
      else columns.zone_id = zoneId;
    }
    return { columns, errors };
  },
});
router.post('/', create);
router.put('/:id/', update);
module.exports = router;
