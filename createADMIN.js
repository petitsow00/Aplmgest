const { db } = require("./database");
const bcrypt = require("bcrypt");

const pseudo = "admin";
const motdepasse = "123456";
const role = "Administrateur";

const hash = bcrypt.hashSync(motdepasse, 10);

try {
    db.prepare(`
        INSERT INTO utilisateurs (pseudo, motdepasse, nom_complet, email, telephone, service, role, actif, date_creation)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, DATETIME('now'))
    `).run(pseudo, hash, 'Administrateur du système', 'admin@aplmbuzness.com', '+221000000000', 'Direction', role);

    console.log("Administrateur créé avec succès !");
} catch (e) {
    console.log("L'administrateur existe déjà.");
}