// 3.4 Circles → towns (FK zone_id)
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');
const { findIdByName } = require('../lib/lookup');

const router = express.Router();
const { create, update } = buildSimpleMaster({
  table: 'towns',
  extra: async ({ body, mode }) => {
    const errors = {};
    const columns = {};
    if (body.greater_circle_name !== undefined || mode === 'create') {
      if (!body.greater_circle_name) {
        errors.greater_circle_name = ['This field is required.'];
      } else {
        const zoneId = await findIdByName('zones', body.greater_circle_name);
        if (!zoneId) errors.greater_circle_name = [`Zone '${body.greater_circle_name}' does not exist.`];
        else columns.zone_id = zoneId;
      }
    }
    return { columns, errors };
  },
});
router.post('/', create);
router.put('/', update);
router.put('/:id/', update);
module.exports = router;
