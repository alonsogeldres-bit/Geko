require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session')
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// Rutas
const postRouter = require('./routes/postRoutes');
const dashboardRoutes = require('./routes/DashboardRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const authRoutes = require('./routes/authRoutes')
const profileRoutes = require('./routes/profileRoutes');
const planRoutes = require('./routes/planRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { guardAccount } = require('./middlewares/accountGuard');
const PlanModel = require('./models/planModel');

const app = express();

const port = process.env.PORT || 3000;

// DIAGNÓSTICO: imprime cada petición que llega (bórralo cuando funcione)
app.use((req, res, next) => {
    if (!/\.(css|js|png|jpg|ico|svg|woff2?)$/i.test(req.url)) {
        console.log('[REQ]', req.method, req.url);
    }
    next();
});

// Configurar EJS
app.set('view engine', 'ejs');

// Archivos estáticos (CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, 'public')));

// MIDDLEWARES
app.use(express.urlencoded({ extended: true }));

// JSON
app.use(express.json());


app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 2 
        }
    })
)



// Revalida rol y estado de la cuenta (bloqueos y cambios de rol al instante)
app.use(guardAccount);

// Programar rutas
app.get('/', (req, res) => {
    res.redirect('/splash');
});

app.use('/splash', postRouter);
app.use('/dashboard', dashboardRoutes);
app.use('/entrenamiento', trainingRoutes);

/** Agrega la clase is-premium al <body> del HTML ya renderizado (si no la tiene). */
const marcarPremium = (html) =>
    html.replace(/<body([^>]*)>/i, (m, attrs) => {
        if (/class\s*=\s*"[^"]*\bis-premium\b/i.test(attrs)) return m;
        if (/class\s*=\s*"/i.test(attrs)) {
            return '<body' + attrs.replace(/class\s*=\s*"/i, 'class="is-premium ') + '>';
        }
        return '<body class="is-premium"' + attrs + '>';
    });

// Entrenamiento activo: resuelve si el usuario tiene plan Premium (look dorado)
// y pasa los datos del tiempo sugerido por la IA. Ante cualquier fallo se muestra como Gratis.
app.get('/entrenamientoActivo', async (req, res) => {
    console.log('[entrenamientoActivo] ENTRÓ A LA RUTA | sesión:', Boolean(req.session && req.session.usuario));

    let esPremium = false;
    try {
        const usuario = req.session.usuario;
        if (usuario) {
            const idCliente = await PlanModel.getClienteByUser(usuario.id_usuario);
            if (idCliente) {
                const plan = await PlanModel.getEffectivePlan(idCliente);
                esPremium = Boolean(plan && plan.esDePago);
            }
        }
    } catch (err) {
        console.error('[entrenamientoActivo] no se pudo resolver el plan:', err.message);
    }

    // TEMPORAL: pega aquí tu código anterior que calculaba estos dos valores.
    // Mientras tanto, la página carga sin tiempo sugerido.
    let haySugerido = false;
    let tiempoSugeridoSeg = 0;

    console.log('[entrenamientoActivo] esPremium =', esPremium);

    res.render('post/entrenamientoActivo', {
        esPremium,
        haySugerido,
        tiempoSugeridoSeg,
    }, (err, html) => {
        if (err) {
            console.error('[entrenamientoActivo] error al renderizar:', err.message);
            return res.status(500).send('No pudimos cargar el entrenamiento. Inténtalo de nuevo.');
        }
        res.send(esPremium ? marcarPremium(html) : html);
    });
});

app.use('/', authRoutes)
app.use('/auth', authRoutes)
app.use('/', profileRoutes);
app.use('/', planRoutes);
app.use('/admin', adminRoutes);

// Levantar el servidor
app.listen(port, () => {
    console.log(`Servidor arriba en http://localhost:${port}`);
});