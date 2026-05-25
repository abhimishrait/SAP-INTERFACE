// 3.6 Matrix → product_domains
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();
const { create, update } = buildSimpleMaster({
  table: 'product_domains',
  rejectNumericOnly: false, // spec only mandates uniqueness, not alpha presence
});
router.post('/', create);
router.put('/', update);
router.put('/:id/', update);
module.exports = router;
