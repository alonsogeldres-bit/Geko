require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session')

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// Rutas
const postRouter = require('./routes/postRoutes');
const dashboardRoutes = require('./routes/DashboardRoutes');
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



// Programar rutas
app.get('/', (req, res) => {
    res.redirect('/splash');
});

app.use('/splash', postRouter);
app.use('/dashboard', dashboardRoutes);
app.use('/', authRoutes)
app.use('/auth', authRoutes)

// Levantar el servidor
app.listen(port, () => {
    console.log(`Servidor arriba en http://localhost:${port}`);
});





