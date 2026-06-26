const { getUserByPseudo, recordLogin } = require("./database");
const bcrypt = require("bcrypt");

function verifierConnexion(pseudo, motdepasse) {
    const utilisateur = getUserByPseudo(pseudo);
    if (!utilisateur || Number(utilisateur.actif) !== 1) {
        return null;
    }

    if (!bcrypt.compareSync(motdepasse, utilisateur.motdepasse)) {
        return null;
    }

    recordLogin(utilisateur.id);
    return utilisateur;
}

module.exports = verifierConnexion;