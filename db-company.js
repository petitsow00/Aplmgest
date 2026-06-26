const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const fs = require("fs");

const COMPANIES_DIR = path.join(process.env.APLM_DATA_PATH || __dirname, "companies");

// Cache des connexions DB ouvertes (une par slug)
const _connections = {};

function getDb(slug) {
  if (!_connections[slug]) {
    const dbPath = path.join(COMPANIES_DIR, slug + ".db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    _initSchema(db);
    _connections[slug] = db;
  }
  return _connections[slug];
}

// ─── Schéma de la base entreprise ───────────────────────────────────────────

function _initSchema(db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE NOT NULL,
    motdepasse TEXT NOT NULL,
    nom_complet TEXT DEFAULT '',
    telephone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    service TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'Standard',
    actif INTEGER NOT NULL DEFAULT 1,
    date_creation TEXT NOT NULL DEFAULT (DATETIME('now')),
    dernier_connexion TEXT DEFAULT NULL
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT,
    telephone TEXT,
    email TEXT,
    adresse TEXT,
    nationalite TEXT DEFAULT '',
    statut TEXT DEFAULT 'Actif',
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS dossiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    service TEXT,
    statut TEXT DEFAULT 'En cours',
    date_creation TEXT DEFAULT (DATETIME('now')),
    date_echeance TEXT DEFAULT NULL,
    montant REAL DEFAULT 0,
    destination TEXT DEFAULT '',
    etapes_total INTEGER DEFAULT 5,
    progress INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    updated_at TEXT DEFAULT NULL
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS parametres (
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
    free_titulaire TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    modele_facture TEXT DEFAULT '',
    modele_devis TEXT DEFAULT ''
  )`).run();
  // Ajouter les colonnes si la DB existait avant cette version
  try{db.prepare("ALTER TABLE parametres ADD COLUMN modele_facture TEXT DEFAULT ''").run();}catch(_){}
  try{db.prepare("ALTER TABLE parametres ADD COLUMN modele_devis TEXT DEFAULT ''").run();}catch(_){}

  const existingParams = db.prepare("SELECT id FROM parametres WHERE id = 1").get();
  if (!existingParams) {
    db.prepare("INSERT INTO parametres (id) VALUES (1)").run();
  }

  db.prepare(`CREATE TABLE IF NOT EXISTS journal_activite (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisateur_id INTEGER DEFAULT NULL,
    utilisateur TEXT DEFAULT '',
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS engagements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    client TEXT NOT NULL,
    telephone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    adresse TEXT DEFAULT '',
    nationalite TEXT DEFAULT '',
    type_document TEXT DEFAULT 'Passeport',
    num_document TEXT DEFAULT '',
    destination TEXT NOT NULL,
    type_visa TEXT DEFAULT '',
    date_voyage TEXT DEFAULT NULL,
    frais REAL DEFAULT 0,
    statut TEXT DEFAULT 'Brouillon',
    date_creation TEXT NOT NULL DEFAULT (DATE('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS billets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    passager TEXT NOT NULL,
    telephone TEXT DEFAULT '',
    depart TEXT NOT NULL,
    arrivee TEXT NOT NULL,
    compagnie TEXT DEFAULT '',
    date_depart TEXT NOT NULL,
    tarif REAL DEFAULT 0,
    statut TEXT DEFAULT 'Confirmé',
    date_creation TEXT NOT NULL DEFAULT (DATE('now'))
  )`).run();

  // ── Module Finance & Caisse ──────────────────────────────────────────────

  db.prepare(`CREATE TABLE IF NOT EXISTS caisse (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('entree','sortie')),
    categorie TEXT DEFAULT '',
    description TEXT NOT NULL,
    montant REAL NOT NULL CHECK(montant > 0),
    mode_paiement TEXT DEFAULT 'Espèces',
    reference TEXT DEFAULT '',
    date_op TEXT NOT NULL DEFAULT (DATE('now')),
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS charges_fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle TEXT NOT NULL,
    categorie TEXT DEFAULT '',
    montant REAL NOT NULL,
    periodicite TEXT DEFAULT 'Mensuelle',
    date_debut TEXT DEFAULT NULL,
    actif INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS dettes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('a_payer','a_recevoir')),
    tiers TEXT NOT NULL,
    description TEXT DEFAULT '',
    montant_initial REAL NOT NULL,
    montant_restant REAL NOT NULL,
    date_echeance TEXT DEFAULT NULL,
    statut TEXT DEFAULT 'En cours',
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS fiscalite (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_taxe TEXT NOT NULL,
    periode TEXT NOT NULL,
    montant_du REAL DEFAULT 0,
    montant_paye REAL DEFAULT 0,
    date_limite TEXT DEFAULT NULL,
    statut TEXT DEFAULT 'Non payé',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS factures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    client_id INTEGER DEFAULT NULL,
    client_nom TEXT NOT NULL DEFAULT '',
    client_email TEXT DEFAULT '',
    client_telephone TEXT DEFAULT '',
    client_adresse TEXT DEFAULT '',
    service TEXT DEFAULT '',
    lignes TEXT NOT NULL DEFAULT '[]',
    montant_ht REAL NOT NULL DEFAULT 0,
    taux_tva REAL NOT NULL DEFAULT 18,
    montant_tva REAL NOT NULL DEFAULT 0,
    montant_ttc REAL NOT NULL DEFAULT 0,
    mode_paiement TEXT DEFAULT 'Espèces',
    statut TEXT DEFAULT 'En attente',
    notes TEXT DEFAULT '',
    date_facture TEXT NOT NULL DEFAULT (DATE('now')),
    date_echeance TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS devis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    client_id INTEGER DEFAULT NULL,
    client_nom TEXT NOT NULL DEFAULT '',
    client_email TEXT DEFAULT '',
    client_telephone TEXT DEFAULT '',
    client_adresse TEXT DEFAULT '',
    service TEXT DEFAULT '',
    lignes TEXT NOT NULL DEFAULT '[]',
    montant_ht REAL NOT NULL DEFAULT 0,
    taux_tva REAL NOT NULL DEFAULT 18,
    montant_tva REAL NOT NULL DEFAULT 0,
    montant_ttc REAL NOT NULL DEFAULT 0,
    statut TEXT DEFAULT 'Brouillon',
    notes TEXT DEFAULT '',
    date_devis TEXT NOT NULL DEFAULT (DATE('now')),
    date_validite TEXT DEFAULT NULL,
    facture_id INTEGER DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS stock_produits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT DEFAULT '',
    nom TEXT NOT NULL,
    categorie TEXT DEFAULT '',
    description TEXT DEFAULT '',
    prix_achat REAL DEFAULT 0,
    prix_vente REAL DEFAULT 0,
    quantite REAL DEFAULT 0,
    seuil_alerte REAL DEFAULT 5,
    unite TEXT DEFAULT 'unité',
    actif INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS stock_mouvements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id INTEGER NOT NULL,
    produit_nom TEXT DEFAULT '',
    type TEXT NOT NULL CHECK(type IN ('entree','sortie','ajustement')),
    quantite REAL NOT NULL,
    prix_unitaire REAL DEFAULT 0,
    montant_total REAL DEFAULT 0,
    reference TEXT DEFAULT '',
    motif TEXT DEFAULT '',
    mode_paiement TEXT DEFAULT 'Espèces',
    sync_finance INTEGER DEFAULT 0,
    date_mouvement TEXT NOT NULL DEFAULT (DATE('now')),
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
  )`).run();
}

// ─── Bootstrap admin entreprise ──────────────────────────────────────────────

function initAdminEntreprise(slug, adminData) {
  const db = getDb(slug);
  const existing = db.prepare("SELECT id FROM utilisateurs WHERE role = 'Administrateur'").get();
  if (!existing) {
    const hash = bcrypt.hashSync(adminData.motdepasse || 'Admin123!', 10);
    db.prepare(`INSERT INTO utilisateurs (pseudo, motdepasse, nom_complet, email, telephone, service, role, actif, date_creation)
      VALUES (?, ?, ?, ?, ?, 'Direction', 'Administrateur', 1, DATETIME('now'))`).run(
      adminData.pseudo || 'admin',
      hash,
      adminData.nom_complet || 'Administrateur',
      adminData.email || '',
      adminData.telephone || ''
    );
  }
}

// ─── Connexion utilisateur entreprise ────────────────────────────────────────

function verifyUser(slug, pseudo, motdepasse) {
  const db = getDb(slug);
  const user = db.prepare("SELECT * FROM utilisateurs WHERE pseudo = ?").get(pseudo);
  if (!user || user.actif !== 1) return null;
  if (!bcrypt.compareSync(motdepasse, user.motdepasse)) return null;
  db.prepare("UPDATE utilisateurs SET dernier_connexion = DATETIME('now') WHERE id = ?").run(user.id);
  return user;
}

// ─── Paramètres ──────────────────────────────────────────────────────────────

function getParametres(slug) {
  return getDb(slug).prepare("SELECT * FROM parametres WHERE id = 1").get() || {};
}

function saveParametres(slug, p) {
  getDb(slug).prepare(`INSERT OR REPLACE INTO parametres
    (id,nom_agence,telephone1,telephone2,whatsapp,email,site_web,adresse,ninea,
     registre_commerce,description,devise,taux_tva,banque,num_compte,
     wave_numero,wave_titulaire,orange_numero,orange_titulaire,free_numero,free_titulaire,
     logo,modele_facture,modele_devis)
    VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    p.nom_agence||'', p.telephone1||'', p.telephone2||'', p.whatsapp||'',
    p.email||'', p.site_web||'', p.adresse||'', p.ninea||'',
    p.registre_commerce||'', p.description||'', p.devise||'FCFA',
    p.taux_tva||18, p.banque||'', p.num_compte||'',
    p.wave_numero||'', p.wave_titulaire||'',
    p.orange_numero||'', p.orange_titulaire||'',
    p.free_numero||'', p.free_titulaire||'',
    p.logo||'', p.modele_facture||'', p.modele_devis||''
  );
}

// ─── Utilisateurs ────────────────────────────────────────────────────────────

function getAllUsers(slug) {
  return getDb(slug).prepare("SELECT * FROM utilisateurs ORDER BY actif DESC, role ASC, pseudo ASC").all();
}

function getUserByPseudo(slug, pseudo) {
  return getDb(slug).prepare("SELECT * FROM utilisateurs WHERE pseudo = ?").get(pseudo);
}

function getUserById(slug, id) {
  return getDb(slug).prepare("SELECT * FROM utilisateurs WHERE id = ?").get(id);
}

function createUser(slug, user) {
  const db = getDb(slug);
  const hash = bcrypt.hashSync(user.motdepasse || 'Welcome123!', 10);
  const info = db.prepare(`INSERT INTO utilisateurs
    (pseudo, motdepasse, nom_complet, telephone, email, service, role, actif, date_creation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'))`).run(
    user.pseudo, hash,
    user.nom_complet || '', user.telephone || '',
    user.email || '', user.service || '',
    user.role || 'Standard', Number(user.actif ?? 1)
  );
  return info.lastInsertRowid;
}

function updateUser(slug, user) {
  const db = getDb(slug);
  const fields = [user.pseudo, user.nom_complet||'', user.telephone||'', user.email||'', user.service||'', user.role||'Standard', Number(user.actif??1)];
  let sql = "UPDATE utilisateurs SET pseudo=?,nom_complet=?,telephone=?,email=?,service=?,role=?,actif=?";
  if (user.motdepasse) { sql += ",motdepasse=?"; fields.push(bcrypt.hashSync(user.motdepasse, 10)); }
  sql += " WHERE id=?";
  fields.push(user.id);
  db.prepare(sql).run(...fields);
}

function setUserStatus(slug, id, actif) {
  getDb(slug).prepare("UPDATE utilisateurs SET actif=? WHERE id=?").run(Number(actif), id);
}

function deleteUser(slug, id) {
  getDb(slug).prepare("DELETE FROM utilisateurs WHERE id=?").run(id);
}

function resetPassword(slug, id, motdepasse) {
  const hash = bcrypt.hashSync(motdepasse, 10);
  getDb(slug).prepare("UPDATE utilisateurs SET motdepasse=?,actif=1 WHERE id=?").run(hash, id);
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function getClients(slug) {
  return getDb(slug).prepare("SELECT id,nom,telephone,email,adresse,nationalite,statut,actif FROM clients ORDER BY id DESC").all();
}

function createClient(slug, client) {
  const info = getDb(slug).prepare(`INSERT INTO clients (nom,telephone,email,adresse,nationalite,statut,actif,created_at)
    VALUES (?,?,?,?,?,'Actif',1,DATETIME('now'))`).run(
    client.nom||'', client.telephone||'', client.email||'',
    client.adresse||'', client.nationalite||''
  );
  return info.lastInsertRowid;
}

function updateClient(slug, id, data) {
  getDb(slug).prepare(`UPDATE clients SET nom=?,telephone=?,email=?,adresse=?,nationalite=?,statut=? WHERE id=?`).run(
    data.nom||'', data.telephone||'', data.email||'',
    data.adresse||'', data.nationalite||'', data.statut||'Actif', id
  );
}

function deleteClient(slug, id) {
  getDb(slug).prepare("DELETE FROM clients WHERE id=?").run(id);
}

// ─── Dossiers ────────────────────────────────────────────────────────────────

function getDossiers(slug) {
  return getDb(slug).prepare(`SELECT d.id,d.client_id,d.service,d.statut,d.date_creation,d.date_echeance,
    d.montant,d.destination,d.notes,c.nom AS client_name
    FROM dossiers d LEFT JOIN clients c ON c.id=d.client_id
    ORDER BY d.id DESC`).all();
}

function createDossier(slug, dossier) {
  const info = getDb(slug).prepare(`INSERT INTO dossiers
    (client_id,service,statut,montant,destination,date_echeance,etapes_total,progress,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,DATETIME('now'),DATETIME('now'))`).run(
    dossier.client_id||null, dossier.service||'', dossier.statut||'En cours',
    dossier.montant||0, dossier.destination||'', dossier.date_echeance||null,
    dossier.etapes_total||5, dossier.progress||0, dossier.notes||''
  );
  return info.lastInsertRowid;
}

// ─── Finance & Caisse ────────────────────────────────────────────────────────

function getCaisseOperations(slug, mois) {
  const db = getDb(slug);
  if (mois) return db.prepare("SELECT * FROM caisse WHERE strftime('%Y-%m', date_op) = ? ORDER BY date_op DESC, id DESC").all(mois);
  return db.prepare("SELECT * FROM caisse ORDER BY date_op DESC, id DESC LIMIT 200").all();
}

function addCaisseOperation(slug, op) {
  const info = getDb(slug).prepare(`INSERT INTO caisse (type,categorie,description,montant,mode_paiement,reference,date_op)
    VALUES (?,?,?,?,?,?,?)`).run(
    op.type, op.categorie||'', op.description, op.montant,
    op.mode_paiement||'Espèces', op.reference||'', op.date_op||new Date().toISOString().split('T')[0]
  );
  return info.lastInsertRowid;
}

function deleteCaisseOperation(slug, id) {
  getDb(slug).prepare("DELETE FROM caisse WHERE id=?").run(id);
}

function getSoldeCaisse(slug) {
  const db = getDb(slug);
  const e = db.prepare("SELECT COALESCE(SUM(montant),0) as total FROM caisse WHERE type='entree'").get().total;
  const s = db.prepare("SELECT COALESCE(SUM(montant),0) as total FROM caisse WHERE type='sortie'").get().total;
  return { entrees: e, sorties: s, solde: e - s };
}

function getStatsMois(slug, mois) {
  const db = getDb(slug);
  const e = db.prepare("SELECT COALESCE(SUM(montant),0) as total FROM caisse WHERE type='entree' AND strftime('%Y-%m',date_op)=?").get(mois).total;
  const s = db.prepare("SELECT COALESCE(SUM(montant),0) as total FROM caisse WHERE type='sortie' AND strftime('%Y-%m',date_op)=?").get(mois).total;
  return { entrees: e, sorties: s, resultat: e - s };
}

function getChargesFixesTotal(slug) {
  return getDb(slug).prepare("SELECT COALESCE(SUM(montant),0) as total FROM charges_fixes WHERE actif=1").get().total;
}

// Charges fixes
function getChargesFixes(slug) {
  return getDb(slug).prepare("SELECT * FROM charges_fixes ORDER BY libelle ASC").all();
}

function addChargeFixer(slug, c) {
  const info = getDb(slug).prepare(`INSERT INTO charges_fixes (libelle,categorie,montant,periodicite,date_debut,actif)
    VALUES (?,?,?,?,?,1)`).run(c.libelle, c.categorie||'', c.montant, c.periodicite||'Mensuelle', c.date_debut||null);
  return info.lastInsertRowid;
}

function updateChargeFixer(slug, id, c) {
  getDb(slug).prepare("UPDATE charges_fixes SET libelle=?,categorie=?,montant=?,periodicite=?,actif=? WHERE id=?").run(
    c.libelle, c.categorie||'', c.montant, c.periodicite||'Mensuelle', c.actif??1, id
  );
}

function deleteChargeFixer(slug, id) {
  getDb(slug).prepare("DELETE FROM charges_fixes WHERE id=?").run(id);
}

// Dettes
function getDettes(slug) {
  return getDb(slug).prepare("SELECT * FROM dettes ORDER BY date_echeance ASC, id DESC").all();
}

function addDette(slug, d) {
  const info = getDb(slug).prepare(`INSERT INTO dettes (type,tiers,description,montant_initial,montant_restant,date_echeance,statut)
    VALUES (?,?,?,?,?,?,?)`).run(
    d.type, d.tiers, d.description||'', d.montant, d.montant,
    d.date_echeance||null, 'En cours'
  );
  return info.lastInsertRowid;
}

function rembourserDette(slug, id, montant_paye) {
  const db = getDb(slug);
  const d = db.prepare("SELECT * FROM dettes WHERE id=?").get(id);
  if (!d) return;
  const restant = Math.max(0, d.montant_restant - montant_paye);
  const statut = restant <= 0 ? 'Remboursé' : 'En cours';
  db.prepare("UPDATE dettes SET montant_restant=?,statut=? WHERE id=?").run(restant, statut, id);
}

function deleteDette(slug, id) {
  getDb(slug).prepare("DELETE FROM dettes WHERE id=?").run(id);
}

// Fiscalité
function getFiscalite(slug) {
  return getDb(slug).prepare("SELECT * FROM fiscalite ORDER BY date_limite ASC, id DESC").all();
}

function addFiscalite(slug, f) {
  const info = getDb(slug).prepare(`INSERT INTO fiscalite (type_taxe,periode,montant_du,montant_paye,date_limite,statut,notes)
    VALUES (?,?,?,0,?,?,?)`).run(
    f.type_taxe, f.periode, f.montant_du, f.date_limite||null, 'Non payé', f.notes||''
  );
  return info.lastInsertRowid;
}

function payerFiscalite(slug, id, montant) {
  const db = getDb(slug);
  const f = db.prepare("SELECT * FROM fiscalite WHERE id=?").get(id);
  if (!f) return;
  const paye = (f.montant_paye||0) + montant;
  const statut = paye >= f.montant_du ? 'Payé' : 'En cours';
  db.prepare("UPDATE fiscalite SET montant_paye=?,statut=? WHERE id=?").run(paye, statut, id);
}

function deleteFiscalite(slug, id) {
  getDb(slug).prepare("DELETE FROM fiscalite WHERE id=?").run(id);
}

// ─── Factures ────────────────────────────────────────────────────────────────

function getFactures(slug, mois) {
  const db = getDb(slug);
  if (mois) return db.prepare("SELECT * FROM factures WHERE strftime('%Y-%m',date_facture)=? ORDER BY id DESC").all(mois);
  return db.prepare("SELECT * FROM factures ORDER BY id DESC LIMIT 500").all();
}

function addFacture(slug, data) {
  const db = getDb(slug);
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as n FROM factures").get().n;
  const numero = 'FAC-' + year + '-' + String(count + 1).padStart(3, '0');
  const lignes = JSON.stringify(data.lignes || []);
  const ht = data.montant_ht || 0;
  const tva = data.taux_tva || 18;
  const tvaAmt = Math.round(ht * tva / 100);
  const ttc = ht + tvaAmt;
  const info = db.prepare(`INSERT INTO factures
    (numero,client_id,client_nom,client_email,client_telephone,client_adresse,service,
     lignes,montant_ht,taux_tva,montant_tva,montant_ttc,mode_paiement,statut,notes,date_facture,date_echeance)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    numero, data.client_id || null, data.client_nom || '',
    data.client_email || '', data.client_telephone || '', data.client_adresse || '',
    data.service || '', lignes, ht, tva, tvaAmt, ttc,
    data.mode_paiement || 'Espèces', data.statut || 'En attente',
    data.notes || '', data.date_facture || new Date().toISOString().split('T')[0],
    data.date_echeance || null
  );
  return { id: info.lastInsertRowid, numero };
}

function updateFactureStatut(slug, id, statut) {
  getDb(slug).prepare("UPDATE factures SET statut=? WHERE id=?").run(statut, id);
}

function deleteFacture(slug, id) {
  getDb(slug).prepare("DELETE FROM factures WHERE id=?").run(id);
}

function getStatsFactures(slug, mois) {
  const db = getDb(slug);
  if (mois) {
    const tot = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(montant_ttc),0) as montant FROM factures WHERE strftime('%Y-%m',date_facture)=?").get(mois);
    const payees = db.prepare("SELECT COUNT(*) as n FROM factures WHERE statut='Payée' AND strftime('%Y-%m',date_facture)=?").get(mois).n;
    const attente = db.prepare("SELECT COUNT(*) as n FROM factures WHERE statut='En attente' AND strftime('%Y-%m',date_facture)=?").get(mois).n;
    return { total: tot.n, montant: tot.montant, payees, attente };
  }
  const tot = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(montant_ttc),0) as montant FROM factures").get();
  const payees = db.prepare("SELECT COUNT(*) as n FROM factures WHERE statut='Payée'").get().n;
  const attente = db.prepare("SELECT COUNT(*) as n FROM factures WHERE statut='En attente'").get().n;
  return { total: tot.n, montant: tot.montant, payees, attente };
}

// ─── Devis ───────────────────────────────────────────────────────────────────

function getDevis(slug, mois) {
  const db = getDb(slug);
  if (mois) return db.prepare("SELECT * FROM devis WHERE strftime('%Y-%m',date_devis)=? ORDER BY id DESC").all(mois);
  return db.prepare("SELECT * FROM devis ORDER BY id DESC LIMIT 500").all();
}

function addDevis(slug, data) {
  const db = getDb(slug);
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as n FROM devis").get().n;
  const numero = 'DEV-' + year + '-' + String(count + 1).padStart(3, '0');
  const lignes = JSON.stringify(data.lignes || []);
  const ht = data.montant_ht || 0;
  const tva = data.taux_tva || 18;
  const tvaAmt = Math.round(ht * tva / 100);
  const ttc = ht + tvaAmt;
  const info = db.prepare(`INSERT INTO devis
    (numero,client_id,client_nom,client_email,client_telephone,client_adresse,service,
     lignes,montant_ht,taux_tva,montant_tva,montant_ttc,statut,notes,date_devis,date_validite)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    numero, data.client_id || null, data.client_nom || '',
    data.client_email || '', data.client_telephone || '', data.client_adresse || '',
    data.service || '', lignes, ht, tva, tvaAmt, ttc,
    data.statut || 'Brouillon', data.notes || '',
    data.date_devis || new Date().toISOString().split('T')[0],
    data.date_validite || null
  );
  return { id: info.lastInsertRowid, numero };
}

function updateDevisStatut(slug, id, statut) {
  getDb(slug).prepare("UPDATE devis SET statut=? WHERE id=?").run(statut, id);
}

function deleteDevis(slug, id) {
  getDb(slug).prepare("DELETE FROM devis WHERE id=?").run(id);
}

function getStatsDevis(slug, mois) {
  const db = getDb(slug);
  if (mois) {
    const tot = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(montant_ttc),0) as montant FROM devis WHERE strftime('%Y-%m',date_devis)=?").get(mois);
    const acceptes = db.prepare("SELECT COUNT(*) as n FROM devis WHERE statut='Accepté' AND strftime('%Y-%m',date_devis)=?").get(mois).n;
    const envoyes = db.prepare("SELECT COUNT(*) as n FROM devis WHERE statut='Envoyé' AND strftime('%Y-%m',date_devis)=?").get(mois).n;
    return { total: tot.n, montant: tot.montant, acceptes, envoyes };
  }
  const tot = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(montant_ttc),0) as montant FROM devis").get();
  const acceptes = db.prepare("SELECT COUNT(*) as n FROM devis WHERE statut='Accepté'").get().n;
  const envoyes = db.prepare("SELECT COUNT(*) as n FROM devis WHERE statut='Envoyé'").get().n;
  return { total: tot.n, montant: tot.montant, acceptes, envoyes };
}

