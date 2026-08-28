import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "SOCIAL_LITE_CHANGE_THIS_SECRET_123456789";

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const DB_FILE = path.join(DATA_DIR, "database.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function createEmptyDatabase() {
  return {
    users: [],
    posts: [],
    likes: [],
    comments: [],
    follows: [],
    counters: {
      users: 1,
      posts: 1,
      comments: 1
    }
  };
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const db = createEmptyDatabase();
      saveDB(db);
      return db;
    }

    const raw = fs.readFileSync(DB_FILE, "utf8");

    if (!raw.trim()) {
      const db = createEmptyDatabase();
      saveDB(db);
      return db;
    }

    const db = JSON.parse(raw);

    db.users ??= [];
    db.posts ??= [];
    db.likes ??= [];
    db.comments ??= [];
    db.follows ??= [];
    db.counters ??= {};

    db.counters.users ??= 1;
    db.counters.posts ??= 1;
    db.counters.comments ??= 1;

    return db;
  } catch (error) {
    console.error("Database o'qishda xato:", error);

    const backup = `${DB_FILE}.broken-${Date.now()}`;

    try {
      if (fs.existsSync(DB_FILE)) {
        fs.copyFileSync(DB_FILE, backup);
      }
    } catch {}

    const db = createEmptyDatabase();
    saveDB(db);

    return db;
  }
}

