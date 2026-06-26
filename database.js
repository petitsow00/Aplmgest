const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");

const DB_NAME = "yvas_code.db";
const dbPath = path.join(__dirname, DB_NAME);
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableColumns(table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
  } catch (e) {
    return [];
  }
}

function ensureTable(createSQL) {
  db.prepare(createSQL).run();
}

function ensureColumns(table, columns) {
  const existing = tableColumns(table);
  columns.forEach(column => {
    if (!existing.includes(column.name)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column.definition}`).run();
    }
  });
}

ensureTable(`CREATE TABLE IF NOT EXISTS utilisateurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT UNIQUE NOT NULL,
  motdepasse TEXT NOT NULL,
  nom_complet TEXT DEFAULT '',
  telephone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  service TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Administrateur',
  actif INTEGER NOT NULL DEFAULT 1,
  date_creation TEXT NOT NULL DEFAULT (DATETIME('now')),
  dernier_connexion TEXT DEFAULT NULL
);`);

ensureColumns("utilisateurs", [
  { name: "nom_complet", definition: "nom_complet TEXT DEFAULT ''" },
  { name: "telephone", definition: "telephone TEXT DEFAULT ''" },
  { name: "email", definition: "email TEXT DEFAULT ''" },
  { name: "service", definition: "service TEXT DEFAULT ''" },
  { name: "role", definition: "role TEXT NOT NULL DEFAULT 'Administrateur'" },
  { name: "actif", definition: "actif INTEGER NOT NULL DEFAULT 1" },
  { name: "date_creation", definition: "date_creation TEXT DEFAULT ''" },
  { name: "dernier_connexion", definition: "dernier_connexion TEXT DEFAULT NULL" }
]);

ensureTable(`CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  nationalite TEXT DEFAULT 'Sénégalaise',
  statut TEXT DEFAULT 'Actif',
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);`);

ensureColumns("clients", [
  { name: "nationalite", definition: "nationalite TEXT DEFAULT 'Sénégalaise'" },
  { name: "statut", definition: "statut TEXT DEFAULT 'Actif'" },
  { name: "actif", definition: "actif INTEGER NOT NULL DEFAULT 1" },
  { name: "created_at", definition: "created_at TEXT DEFAULT ''" }
]);

ensureTable(`CREATE TABLE IF NOT EXISTS dossiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  service TEXT,
  statut TEXT,
  date_creation TEXT DEFAULT (DATETIME('now')),
  montant REAL DEFAULT 0,
  destination TEXT DEFAULT '',
  etapes_total INTEGER DEFAULT 5,
  progress INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT DEFAULT NULL
);`);

ensureColumns("dossiers", [
  { name: "montant", definition: "montant REAL DEFAULT 0" },
  { name: "destination", definition: "destination TEXT DEFAULT ''" },
  { name: "date_echeance", definition: "date_echeance TEXT DEFAULT NULL" },
  { name: "etapes_total", definition: "etapes_total INTEGER DEFAULT 5" },
  { name: "progress", definition: "progress INTEGER DEFAULT 0" },
  { name: "created_at", definition: "created_at TEXT DEFAULT ''" },
  { name: "updated_at", definition: "updated_at TEXT DEFAULT NULL" }
]);

ensureTable(`CREATE TABLE IF NOT EXISTS parametres (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  nom_agence TEXT DEFAULT '',
  telephone1 TEXT DEFAULT '',
  telephone2 TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  site_web TEXT DEFAULT '',
  adresse TEXT DEFAULT '',
  ninea TEXT DEFAULT '',
  registre_commerce TEXT DEFAULT '',
  description TEXT DEFAULT '',
  devise TEXT DEFAULT 'FCFA',
  taux_tva REAL DEFAULT 18,
  banque TEXT DEFAULT '',
  num_compte TEXT DEFAULT '',
  wave_numero TEXT DEFAULT '',
  wave_titulaire TEXT DEFAULT '',
  orange_numero TEXT DEFAULT '',
  orange_titulaire TEXT DEFAULT '',
  free_numero TEXT DEFAULT '',
  free_titulaire TEXT DEFAULT ''
);`);

const existingParams = db.prepare("SELECT id FROM parametres WHERE id = 1").get();
if (!existingParams) {
  db.prepare("INSERT INTO parametres (id) VALUES (1)").run();
}

function getParametres() {
  return db.prepare("SELECT * FROM parametres WHERE id = 1").get() || {};
}

function saveParametres(p) {
  db.prepare(`INSERT OR REPLACE INTO parametres
    (id,nom_agence,telephone1,telephone2,whatsapp,email,site_web,adresse,ninea,registre_commerce,description,devise,taux_tva,banque,num_compte,wave_numero,wave_titulaire,orange_numero,orange_titulaire,free_numero,free_titulaire)
    VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    p.nom_agence||'', p.telephone1||'', p.telephone2||'', p.whatsapp||'',
    p.email||'', p.site_web||'', p.adresse||'', p.ninea||'',
    p.registre_commerce||'', p.description||'', p.devise||'FCFA',
    p.taux_tva||18, p.banque||'', p.num_compte||'',
    p.wave_numero||'', p.wave_titulaire||'',
    p.orange_numero||'', p.orange_titulaire||'',
    p.free_numero||'', p.free_titulaire||''
  );
}

