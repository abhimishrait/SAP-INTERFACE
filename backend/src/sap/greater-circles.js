// 3.3 Greater Circles → zones
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();
const { create, update } = buildSimpleMaster({ table: 'zones' });
router.post('/', create);
router.put('/:id/', update);
module.exports = router;
