const Database = require("better-sqlite3");
const fs = require("fs");
const DB_NAME = "yvas_code.db";
[DB_NAME].forEach(name => {
  console.log("---", name, "exists=", fs.existsSync(name));
  if (fs.existsSync(name)) {
    try {
      const db = new Database(name, { readonly: true });
      const rows = db.prepare("SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name").all();
      console.log("schema", name, JSON.stringify(rows, null, 2));
      if (rows.some(r => r.name === "utilisateurs")) {
        const cols = db.prepare("PRAGMA table_info(utilisateurs)").all();
        console.log("utilisateurs cols", JSON.stringify(cols, null, 2));
      }
    } catch (e) {
      console.error("ERROR", name, e.message);
    }
  }
});
