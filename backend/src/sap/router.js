// Mounts the 16 SAP-facing modules under /sap/*. Order follows the spec sections.
const express = require('express');
const router = express.Router();

router.use('/bp-master',            require('./bp-master'));              // 3.1
router.use('/blanket-agreement',    require('./blanket-agreement'));      // 3.2
router.use('/greater-circles',      require('./greater-circles'));        // 3.3
router.use('/circles',              require('./circles'));                // 3.4
router.use('/container',            require('./container'));              // 3.5
router.use('/matrix',               require('./matrix'));                 // 3.6
router.use('/product-class',        require('./product-class'));          // 3.7
router.use('/product-name',         require('./product-name'));           // 3.8
router.use('/payment-terms',        require('./payment-terms'));          // 3.9
router.use('/price-list-group',     require('./price-list-group'));       // 3.10
router.use('/price-list',           require('./price-list'));             // 3.11
router.use('/special-price-list',   require('./special-price-list'));     // 3.12
router.use('/products',             require('./products'));               // 3.13
router.use('/delivery-order',       require('./delivery-order'));         // 3.14
router.use('/invoice-order',        require('./invoice-order'));          // invoice → SO status=INVOICED
router.use('/balance-status-update', require('./balance-status-update')); // 3.15
router.use('/order-status-sync',    require('./order-status-sync'));      // 3.16
router.use('/channels',             require('./channels'));                // master

module.exports = router;
