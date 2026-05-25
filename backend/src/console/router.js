// Mounts the console-facing APIs under /console/*.
const express = require('express');
const router = express.Router();

router.use('/overview',     require('./overview'));
router.use('/transactions', require('./transactions'));
router.use('/queue',        require('./queue'));
router.use('/modules',      require('./modules'));
router.use('/db',           require('./db'));
router.use('/connections',  require('./connections'));
router.use('/volume',       require('./volume'));
router.use('/export',       require('./export'));
router.use('/postman',      require('./postman'));

module.exports = router;
