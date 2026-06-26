const { db } = require("./database");
const bcrypt = require("bcrypt");

const pseudo = "utilisateur";
const motdepasse = "123456";
const role = "Standard";

const hash = bcrypt.hashSync(motdepasse, 10);

try {
    db.prepare(`
        INSERT INTO utilisateurs (pseudo, motdepasse, nom_complet, email, telephone, service, role, actif, date_creation)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, DATETIME('now'))
    `).run(
        pseudo,
        hash,
        'Utilisateur test',
        'utilisateur@aplmbuzness.com',
        '+221000000001',
        'Support',
        role
    );

    console.log("Utilisateur créé avec succès !");
} catch (e) {
    console.log("L'utilisateur existe déjà.");
}