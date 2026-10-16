import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = [
  "index.html", "meny.html", "om-gojo.html", "boka.html", "kontakt.html",
  "hantera-bokning.html", "integritet.html", "styles.css", "script.js"
];
const directories = ["assets", "css", "js", "admin"];

for (const file of files) {
  if (!existsSync(file)) throw new Error(`Missing public file: ${file}`);
  cpSync(file, join(out, file));
}
for (const directory of directories) {
  if (!existsSync(directory)) throw new Error(`Missing public directory: ${directory}`);
  cpSync(directory, join(out, directory), { recursive: true });
}

console.log(`Built static site into ${out}/`);
