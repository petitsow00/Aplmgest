const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const fs = require("fs");

const DATA_DIR = process.env.APLM_DATA_PATH || __dirname;
const PLATFORM_DB_PATH = path.join(DATA_DIR, "aplmgest_platform.db");
const COMPANIES_DIR = path.join(DATA_DIR, "companies");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(COMPANIES_DIR)) fs.mkdirSync(COMPANIES_DIR, { recursive: true });

const db = new Database(PLATFORM_DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Tables ─────────────────────────────────────────────────────────────────

db.prepare(`CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT UNIQUE NOT NULL,
  motdepasse TEXT NOT NULL,
  nom_complet TEXT DEFAULT '',
  email TEXT DEFAULT '',
  actif INTEGER NOT NULL DEFAULT 1,
  date_creation TEXT NOT NULL DEFAULT (DATETIME('now')),
  dernier_connexion TEXT DEFAULT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS entreprises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  secteur TEXT DEFAULT '',
  telephone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  adresse TEXT DEFAULT '',
  pays TEXT DEFAULT 'Sénégal',
  logo TEXT DEFAULT '',
  modules TEXT DEFAULT '{"crm":true,"finance":true,"billetterie":true,"visa":true,"oumrah":true,"transfert":true,"hotel":true,"assurance":true,"rh":true,"comptabilite":true}',
  statut TEXT DEFAULT 'Actif',
  type_licence TEXT DEFAULT 'Standard',
  date_activation TEXT DEFAULT (DATE('now')),
  date_expiration TEXT DEFAULT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT DEFAULT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS journal_platform (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER DEFAULT NULL,
  entreprise_nom TEXT DEFAULT '',
  utilisateur TEXT DEFAULT '',
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
)`).run();

// ─── Super Admin par défaut ──────────────────────────────────────────────────

const existingSA = db.prepare("SELECT id FROM super_admins WHERE pseudo = 'superadmin'").get();
if (!existingSA) {
  const hash = bcrypt.hashSync("superadmin123", 10);
  db.prepare(`INSERT INTO super_admins (pseudo, motdepasse, nom_complet, email, actif)
    VALUES ('superadmin', ?, 'Super Administrateur APLMGEST', 'admin@aplmgest.com', 1)`).run(hash);
}

// ─── Fonctions Super Admin ───────────────────────────────────────────────────

function getSuperAdminByPseudo(pseudo) {
  return db.prepare("SELECT * FROM super_admins WHERE pseudo = ?").get(pseudo);
}

function verifySuperAdmin(pseudo, motdepasse) {
  const sa = getSuperAdminByPseudo(pseudo);
  if (!sa || sa.actif !== 1) return null;
  if (!bcrypt.compareSync(motdepasse, sa.motdepasse)) return null;
  db.prepare("UPDATE super_admins SET dernier_connexion = DATETIME('now') WHERE id = ?").run(sa.id);
  return sa;
}

function changeSuperAdminPassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE super_admins SET motdepasse = ? WHERE id = ?").run(hash, id);
}

// ─── Fonctions Entreprises ───────────────────────────────────────────────────

function getAllEntreprises() {
  return db.prepare("SELECT * FROM entreprises ORDER BY nom ASC").all();
}

function getActiveEntreprises() {
  return db.prepare("SELECT id, slug, nom, secteur, statut, type_licence, date_expiration, modules FROM entreprises WHERE statut = 'Actif' ORDER BY nom ASC").all();
}

function getEntrepriseBySlug(slug) {
  return db.prepare("SELECT * FROM entreprises WHERE slug = ?").get(slug);
}

function getEntrepriseById(id) {
  return db.prepare("SELECT * FROM entreprises WHERE id = ?").get(id);
}

function createEntreprise(data) {
  const slug = genSlug(data.nom);
  const existing = db.prepare("SELECT id FROM entreprises WHERE slug = ?").get(slug);
  if (existing) throw new Error("Une entreprise avec ce nom existe déjà.");

  const modules = JSON.stringify(data.modules || {
    crm: true, finance: true, billetterie: true, visa: true, oumrah: true,
    transfert: true, hotel: true, assurance: true, rh: false, comptabilite: true
  });

  const info = db.prepare(`INSERT INTO entreprises
    (slug, nom, secteur, telephone, email, adresse, pays, modules, statut, type_licence, date_activation, date_expiration, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Actif', ?, DATE('now'), ?, ?)`).run(
    slug,
    data.nom,
    data.secteur || '',
    data.telephone || '',
    data.email || '',
    data.adresse || '',
    data.pays || 'Sénégal',
    modules,
    data.type_licence || 'Standard',
    data.date_expiration || null,
    data.notes || ''
  );

  logPlatform(null, '', 'SUPER_ADMIN', 'CREATION_ENTREPRISE', `Entreprise "${data.nom}" créée (slug: ${slug})`);
  return { id: info.lastInsertRowid, slug };
}

