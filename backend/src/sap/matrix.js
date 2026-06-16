// 3.6 Matrix → sujal_matrices
//
// Spec PDF v1.2 §3.6 payload is `{ name, status }` only. We write to the
// dedicated `sujal_matrices` table, reshaped to the standard simple-master
// columns (name, code, is_active). The previous wide shape (material_group,
// product_class_name, hsn_code, order_of, unit) is removed — see
// migration 006_sujal_matrices_simple_master.sql.
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();
const { create, update } = buildSimpleMaster({ table: 'sujal_matrices' });
router.post('/', create);
router.put('/:id/', update);
module.exports = router;
