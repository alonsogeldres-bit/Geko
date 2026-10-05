require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session')
const flash = require('connect-flash')

// Rutas
const postRouter = require('./routes/postRoutes');
const authRoutes = require('./routes/authRoutes')

const app = express();

const port = process.env.PORT || 3000;

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
            maxAge: 1000 * 60 * 60 * 2 
        }
    })
)

/*Flash
app.use(flash());

Variables globales
app.use((req, res, next) => {
    res.locals.success = req.flash('success')
    res.locals.error = req.flash('error')
    res.locals.user = req.session.user || null

    next()

    })
*/ 

// Programar rutas
app.get('/', (req, res) => {
    res.redirect('/splash');
});

app.use('/splash', postRouter);
app.use('/', authRoutes)

// Levantar el servidor
app.listen(port, () => {
    console.log(`Servidor arriba en http://localhost:${port}`);
});