const electron = require('electron')
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const sqlite3 = require('sqlite3').verbose();
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const moment = require('moment');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'super-secret-key',
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new sqlite3.Database('pastes/pastes.db');

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS pastes (link TEXT PRIMARY KEY, content TEXT, created_at TEXT, expires_at TEXT, user_id TEXT)');
});

passport.use(new DiscordStrategy({
  clientID: '',
  clientSecret: '',
  callbackURL: 'http://localhost:3000/auth/discord/callback',
  scope: ['identify', 'email'],
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error(err);
        res.status(500).send('Wystąpił błąd podczas wylogowywania.');
      } else {
        res.redirect('/');
      }
    });
  });

app.get('/', (req, res) => {
  res.render('index', { user: req.user });
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/panel');
  }
);

app.get('/panel', (req, res) => {

  if (req.isAuthenticated()) {
    db.all('SELECT * FROM pastes WHERE user_id = ?', req.user.id, (err, pastes) => {
      if (err) {
        console.error(err);
        res.status(500).send('Wystąpił błąd.');
        return;
      }

      db.all('SELECT * FROM pastes ORDER BY created_at DESC LIMIT 5', (err, latestPastes) => {
        if (err) {
          console.error(err);
          res.status(500).send('Wystąpił błąd.');
          return;
        }

        res.render('pages/panel', { user: req.user, pastes: pastes, latestPastes: latestPastes });
      });
    });
  } else {
    res.redirect('/');
  }
});

app.post('/save', (req, res) => {
  const { content, link } = req.body;

  if (req.isAuthenticated()) {
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 1);
    const expiresAtISO = expiresAt.toISOString();

    const stmt = db.prepare('INSERT OR REPLACE INTO pastes (link, content, created_at, expires_at, user_id) VALUES (?, ?, ?, ?, ?)');
    stmt.run(link, content, createdAt, expiresAtISO, req.user.id);
    stmt.finalize();

    res.status(200).send('Pasta została pomyślnie zapisana.');
  } else {
    res.status(401).send('Nie jesteś zalogowany.');
  }
});

app.get('/:link', (req, res) => {
  const link = req.params.link;

  db.get('SELECT content, created_at, expires_at FROM pastes WHERE link = ?', link, (err, row) => {
    if (err) {
      console.error(err);
      res.status(500).send('Wystąpił błąd podczas odczytu pasty.');
    } else if (row) {
      const content = row.content;
      const createdAt = moment(row.created_at).format('YYYY-MM-DD HH:mm:ss');
      const expiresAt = moment(row.expires_at).format('YYYY-MM-DD HH:mm:ss');

      if (moment(expiresAt).isAfter(moment())) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Pasta}</title>
            <style>
                pre {
                    background-color: #1a1a1a;
                    color: #fff;
                    padding: 20px;
                    border-radius: 10px;
                    font-family: "Arial", sans-serif;
                    font-size: 24px;
                    white-space: pre-wrap;
                    line-height: 1.6;
                    box-shadow: 0px 0px 20px rgba(0, 0, 0, 0.3);
                    border: 2px solid #333;
                    margin: 20px auto;
                    max-width: 800px;
                }
        
                body {
                    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                    background-color: #f5f5f5;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
        
                .info {
                    background-color: #f0f0f0;
                    border: 1px solid #ddd;
                    padding: 10px;
                    border-radius: 5px;
                    margin-top: 20px;
                    max-width: 800px;
                    text-align: center;
                }
        
                p {
                    font-size: 18px;
                    color: #333;
                }
        
                button {
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    font-size: 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    margin-top: 20px;
                }
        
                button:hover {
                    background-color: #45a049;
                }
        
                form {
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <pre>${content}</pre>
            <form action="/${link}/extend" method="POST">
                <button type="submit">Przedłuż ważność o 1 dzień</button>
            </form>
            <div class="info">
                <p>Data utworzenia: ${createdAt}</p>
                <p>Data wygaśnięcia: ${expiresAt}</p>
            </div>
        </body>
        </html>
        
        `;
        res.send(html);
      } else {
        res.status(404).send('Pasta wygasła.');
      }
    } else {
      res.status(404).send('Pasta nie istnieje.');
    }
  });
});

app.post('/:link/extend', (req, res) => {
  const link = req.params.link;

  if (req.isAuthenticated()) {
    db.get('SELECT expires_at FROM pastes WHERE link = ?', link, (err, row) => {
      if (err) {
        console.error(err);
        res.status(500).send('Wystąpił błąd podczas przedłużania pasty.');
      } else if (row) {
        const expiresAt = new Date(row.expires_at);

        if (moment(expiresAt).isAfter(moment())) {
          expiresAt.setDate(expiresAt.getDate() + 1);
          const expiresAtISO = expiresAt.toISOString();

          db.run('UPDATE pastes SET expires_at = ? WHERE link = ?', expiresAtISO, link, (err) => {
            if (err) {
              console.error(err);
              res.status(500).send('Wystąpił błąd podczas przedłużania pasty.');
            } else {
              res.status(200).send('Ważność pasty została przedłużona o 1 dzień.');
            }
          });
        } else {
          res.status(404).send('Nie można przedłużyć ważności wygasłej pasty.');
        }
      } else {
        res.status(404).send('Pasta nie istnieje.');
      }
    });
  } else {
    res.status(401).send('Nie jesteś zalogowany.');
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'archive')));
app.use(express.static(path.join(__dirname, 'views')));

app.listen(port, () => {
  console.log(`Serwer działa na http://localhost:${port}`);
});
