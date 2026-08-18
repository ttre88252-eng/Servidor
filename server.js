// ============================================================
// Servidor de archivos local multiusuario — estilo consola
// Corre en Termux (Node.js). Sirve en tu red local (Wi-Fi):
// otros dispositivos en la misma red pueden entrar con tu IP.
// Cada usuario solo ve sus propios archivos (aislados en disco
// y protegidos por sesión + PIN de 4 cifras obligatorio por usuario).
// ============================================================

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const STORAGE_DIR = path.join(__dirname, "storage");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PORT = process.env.PORT || 8080;

for (const dir of [DATA_DIR, STORAGE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------- "Base de datos" en JSON plano ----------------
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: [], files: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();
if (!db.settings) db.settings = { googleCx: "" };

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 64).toString("hex");
}

function uid() {
  return crypto.randomBytes(8).toString("hex");
}

function sanitizeName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180);
}

function userDir(userId) {
  const dir = path.join(STORAGE_DIR, userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function kindOf(mime) {
  if (!mime) return "documento";
  if (mime.startsWith("image/")) return "foto";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    avatar: u.avatar || "",
    hasPin: !!u.pinHash,
    theme: u.theme || { bg: "azul", accent: "#3AA6FF", font: "sistema" },
    createdAt: u.createdAt,
  };
}

// ---------------- App ----------------
const app = express();
app.use(express.json({ limit: "8mb" })); // suficiente para avatares en base64
app.use(cookieParser());
app.use(
  session({
    secret: crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 días
  })
);
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "No hay sesión activa" });
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: "Usuario no encontrado" });
  req.user = user;
  next();
}

// No hay contraseña general del servidor: la seguridad es por usuario,
// mediante un PIN de 4 cifras obligatorio en cada perfil (ver /api/users
// y /api/login más abajo).

// ---------------- Usuarios ----------------
app.get("/api/users", (req, res) => {
  res.json(db.users.map(publicUser));
});

app.post("/api/users", (req, res) => {
  const { name, pin, avatar } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Falta el nombre" });
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: "El PIN es obligatorio y debe tener exactamente 4 cifras" });
  }
  if (db.users.some((u) => u.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: uid(),
    name: name.trim(),
    avatar: avatar || "",
    salt,
    pinHash: hashPin(pin, salt),
    createdAt: Date.now(),
  };
  db.users.push(user);
  saveDB(db);
  userDir(user.id);
  res.json(publicUser(user));
});

app.delete("/api/users/:id", requireAuth, (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: "Solo puedes borrar tu propia cuenta" });
  db.files = db.files.filter((f) => f.userId !== req.user.id);
  db.users = db.users.filter((u) => u.id !== req.user.id);
  saveDB(db);
  fs.rmSync(userDir(req.user.id), { recursive: true, force: true });
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// ---------------- Sesión / login ----------------
app.post("/api/login", (req, res) => {
  const { userId, pin } = req.body || {};
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (user.pinHash) {
    if (!pin || hashPin(pin, user.salt) !== user.pinHash) {
      return res.status(401).json({ error: "PIN incorrecto" });
    }
  }
  req.session.userId = user.id;
  res.json(publicUser(user));
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---------------- Buscador web (Google Programmable Search Engine) ----------------
// Configuración compartida por todo el servidor: cualquier usuario logueado
// puede ver si ya está configurado; solo hace falta configurarlo una vez.
app.get("/api/search-settings", requireAuth, (req, res) => {
  res.json({ googleCx: db.settings.googleCx || "" });
});

app.put("/api/search-settings", requireAuth, (req, res) => {
  const { googleCx } = req.body || {};
  db.settings.googleCx = (googleCx || "").trim();
  saveDB(db);
  res.json({ googleCx: db.settings.googleCx });
});

app.get("/api/me", (req, res) => {
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: "No hay sesión activa" });
  res.json(publicUser(user));
});

