const express = require('express');
const notifications = require('../models/notifications');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    res.json(await notifications.listFor(req.user.id));
});

// body: { ids: [..] } to mark some, or {} to mark all
router.post('/read', requireAuth, async (req, res) => {
    await notifications.markRead(req.user.id, req.body?.ids);
    res.json(await notifications.listFor(req.user.id));
});

module.exports = router;