function saveDB(db) {
  const temp = `${DB_FILE}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(db, null, 2),
    "utf8"
  );

  fs.renameSync(temp, DB_FILE);
}

let db = loadDB();

function nextId(type) {
  const id = db.counters[type] || 1;
  db.counters[type] = id + 1;
  return id;
}

function now() {
  return new Date().toISOString();
}

function publicUser(userOrId) {
  const user =
    typeof userOrId === "object"
      ? userOrId
      : db.users.find(
          (u) => u.id === Number(userOrId)
        );

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    bio: user.bio,
    avatar: user.avatar,
    created_at: user.created_at
  };
}

function findUserById(id) {
  return db.users.find(
    (user) => user.id === Number(id)
  );
}

function findPostById(id) {
  return db.posts.find(
    (post) => post.id === Number(id)
  );
}

function deleteUploadFile(fileUrl) {
  if (!fileUrl) {
    return;
  }

  const cleanPath = fileUrl
    .replace(/^\/+/, "")
    .replace(/\//g, path.sep);

  const file = path.join(
    __dirname,
    "public",
    cleanPath
  );

  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch {}
}

const storage = multer.diskStorage({
  destination: (_, __, callback) => {
    callback(null, UPLOAD_DIR);
  },

  filename: (_, file, callback) => {
    const ext = path
      .extname(file.originalname)
      .toLowerCase();

    const safeExt = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif"
    ].includes(ext)
      ? ext
      : ".jpg";

    const random =
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2);

    callback(
      null,
      `${Date.now()}-${random}${safeExt}`
    );
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 8 * 1024 * 1024
  },

  fileFilter: (_, file, callback) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error(
          "Faqat JPG, PNG, WEBP yoki GIF rasmlar mumkin."
        )
      );
    }

    callback(null, true);
  }
});

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(cookieParser());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

function auth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      error: "Avval tizimga kiring."
    });
  }

  try {
    const payload = jwt.verify(
      token,
      JWT_SECRET
    );

    const user = findUserById(payload.id);

    if (!user) {
      res.clearCookie("token");

      return res.status(401).json({
        error: "Foydalanuvchi topilmadi."
      });
    }

    req.userId = user.id;

    next();
  } catch {
    res.clearCookie("token");

    return res.status(401).json({
      error: "Sessiya tugagan."
    });
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    req.userId = null;
    return next();
  }

  try {
    const payload = jwt.verify(
      token,
      JWT_SECRET
    );

    const user = findUserById(payload.id);

    req.userId = user
      ? user.id
      : null;
  } catch {
    req.userId = null;
  }

  next();
}

function issueToken(userId) {
  return jwt.sign(
    {
      id: userId
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

function setAuthCookie(res, token) {
  res.cookie(
    "token",
    token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production",
      maxAge:
        7 *
        24 *
        60 *
        60 *
        1000
    }
  );
}

function getPostResponse(
  post,
  currentUserId = null
) {
  const user = findUserById(post.user_id);

  if (!user) {
    return null;
  }

  const likes = db.likes.filter(
    (like) =>
      like.post_id === post.id
  );

  const comments = db.comments.filter(
    (comment) =>
      comment.post_id === post.id
  );

  return {
    id: post.id,
    image: post.image,
    caption: post.caption,
    created_at: post.created_at,

    user_id: user.id,
    username: user.username,
    name: user.name,
    avatar: user.avatar,

    liked:
      currentUserId
        ? likes.some(
            (like) =>
              like.user_id ===
              currentUserId
          )
        : false,

    likes_count: likes.length,

    comments_count:
      comments.length
  };
}

function sortNewest(items) {
  return [...items].sort(
    (a, b) =>
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
  );
}

/* =========================
   AUTH
========================= */

app.get(
  "/api/me",
  optionalAuth,
  (req, res) => {
    if (!req.userId) {
      return res.json({
        user: null
      });
    }

    res.json({
      user: publicUser(req.userId)
    });
  }
);

app.post(
  "/api/register",
  async (req, res) => {
    try {
      let {
        username,
        email,
        password,
        name
      } = req.body;

      username = String(
        username || ""
      )
        .trim()
        .toLowerCase();

      email = String(
        email || ""
      )
        .trim()
        .toLowerCase();

      password = String(
        password || ""
      );

      name = String(
        name || ""
      ).trim();

      if (
        !/^[a-z0-9_.]{3,30}$/.test(
          username
        )
      ) {
        return res.status(400).json({
          error:
            "Username 3-30 belgidan iborat bo'lsin."
        });
      }

      if (
        !/^\S+@\S+\.\S+$/.test(
          email
        )
      ) {
        return res.status(400).json({
          error:
            "Email noto'g'ri."
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          error:
            "Parol kamida 6 belgidan iborat bo'lsin."
        });
      }

      const exists =
        db.users.find(
          (user) =>
            user.username === username ||
            user.email === email
        );

      if (exists) {
        return res.status(409).json({
          error:
            "Username yoki email allaqachon mavjud."
        });
      }

      const hash =
        await bcrypt.hash(
          password,
          12
        );

      const user = {
        id: nextId("users"),
        username,
        email,
        password: hash,
        name: name || username,
        bio: "",
        avatar: "",
        created_at: now()
      };

      db.users.push(user);
      saveDB(db);

      const token =
        issueToken(user.id);

      setAuthCookie(
        res,
        token
      );

      res.status(201).json({
        user: publicUser(user)
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Server xatosi."
      });
    }
  }
);

app.post(
  "/api/login",
  async (req, res) => {
    try {
      const usernameOrEmail =
        String(
          req.body.usernameOrEmail ||
            ""
        )
          .trim()
          .toLowerCase();

      const password =
        String(
          req.body.password || ""
        );

      const user =
        db.users.find(
          (item) =>
            item.username ===
              usernameOrEmail ||
            item.email ===
              usernameOrEmail
        );

      if (!user) {
        return res.status(401).json({
          error:
            "Login yoki parol noto'g'ri."
        });
      }

      const valid =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "Login yoki parol noto'g'ri."
        });
      }

      const token =
        issueToken(user.id);

      setAuthCookie(
        res,
        token
      );

      res.json({
        user: publicUser(user)
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Server xatosi."
      });
    }
  }
);

app.post(
  "/api/logout",
  (req, res) => {
    res.clearCookie(
      "token"
    );

    res.json({
      ok: true
    });
  }
);

/* =========================
   FEED
========================= */

app.get(
  "/api/feed",
  optionalAuth,
  (req, res) => {
    const posts = sortNewest(
      db.posts
    )
      .slice(0, 100)
      .map((post) =>
        getPostResponse(
          post,
          req.userId
        )
      )
      .filter(Boolean);

    res.json({
      posts
    });
  }
);

/* =========================
   POSTS
========================= */

app.post(
  "/api/posts",
  auth,
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Rasm tanlang."
      });
    }

    const caption =
      String(
        req.body.caption || ""
      )
        .trim()
        .slice(0, 2200);

    const post = {
      id: nextId("posts"),
      user_id: req.userId,
      image:
        `/uploads/${req.file.filename}`,
      caption,
      created_at: now()
    };

    db.posts.push(post);
    saveDB(db);

    res.status(201).json({
      post:
        getPostResponse(
          post,
          req.userId
        )
    });
  }
);

app.delete(
  "/api/posts/:id",
  auth,
  (req, res) => {
    const id =
      Number(req.params.id);

    const post =
      db.posts.find(
        (item) =>
          item.id === id &&
          item.user_id ===
            req.userId
      );

    if (!post) {
      return res.status(404).json({
        error:
          "Post topilmadi."
      });
    }

    deleteUploadFile(
      post.image
    );

    db.posts =
      db.posts.filter(
        (item) =>
          item.id !== id
      );

    db.likes =
      db.likes.filter(
        (like) =>
          like.post_id !== id
      );

    db.comments =
      db.comments.filter(
        (comment) =>
          comment.post_id !== id
      );

    saveDB(db);

    res.json({
      ok: true
    });
  }
);

/* =========================
   LIKES
========================= */

app.post(
  "/api/posts/:id/like",
  auth,
  (req, res) => {
    const postId =
      Number(req.params.id);

    const post =
      findPostById(postId);

    if (!post) {
      return res.status(404).json({
        error:
          "Post topilmadi."
      });
    }

    const index =
      db.likes.findIndex(
        (like) =>
          like.user_id ===
            req.userId &&
          like.post_id ===
            postId
      );

    let liked;

    if (index !== -1) {
      db.likes.splice(
        index,
        1
      );

      liked = false;
    } else {
      db.likes.push({
        user_id: req.userId,
        post_id: postId,
        created_at: now()
      });

      liked = true;
    }

    saveDB(db);

    const count =
      db.likes.filter(
        (like) =>
          like.post_id ===
          postId
      ).length;

    res.json({
      liked,
      count
    });
  }
);

/* =========================
   COMMENTS
========================= */

app.get(
  "/api/posts/:id/comments",
  (req, res) => {
    const postId =
      Number(req.params.id);

    const comments =
      db.comments
        .filter(
          (comment) =>
            comment.post_id ===
            postId
        )
        .sort(
          (a, b) =>
            new Date(
              a.created_at
            ).getTime() -
            new Date(
              b.created_at
            ).getTime()
        )
        .map((comment) => {
          const user =
            findUserById(
              comment.user_id
            );

          return {
            id: comment.id,
            text: comment.text,
            created_at:
              comment.created_at,
            username:
              user?.username || "",
            avatar:
              user?.avatar || ""
          };
        });

    res.json({
      comments
    });
  }
);

app.post(
  "/api/posts/:id/comments",
  auth,
  (req, res) => {
    const postId =
      Number(req.params.id);

    const post =
      findPostById(postId);

    if (!post) {
      return res.status(404).json({
        error:
          "Post topilmadi."
      });
    }

    const text =
      String(
        req.body.text || ""
      )
        .trim()
        .slice(0, 1000);

    if (!text) {
      return res.status(400).json({
        error:
          "Izoh yozing."
      });
    }

    const comment = {
      id: nextId("comments"),
      user_id: req.userId,
      post_id: postId,
      text,
      created_at: now()
    };

    db.comments.push(
      comment
    );

    saveDB(db);

    const user =
      findUserById(
        req.userId
      );

    res.status(201).json({
      comment: {
        id: comment.id,
        text: comment.text,
        created_at:
          comment.created_at,
        username:
          user?.username || "",
        avatar:
          user?.avatar || ""
      }
    });
  }
);

/* =========================
   USERS / PROFILE
========================= */

app.get(
  "/api/users/:username",
  optionalAuth,
  (req, res) => {
    const username =
      String(
        req.params.username
      )
        .trim()
        .toLowerCase();

    const user =
      db.users.find(
        (item) =>
          item.username ===
          username
      );

    if (!user) {
      return res.status(404).json({
        error:
          "Foydalanuvchi topilmadi."
      });
    }

    const posts =
      sortNewest(
        db.posts.filter(
          (post) =>
            post.user_id ===
            user.id
        )
      ).map((post) => ({
        id: post.id,
        image: post.image,
        caption: post.caption,
        created_at:
          post.created_at,
        likes_count:
          db.likes.filter(
            (like) =>
              like.post_id ===
              post.id
          ).length,
        comments_count:
          db.comments.filter(
            (comment) =>
              comment.post_id ===
              post.id
          ).length
      }));

    const followers =
      db.follows.filter(
        (follow) =>
          follow.following_id ===
          user.id
      ).length;

    const following =
      db.follows.filter(
        (follow) =>
          follow.follower_id ===
          user.id
      ).length;

    let isFollowing =
      false;

    if (
      req.userId &&
      req.userId !== user.id
    ) {
      isFollowing =
        db.follows.some(
          (follow) =>
            follow.follower_id ===
              req.userId &&
            follow.following_id ===
              user.id
        );
    }

    res.json({
      user:
        publicUser(user),
      posts,
      followers,
      following,
      isFollowing
    });
  }
);

app.post(
  "/api/users/:id/follow",
  auth,
  (req, res) => {
    const targetId =
      Number(req.params.id);

    if (
      targetId ===
      req.userId
    ) {
      return res.status(400).json({
        error:
          "O'zingizni follow qila olmaysiz."
      });
    }

    const target =
      findUserById(
        targetId
      );

    if (!target) {
      return res.status(404).json({
        error:
          "Foydalanuvchi topilmadi."
      });
    }

    const index =
      db.follows.findIndex(
        (follow) =>
          follow.follower_id ===
            req.userId &&
          follow.following_id ===
            targetId
      );

    let following;

    if (index !== -1) {
      db.follows.splice(
        index,
        1
      );

      following = false;
    } else {
      db.follows.push({
        follower_id:
          req.userId,
        following_id:
          targetId,
        created_at: now()
      });

      following = true;
    }

    saveDB(db);

    const followers =
      db.follows.filter(
        (follow) =>
          follow.following_id ===
          targetId
      ).length;

    res.json({
      following,
      followers
    });
  }
);

/* =========================
   SEARCH
========================= */

app.get(
  "/api/search",
  optionalAuth,
  (req, res) => {
    const q =
      String(
        req.query.q || ""
      )
        .trim()
        .toLowerCase();

    if (!q) {
      return res.json({
        users: []
      });
    }

    const users =
      db.users
        .filter(
          (user) =>
            user.username
              .toLowerCase()
              .includes(q) ||
            user.name
              .toLowerCase()
              .includes(q)
        )
        .sort(
          (a, b) =>
            a.username.localeCompare(
              b.username
            )
        )
        .slice(0, 30)
        .map(
          publicUser
        );

    res.json({
      users
    });
  }
);

/* =========================
   PROFILE UPDATE
========================= */

app.post(
  "/api/profile",
  auth,
  upload.single("avatar"),
  (req, res) => {
    const user =
      findUserById(
        req.userId
      );

    if (!user) {
      return res.status(404).json({
        error:
          "User topilmadi."
      });
    }

    const name =
      String(
        req.body.name || ""
      )
        .trim()
        .slice(0, 80);

    const bio =
      String(
        req.body.bio || ""
      )
        .trim()
        .slice(0, 500);

    if (req.file) {
      const oldAvatar =
        user.avatar;

      user.avatar =
        `/uploads/${req.file.filename}`;

      if (oldAvatar) {
        deleteUploadFile(
          oldAvatar
        );
      }
    }

    user.name =
      name || user.username;

    user.bio = bio;

    saveDB(db);

    res.json({
      user:
        publicUser(user)
    });
  }
);

/* =========================
   HEALTH CHECK
========================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      app: "Social Lite",
      users: db.users.length,
      posts: db.posts.length,
      time: now()
    });
  }
);

/* =========================
   ERROR HANDLER
========================= */

app.use(
  (err, req, res, next) => {
    console.error(err);

    if (
      err instanceof
      multer.MulterError
    ) {
      if (
        err.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res.status(400).json({
          error:
            "Rasm hajmi maksimal 8 MB bo'lishi mumkin."
        });
      }

      return res.status(400).json({
        error:
          "Fayl yuklashda xatolik."
      });
    }

    if (err) {
      return res.status(400).json({
        error:
          err.message ||
          "Xatolik yuz berdi."
      });
    }

    next();
  }
);

/* =========================
   FRONTEND
========================= */

app.get(
  "*splat",
  (req, res) => {
    const indexFile =
      path.join(
        __dirname,
        "public",
        "index.html"
      );

    if (
      fs.existsSync(
        indexFile
      )
    ) {
      return res.sendFile(
        indexFile
      );
    }

    res.status(404).send(
      "Social Lite frontend topilmadi. public/index.html faylini yarating."
    );
  }
);

/* =========================
   START
========================= */

app.listen(
  PORT,
  () => {
    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "          SOCIAL LITE ISHLADI"
    );
    console.log(
      "========================================"
    );
    console.log(
      `http://localhost:${PORT}`
    );
    console.log(
      "========================================"
    );
    console.log("");
  }
);