// ─── Stock ────────────────────────────────────────────────────────────────────

function getStockProduits(slug) {
  return getDb(slug).prepare("SELECT * FROM stock_produits WHERE actif=1 ORDER BY categorie ASC, nom ASC").all();
}

function addStockProduit(slug, data) {
  const db = getDb(slug);
  const count = db.prepare("SELECT COUNT(*) as n FROM stock_produits").get().n;
  const ref = data.reference || ('ART-' + String(count + 1).padStart(3, '0'));
  const info = db.prepare(`INSERT INTO stock_produits
    (reference,nom,categorie,description,prix_achat,prix_vente,quantite,seuil_alerte,unite,actif)
    VALUES (?,?,?,?,?,?,?,?,?,1)`).run(
    ref, data.nom, data.categorie || '', data.description || '',
    data.prix_achat || 0, data.prix_vente || 0,
    data.quantite || 0, data.seuil_alerte || 5, data.unite || 'unité'
  );
  return info.lastInsertRowid;
}

function updateStockProduit(slug, id, data) {
  getDb(slug).prepare(`UPDATE stock_produits SET
    reference=?,nom=?,categorie=?,description=?,prix_achat=?,prix_vente=?,seuil_alerte=?,unite=?
    WHERE id=?`).run(
    data.reference || '', data.nom, data.categorie || '', data.description || '',
    data.prix_achat || 0, data.prix_vente || 0, data.seuil_alerte || 5,
    data.unite || 'unité', id
  );
}

