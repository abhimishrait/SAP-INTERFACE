// 3.3 Greater Circles → zones
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();
const { create, update } = buildSimpleMaster({ table: 'zones' });
router.post('/', create);
router.put('/', update);        // body.code identifies the record (preferred)
router.put('/:id/', update);    // back-compat: code or numeric id in URL
module.exports = router;
