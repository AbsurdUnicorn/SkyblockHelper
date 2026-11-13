// Publishes a new version: bumps the patch version (or uses the one you pass), builds the installer,
// and uploads it to a GitHub Release. Installed apps find it there and update themselves.
// Usage:  npm run release            -> 1.0.0 becomes 1.0.1
//         npm run release -- 1.2.0   -> exactly 1.2.0
// Needs the GitHub CLI (gh) signed in. Uses only Releases (file uploads), not GitHub Actions.
const { execSync } = require("child_process");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const run = cmd => execSync(cmd, { cwd: root, stdio: "inherit" });

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const next = process.argv[2] || pkg.version.replace(/(\d+)$/, n => +n + 1);
if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error("Version must look like 1.2.3");
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
run("npx electron-builder --win nsis --publish never");

const dist = path.join(root, "dist");
const files = fs.readdirSync(dist).filter(f => f === "latest.yml" || f.endsWith(`${next}.exe`) || f.endsWith(`${next}.exe.blockmap`)).map(f => `"dist/${f}"`);
if (files.length < 3) throw new Error("Build output missing: " + files.join(", "));
run(`git add package.json && git commit -m "Release ${next}" && git push`);
run(`gh release create v${next} ${files.join(" ")} --title "SkyBlock Helper ${next}" --notes "Installed apps update to this version automatically."`);
console.log(`\nReleased ${next}.`);
