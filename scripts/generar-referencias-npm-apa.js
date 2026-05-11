/**
 * Genera referencias tipo APA 7 para todos los paquetes de npm ls --json (incluye subdependencias).
 * Uso: node scripts/generar-referencias-npm-apa.js
 */
const fs = require("fs");
const path = require("path");

function walkDeps(deps, acc) {
  if (!deps || typeof deps !== "object") return;
  for (const [name, meta] of Object.entries(deps)) {
    if (meta && typeof meta === "object" && meta.version) {
      acc.add(`${name}@${meta.version}`);
    }
    if (meta.dependencies) walkDeps(meta.dependencies, acc);
  }
}

function collectFromLockfileOrLs(jsonPath) {
  let raw = fs.readFileSync(jsonPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const j = JSON.parse(raw);
  const acc = new Set();
  if (j.dependencies) walkDeps(j.dependencies, acc);
  return acc;
}

function parseKey(kv) {
  const at = kv.lastIndexOf("@");
  if (at <= 0) return { name: kv, version: "" };
  const name = kv.slice(0, at);
  const version = kv.slice(at + 1);
  return { name, version };
}

function npmUrl(name) {
  return `https://www.npmjs.com/package/${name}`;
}

function main() {
  const root = path.join(__dirname, "..");
  const backendJson = path.join(root, "npm-ls-backend.json");
  const frontendJson = path.join(root, "alertas-frontend", "npm-ls-frontend.json");

  const all = new Set();
  if (fs.existsSync(backendJson)) {
    for (const x of collectFromLockfileOrLs(backendJson)) all.add(x);
  }
  if (fs.existsSync(frontendJson)) {
    for (const x of collectFromLockfileOrLs(frontendJson)) all.add(x);
  }

  const entries = [...all].map(parseKey).sort((a, b) => {
    const c = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    if (c !== 0) return c;
    return a.version.localeCompare(b.version, "es", { numeric: true });
  });

  // APA 7: sin autor identificable, el título va primero (Manual APA, software).
  const lines = entries.map(({ name, version }) => {
    // APA 7: sin autor, el título del trabajo va primero (cursiva en el documento final).
    return `*${name}* (versión ${version}) [Software]. (s. f.). Registro de paquetes npm. ${npmUrl(
      name
    )}`;
  });

  const header = [
    "Referencias — paquetes npm (dependencias y subdependencias)",
    `Total de entradas únicas (nombre@versión): ${entries.length}`,
    "Formato: título primero cuando el autor del paquete no se detalla; (s. f.) = sin fecha en la fuente.",
    "Ajusta en Word: título Referencias, orden alfabético, sangría francesa, mismo interlineado que el cuerpo.",
    "",
  ].join("\n");

  const outPath = path.join(root, "REFERENCIAS_NPM_COMPLETAS_APA.txt");
  fs.writeFileSync(outPath, `${header}\n${lines.join("\n\n")}\n`, "utf8");
  console.log(`Escrito: ${outPath} (${entries.length} paquetes)`);
}

main();
