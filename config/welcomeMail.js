const mailer = require('./mailer');

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MENSAJES = {
  google: {
    asunto: 'Tu cuenta de GEKO fue verificada',
    detalle: 'Tu correo fue verificado con Google y tu cuenta de GEKO ya está activa.',
  },
  registro: {
    asunto: 'Tu cuenta de GEKO fue creada',
    detalle: 'Tu cuenta de GEKO se creó correctamente con este correo.',
  },
};

const sendWelcomeEmail = ({ to, nombre, metodo = 'registro' }) => {
  if (!mailer.isMailConfigured()) {
    console.warn(`[bienvenida] correo no enviado: ${mailer.mailNotice()}`);
    return Promise.resolve(false);
  }

  const { asunto, detalle } = MENSAJES[metodo] || MENSAJES.registro;
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,';

  return mailer
    .sendMail({
      to,
      subject: asunto,
      text: [saludo, '', detalle, '', 'Ya puedes iniciar sesión y usar GEKO.', '', 'Si no fuiste tú, ignora este mensaje o contáctanos.'].join('\n'),
      html: [
        `<p>${escapeHtml(saludo)}</p>`,
        `<p>${escapeHtml(detalle)}</p>`,
        '<p>Ya puedes iniciar sesión y usar GEKO.</p>',
        '<p style="color:#666">Si no fuiste tú, ignora este mensaje o contáctanos.</p>',
      ].join(''),
    })
    .then(() => true)
    .catch((error) => {
      console.error('[bienvenida] error:', error.message);
      return false;
    });
};

module.exports = { sendWelcomeEmail };