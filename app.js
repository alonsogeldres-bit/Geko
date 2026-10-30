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

// Enlace antiguo: el reproductor vive en /entrenamiento/activo (con los datos de la rutina).
app.get('/entrenamientoActivo', (req, res) => res.redirect('/entrenamiento/activo'));

app.use('/', authRoutes)
app.use('/auth', authRoutes)
app.use('/', profileRoutes);
app.use('/', planRoutes);
app.use('/admin', adminRoutes);

// Levantar el servidor
app.listen(port, () => {
    console.log(`Servidor arriba en http://localhost:${port}`);
});