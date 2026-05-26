// 3.10 Price List Group → price_groups
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();
const { create, update } = buildSimpleMaster({
  table: 'price_groups',
  rejectNumericOnly: false,
});
router.post('/', create);
router.put('/:id/', update);
module.exports = router;
