const express = require('express');
const images = require('../models/images');
const { isId } = require('../validation');

const router = express.Router();

router.get('/:id', async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).end();
    const image = await images.findById(Number(req.params.id));
    if (!image) return res.status(404).end();
    res.set({
        'Content-Type': image.content_type,
        'Cache-Control': 'public, max-age=31536000, immutable', // images never change; a new upload gets a new id
        'X-Content-Type-Options': 'nosniff',
    });
    res.send(image.data);
});

module.exports = router;