function deleteStockProduit(slug, id) {
  getDb(slug).prepare("UPDATE stock_produits SET actif=0 WHERE id=?").run(id);
}

function addStockMouvement(slug, data) {
  const db = getDb(slug);
  const produit = db.prepare("SELECT * FROM stock_produits WHERE id=?").get(data.produit_id);
  if (!produit) throw new Error("Produit introuvable.");
  const qte = data.quantite || 0;
  const montant = qte * (data.prix_unitaire || 0);
  db.prepare(`INSERT INTO stock_mouvements
    (produit_id,produit_nom,type,quantite,prix_unitaire,montant_total,reference,motif,mode_paiement,sync_finance,date_mouvement)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    data.produit_id, produit.nom, data.type, qte,
    data.prix_unitaire || 0, montant,
    data.reference || '', data.motif || '',
    data.mode_paiement || 'Espèces',
    data.sync_finance ? 1 : 0,
    data.date_mouvement || new Date().toISOString().split('T')[0]
  );
  const newQte = data.type === 'entree'
    ? produit.quantite + qte
    : data.type === 'sortie'
      ? Math.max(0, produit.quantite - qte)
      : qte;
  db.prepare("UPDATE stock_produits SET quantite=? WHERE id=?").run(newQte, data.produit_id);
  return { montant, produit };
}

function getStockMouvements(slug, mois) {
  const db = getDb(slug);
  if (mois) return db.prepare("SELECT * FROM stock_mouvements WHERE strftime('%Y-%m',date_mouvement)=? ORDER BY id DESC").all(mois);
  return db.prepare("SELECT * FROM stock_mouvements ORDER BY id DESC LIMIT 500").all();
}

function getStockAlertes(slug) {
  return getDb(slug).prepare("SELECT * FROM stock_produits WHERE actif=1 AND quantite <= seuil_alerte ORDER BY quantite ASC").all();
}

function getStatsStock(slug) {
  const db = getDb(slug);
  const produits = db.prepare("SELECT COUNT(*) as n FROM stock_produits WHERE actif=1").get().n;
  const valeur = db.prepare("SELECT COALESCE(SUM(quantite * prix_achat),0) as v FROM stock_produits WHERE actif=1").get().v;
  const alertes = db.prepare("SELECT COUNT(*) as n FROM stock_produits WHERE actif=1 AND quantite <= seuil_alerte").get().n;
  const mois = new Date().toISOString().slice(0, 7);
  const sorties = db.prepare("SELECT COALESCE(SUM(montant_total),0) as v FROM stock_mouvements WHERE type='sortie' AND strftime('%Y-%m',date_mouvement)=?").get(mois).v;
  return { produits, valeur, alertes, sorties };
}

// ─── Billets ──────────────────────────────────────────────────────────────────

function getBillets(slug) {
  return getDb(slug).prepare("SELECT * FROM billets ORDER BY id DESC").all();
}

function addBillet(slug, data) {
  const db = getDb(slug);
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as n FROM billets").get().n;
  const numero = 'BIL-' + year + '-' + String(count + 1).padStart(3, '0');
  const info = db.prepare(`INSERT INTO billets
    (numero, passager, telephone, depart, arrivee, compagnie, date_depart, tarif, statut)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    numero,
    data.passager || '', data.telephone || '',
    data.depart || '', data.arrivee || '',
    data.compagnie || '', data.date_depart || '',
    data.tarif || 0, data.statut || 'Confirmé'
  );
  return { id: info.lastInsertRowid, numero };
}