function updateEntreprise(id, data) {
  const modules = data.modules ? JSON.stringify(data.modules) : undefined;
  const ent = getEntrepriseById(id);
  if (!ent) throw new Error("Entreprise introuvable.");

  db.prepare(`UPDATE entreprises SET
    nom = ?, secteur = ?, telephone = ?, email = ?, adresse = ?, pays = ?,
    statut = ?, type_licence = ?, date_expiration = ?, notes = ?,
    ${modules !== undefined ? 'modules = ?,' : ''}
    updated_at = DATETIME('now') WHERE id = ?`).run(
    ...[data.nom || ent.nom, data.secteur || '', data.telephone || '',
    data.email || '', data.adresse || '', data.pays || 'Sénégal',
    data.statut || ent.statut, data.type_licence || ent.type_licence,
    data.date_expiration || null, data.notes || '',
    ...(modules !== undefined ? [modules] : []),
    id]
  );
  logPlatform(id, ent.nom, 'SUPER_ADMIN', 'MODIF_ENTREPRISE', `Entreprise "${ent.nom}" modifiée`);
}

function setEntrepriseStatut(id, statut) {
  const ent = getEntrepriseById(id);
  if (!ent) return;
  db.prepare("UPDATE entreprises SET statut = ?, updated_at = DATETIME('now') WHERE id = ?").run(statut, id);
  logPlatform(id, ent.nom, 'SUPER_ADMIN', 'STATUT_ENTREPRISE', `Statut → ${statut}`);
}

function deleteEntreprise(id) {
  const ent = getEntrepriseById(id);
  if (!ent) return;
  const dbFile = path.join(COMPANIES_DIR, ent.slug + ".db");
  db.prepare("DELETE FROM entreprises WHERE id = ?").run(id);
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  logPlatform(null, ent.nom, 'SUPER_ADMIN', 'SUPPRESSION_ENTREPRISE', `Entreprise "${ent.nom}" supprimée`);
}

function getEntrepriseModules(slug) {
  const ent = getEntrepriseBySlug(slug);
  if (!ent) return {};
  try { return JSON.parse(ent.modules || '{}'); } catch(e) { return {}; }
}

// ─── Journal plateforme ──────────────────────────────────────────────────────

function logPlatform(entreprise_id, entreprise_nom, utilisateur, action, details) {
  try {
    db.prepare(`INSERT INTO journal_platform (entreprise_id, entreprise_nom, utilisateur, action, details)
      VALUES (?, ?, ?, ?, ?)`).run(entreprise_id || null, entreprise_nom || '', utilisateur || '', action, details || '');
  } catch(e) {}
}

function getJournalPlatform(limit) {
  return db.prepare("SELECT * FROM journal_platform ORDER BY id DESC LIMIT ?").all(limit || 100);
}

// ─── Statistiques globales ───────────────────────────────────────────────────

function getConfig(key) {
  const row = db.prepare("SELECT value FROM config WHERE key=?").get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare("INSERT OR REPLACE INTO config (key,value) VALUES (?,?)").run(key, value || '');
}

function resetPlatform() {
  const all = getAllEntreprises();
  all.forEach(function(ent) {
    const dbFile = path.join(COMPANIES_DIR, ent.slug + ".db");
    if (fs.existsSync(dbFile)) {
      try { fs.unlinkSync(dbFile); } catch(e) {}
    }
  });
  db.prepare("DELETE FROM entreprises").run();
  db.prepare("DELETE FROM journal_platform").run();
  try { db.prepare("DELETE FROM sqlite_sequence WHERE name='entreprises' OR name='journal_platform'").run(); } catch(e) {}
  logPlatform(null, '', 'SUPER_ADMIN', 'RESET_PLATEFORME', 'Réinitialisation complète de la plateforme');
}

function resetCompanyDataFromPlatform(slug) {
  const ent = getEntrepriseBySlug(slug);
  if (!ent) throw new Error("Entreprise introuvable.");
  logPlatform(ent.id, ent.nom, 'SUPER_ADMIN', 'RESET_ENTREPRISE', 'Données de l\'entreprise réinitialisées');
}

function getStatsPlatform() {
  const total = db.prepare("SELECT COUNT(*) as n FROM entreprises").get().n;
  const actives = db.prepare("SELECT COUNT(*) as n FROM entreprises WHERE statut = 'Actif'").get().n;
  const suspendues = db.prepare("SELECT COUNT(*) as n FROM entreprises WHERE statut = 'Suspendu'").get().n;
  const expirees = db.prepare("SELECT COUNT(*) as n FROM entreprises WHERE statut = 'Expiré'").get().n;
  return { total, actives, suspendues, expirees };
}

// ─── Utilitaires ────────────────────────────────────────────────────────────

function genSlug(nom) {
  return nom.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40) + '_' + Date.now().toString(36);
}

function getCompanyDbPath(slug) {
  return path.join(COMPANIES_DIR, slug + ".db");
}

module.exports = {
  verifySuperAdmin,
  changeSuperAdminPassword,
  getAllEntreprises,
  getActiveEntreprises,
  getEntrepriseBySlug,
  getEntrepriseById,
  createEntreprise,
  updateEntreprise,
  setEntrepriseStatut,
  deleteEntreprise,
  getEntrepriseModules,
  logPlatform,
  getJournalPlatform,
  getStatsPlatform,
  getCompanyDbPath,
  getConfig,
  setConfig,
  resetPlatform,
  resetCompanyDataFromPlatform
};
