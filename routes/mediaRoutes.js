const express = require('express');
const { descargarMedia } = require('../services/exerciseMediaService');

const router = express.Router();

/**
 * GET /media/ejercicios/:archivo
 * Sirve los gifs/imágenes del dataset de ejercicios desde Geko, con caché en
 * memoria. Así el navegador no depende de GitHub y no hay que subir ~140 MB
 * de media al repositorio.
 */
router.get('/:archivo', async (req, res) => {
  try {
    const media = await descargarMedia(req.params.archivo);
    if (!media) return res.status(404).end();

    res.set('Content-Type', media.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(media.buffer);
  } catch (err) {
    console.error('[media/ejercicios] error:', err.message);
    return res.status(502).end();
  }
});

module.exports = router;