function deleteBillet(slug, id) {
  getDb(slug).prepare("DELETE FROM billets WHERE id=?").run(id);
}

// ─── Réinitialisation données entreprise ─────────────────────────────────────

function getEngagements(slug) {
  return getDb(slug).prepare("SELECT * FROM engagements ORDER BY id DESC").all();
}

function createEngagement(slug, data) {
  const db = getDb(slug);
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as n FROM engagements").get().n;
  const numero = 'ENG-' + year + '-' + String(count + 1).padStart(3, '0');
  const info = db.prepare(`INSERT INTO engagements
    (numero, client, telephone, email, adresse, nationalite, type_document, num_document,
     destination, type_visa, date_voyage, frais, statut)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    numero,
    data.client || '',
    data.telephone || '',
    data.email || '',
    data.adresse || '',
    data.nationalite || '',
    data.type_document || 'Passeport',
    data.num_document || '',
    data.destination || '',
    data.type_visa || '',
    data.date_voyage || null,
    data.frais || 0,
    data.statut || 'Brouillon'
  );
  return { id: info.lastInsertRowid, numero };
}

function deleteEngagement(slug, id) {
  getDb(slug).prepare("DELETE FROM engagements WHERE id=?").run(id);
}

function resetCompanyData(slug) {
  const db = getDb(slug);
  db.prepare("DELETE FROM billets").run();
  db.prepare("DELETE FROM engagements").run();
  db.prepare("DELETE FROM dossiers").run();
  db.prepare("DELETE FROM clients").run();
  db.prepare("DELETE FROM caisse").run();
  db.prepare("DELETE FROM charges_fixes").run();
  db.prepare("DELETE FROM dettes").run();
  db.prepare("DELETE FROM fiscalite").run();
  db.prepare("DELETE FROM factures").run();
  db.prepare("DELETE FROM devis").run();
  db.prepare("DELETE FROM stock_mouvements").run();
  db.prepare("DELETE FROM stock_produits").run();
  db.prepare("DELETE FROM journal_activite").run();
  try { db.prepare("DELETE FROM sqlite_sequence WHERE name NOT IN ('utilisateurs')").run(); } catch(e) {}
}

// ─── Journal activité ────────────────────────────────────────────────────────

function logActivite(slug, utilisateur_id, utilisateur, action, details) {
  try {
    getDb(slug).prepare(`INSERT INTO journal_activite (utilisateur_id,utilisateur,action,details)
      VALUES (?,?,?,?)`).run(utilisateur_id||null, utilisateur||'', action, details||'');
  } catch(e) {}
}

const DEFAULT_ROLES = [
  'Administrateur', 'Responsable', 'Comptable', 'Caissier',
  'Agent Billetterie', 'Agent Visa', 'Agent Oumrah / Pèlerinage', 'Standard'
];

module.exports = {
  getDb,
  initAdminEntreprise,
  verifyUser,
  getParametres,
  saveParametres,
  getAllUsers,
  getUserByPseudo,
  getUserById,
  createUser,
  updateUser,
  setUserStatus,
  deleteUser,
  resetPassword,
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getDossiers,
  createDossier,
  getEngagements,
  createEngagement,
  deleteEngagement,
  getBillets,
  addBillet,
  deleteBillet,
  resetCompanyData,
  logActivite,
  // Finance & Caisse
  getCaisseOperations,
  addCaisseOperation,
  deleteCaisseOperation,
  getSoldeCaisse,
  getStatsMois,
  getChargesFixesTotal,
  getChargesFixes,
  addChargeFixer,
  updateChargeFixer,
  deleteChargeFixer,
  getDettes,
  addDette,
  rembourserDette,
  deleteDette,
  getFiscalite,
  addFiscalite,
  payerFiscalite,
  deleteFiscalite,
  getFactures,
  addFacture,
  updateFactureStatut,
  deleteFacture,
  getStatsFactures,
  getDevis,
  addDevis,
  updateDevisStatut,
  deleteDevis,
  getStatsDevis,
  getStockProduits,
  addStockProduit,
  updateStockProduit,
  deleteStockProduit,
  addStockMouvement,
  getStockMouvements,
  getStockAlertes,
  getStatsStock,
  DEFAULT_ROLES
};