// Editar el perfil propio: nombre, avatar, tema (fondo/fuente/color) y PIN.
// Para cambiar o quitar el PIN, si ya tenías uno, hace falta el PIN actual.
app.put("/api/me", requireAuth, (req, res) => {
  const { name, avatar, theme, currentPin, newPin } = req.body || {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: "El nombre no puede estar vacío" });
    if (db.users.some((u) => u.id !== req.user.id && u.name.toLowerCase() === trimmed.toLowerCase())) {
      return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
    }
    req.user.name = trimmed;
  }

  if (avatar !== undefined) {
    if (avatar && avatar.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: "La imagen de perfil es demasiado grande" });
    }
    req.user.avatar = avatar || "";
  }

  if (theme !== undefined) {
    req.user.theme = {
      bg: theme.bg || "azul",
      accent: theme.accent || "#3AA6FF",
      font: theme.font || "sistema",
    };
  }

  if (newPin !== undefined && newPin !== "" && newPin !== null) {
    if (req.user.pinHash) {
      if (!currentPin || hashPin(currentPin, req.user.salt) !== req.user.pinHash) {
        return res.status(401).json({ error: "El PIN actual no coincide" });
      }
    }
    if (!/^\d{4}$/.test(String(newPin))) {
      return res.status(400).json({ error: "El PIN debe tener exactamente 4 cifras" });
    }
    req.user.salt = crypto.randomBytes(16).toString("hex");
    req.user.pinHash = hashPin(newPin, req.user.salt);
  }

  saveDB(db);
  res.json(publicUser(req.user));
});

// ---------------- Archivos ----------------
const storageEngine = multer.diskStorage({
  destination: (req, file, cb) => cb(null, userDir(req.user.id)),
  filename: (req, file, cb) => {
    const id = uid();
    const original = sanitizeName(Buffer.from(file.originalname, "latin1").toString("utf8"));
    cb(null, `${id}__${original}`);
  },
});
const upload = multer({ storage: storageEngine, limits: { fileSize: 1024 * 1024 * 1024 * 5 } }); // hasta 5GB por archivo

app.get("/api/files", requireAuth, (req, res) => {
  const mine = db.files
    .filter((f) => f.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((f) => ({ ...f, kind: kindOf(f.mime) }));
  res.json(mine);
});

app.post("/api/upload", requireAuth, upload.array("files", 50), (req, res) => {
  const created = [];
  for (const file of req.files || []) {
    const record = {
      id: file.filename.split("__")[0],
      userId: req.user.id,
      name: Buffer.from(file.originalname, "latin1").toString("utf8"),
      mime: file.mimetype || "application/octet-stream",
      size: file.size,
      storedAs: file.filename,
      createdAt: Date.now(),
    };
    db.files.push(record);
    created.push({ ...record, kind: kindOf(record.mime) });
  }
  saveDB(db);
  res.json(created);
});

function findOwnedFile(req, res) {
  const f = db.files.find((x) => x.id === req.params.id);
  if (!f) {
    res.status(404).json({ error: "Archivo no encontrado" });
    return null;
  }
  if (f.userId !== req.user.id) {
    res.status(403).json({ error: "No tienes acceso a este archivo" });
    return null;
  }
  return f;
}

app.get("/api/files/:id/raw", requireAuth, (req, res) => {
  const f = findOwnedFile(req, res);
  if (!f) return;
  const filePath = path.join(userDir(req.user.id), f.storedAs);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "El archivo ya no existe en disco" });
  res.setHeader("Content-Type", f.mime);
  res.sendFile(filePath);
});

app.get("/api/files/:id/download", requireAuth, (req, res) => {
  const f = findOwnedFile(req, res);
  if (!f) return;
  const filePath = path.join(userDir(req.user.id), f.storedAs);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "El archivo ya no existe en disco" });
  res.download(filePath, f.name);
});

app.delete("/api/files/:id", requireAuth, (req, res) => {
  const f = findOwnedFile(req, res);
  if (!f) return;
  const filePath = path.join(userDir(req.user.id), f.storedAs);
  fs.rm(filePath, { force: true }, () => {});
  db.files = db.files.filter((x) => x.id !== f.id);
  saveDB(db);
  res.json({ ok: true });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Manejo de errores (por ejemplo, límite de tamaño al subir con multer).
// Sin esto, un error al subir se devolvía como página HTML de error y el
// cliente no podía mostrar un mensaje claro de por qué falló.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let msg = "No se pudo subir el archivo.";
    if (err.code === "LIMIT_FILE_SIZE") msg = "El archivo supera el límite de 5GB por archivo.";
    else if (err.code === "LIMIT_UNEXPECTED_FILE") msg = "Se intentaron subir demasiados archivos a la vez (máximo 50).";
    return res.status(400).json({ error: msg });
  }
  if (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
  next();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  ✔ Servidor de archivos corriendo");
  console.log(`  → En este mismo dispositivo: http://localhost:${PORT}`);
  console.log(`  → Desde otro dispositivo en tu Wi-Fi: http://TU_IP_LOCAL:${PORT}`);
  console.log("    (mira tu IP con: ifconfig  o  ip addr)");
  console.log("");
});