function resetAllData() {
  db.prepare("DELETE FROM dossiers").run();
  db.prepare("DELETE FROM clients").run();
  try { db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('clients','dossiers')").run(); } catch(e) {}
}

const DEFAULT_ROLES = [
  'Super Administrateur',
  'Administrateur',
  'Responsable',
  'Comptable',
  'Caissier',
  'Agent Billetterie',
  'Agent Visa',
  'Agent Oumrah / Pèlerinage',
  'Standard'
];

function getUserByPseudo(pseudo) {
  return db.prepare("SELECT * FROM utilisateurs WHERE pseudo = ?").get(pseudo);
}

function getUserById(id) {
  return db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(id);
}

function getAllUsers() {
  return db.prepare("SELECT * FROM utilisateurs ORDER BY actif DESC, role ASC, pseudo ASC").all();
}

function createUser(user) {
  const password = user.motdepasse || 'Welcome123';
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`INSERT INTO utilisateurs (pseudo, motdepasse, nom_complet, telephone, email, service, role, actif, date_creation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'))`).run(
    user.pseudo,
    hash,
    user.nom_complet || '',
    user.telephone || '',
    user.email || '',
    user.service || '',
    user.role || 'Standard',
    Number(user.actif ?? 1)
  );
  return info.lastInsertRowid;
}

function updateUser(user) {
  const fields = [
    user.pseudo,
    user.nom_complet || '',
    user.telephone || '',
    user.email || '',
    user.service || '',
    user.role || 'Standard',
    Number(user.actif ?? 1)
  ];
  let sql = "UPDATE utilisateurs SET pseudo = ?, nom_complet = ?, telephone = ?, email = ?, service = ?, role = ?, actif = ?";
  if (user.motdepasse) {
    const hash = bcrypt.hashSync(user.motdepasse, 10);
    sql += ", motdepasse = ?";
    fields.push(hash);
  }
  sql += " WHERE id = ?";
  fields.push(user.id);
  db.prepare(sql).run(...fields);
}

function setUserStatus(id, actif) {
  db.prepare("UPDATE utilisateurs SET actif = ? WHERE id = ?").run(Number(actif), id);
}

function deleteUser(id) {
  db.prepare("DELETE FROM utilisateurs WHERE id = ?").run(id);
}

function resetPassword(id, motdepasse) {
  const hash = bcrypt.hashSync(motdepasse, 10);
  db.prepare("UPDATE utilisateurs SET motdepasse = ?, actif = 1 WHERE id = ?").run(hash, id);
}

function recordLogin(id) {
  db.prepare("UPDATE utilisateurs SET dernier_connexion = DATETIME('now') WHERE id = ?").run(id);
}

function getClients() {
  return db.prepare("SELECT id, nom, telephone, email, adresse, nationalite, statut, actif FROM clients ORDER BY id DESC").all();
}

function getDossiers() {
  return db.prepare("SELECT dossiers.id, dossiers.client_id, dossiers.service, dossiers.statut, dossiers.date_creation, dossiers.date_echeance, dossiers.montant, dossiers.destination, clients.nom AS client_name FROM dossiers LEFT JOIN clients ON clients.id = dossiers.client_id ORDER BY dossiers.id DESC").all();
}

function createClient(client) {
  const info = db.prepare(
    `INSERT INTO clients (nom, telephone, email, adresse, nationalite, statut, actif, created_at)
     VALUES (?, ?, ?, ?, ?, 'Actif', 1, DATETIME('now'))`
  ).run(
    client.nom || '',
    client.telephone || '',
    client.email || '',
    client.adresse || '',
    client.nationalite || 'Sénégalaise'
  );
  return info.lastInsertRowid;
}

function createDossier(dossier) {
  const info = db.prepare(
    `INSERT INTO dossiers (client_id, service, statut, montant, destination, date_echeance, etapes_total, progress, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), DATETIME('now'))`
  ).run(
    dossier.client_id || null,
    dossier.service || '',
    dossier.statut || 'En cours',
    dossier.montant || 0,
    dossier.destination || '',
    dossier.date_echeance || null,
    dossier.etapes_total || 5,
    dossier.progress || 0
  );
  return info.lastInsertRowid;
}

const defaultAdminPassword = 'admin123';
const adminHash = bcrypt.hashSync(defaultAdminPassword, 10);
const adminUser = db.prepare("SELECT * FROM utilisateurs WHERE pseudo = 'admin'").get();
if (adminUser) {
  const shouldResetAdmin = adminUser.actif !== 1 || !adminUser.email || !adminUser.nom_complet;
  if (shouldResetAdmin) {
    db.prepare("UPDATE utilisateurs SET motdepasse = ?, role = 'Administrateur', actif = 1, nom_complet = ?, email = ?, telephone = ?, service = ? WHERE id = ?").run(
      adminHash,
      'Administrateur du système',
      'admin@aplmbuzness.com',
      '+221000000000',
      'Direction',
      adminUser.id
    );
    console.log('Compte admin mis à jour.');
  }
} else {
  db.prepare(`INSERT INTO utilisateurs (pseudo, motdepasse, nom_complet, telephone, email, service, role, actif, date_creation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'))`).run(
    'admin',
    adminHash,
    'Administrateur du système',
    '+221000000000',
    'admin@aplmbuzness.com',
    'Direction',
    'Administrateur',
    1
  );
  console.log('Administrateur créé automatiquement. Connectez-vous avec le pseudo : admin');
}

module.exports = {
  db,
  getUserByPseudo,
  getUserById,
  getAllUsers,
  createUser,
  updateUser,
  setUserStatus,
  deleteUser,
  resetPassword,
  recordLogin,
  getClients,
  getDossiers,
  createClient,
  createDossier,
  getParametres,
  saveParametres,
  resetAllData,
  DEFAULT_ROLES
};