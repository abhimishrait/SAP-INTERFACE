// 3.6 Matrix → product_domains
//
// Spec PDF v1.2 §3.6: payload is `{ name, status }` only. We write to the
// standard simple-master table `product_domains` (name + code + is_active).
//
// The earlier `sujal_matrices` rewrite (DB_CHANGES.md §1.6) is no longer used
// for writes — SAP sends only name+status and any additional matrix attributes
// (material_group, product_class_name, hsn_code, order_of, unit) are populated
// manually in the DMS UI on whatever table the DMS team prefers. We leave the
// `sujal_matrices` table in place so existing rows and the products lookup
// fallback in `products.js` keep working.
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();
const { create, update } = buildSimpleMaster({ table: 'product_domains' });
router.post('/', create);
router.put('/:id/', update);
module.exports = router;
