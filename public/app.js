let me = null;

const $ = (selector) =>
  document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const el = $("#toast");

  if (!el) return;

  el.textContent = message;

  el.classList.add("show");

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2500);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  const data = await res
    .json()
    .catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.error || "Xatolik yuz berdi."
    );
  }

  return data;
}

function avatarHTML(user, cls = "avatar") {
  if (user?.avatar) {
    return `
      <img
        class="${cls}"
        src="${escapeHTML(user.avatar)}"
        alt=""
      >
    `;
  }

  const name =
    user?.username ||
    user?.name ||
    "?";

  const letter =
    escapeHTML(
      name.charAt(0).toUpperCase()
    );

  return `
    <div
      class="${cls}"
      style="
        display:grid;
        place-items:center;
        color:white;
        font-weight:800;
        background:
          linear-gradient(
            135deg,
            #833ab4,
            #fd1d1d,
            #fcb045
          );
      "
    >
      ${letter}
    </div>
  `;
}

function formatTime(date) {
  if (!date) return "";

  const d = new Date(
    date.replace(" ", "T") + "Z"
  );

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  const now = new Date();

  const diff = Math.floor(
    (now - d) / 1000
  );

  if (diff < 60)
    return "hozir";

  if (diff < 3600)
    return `${Math.floor(diff / 60)} daqiqa`;

  if (diff < 86400)
    return `${Math.floor(diff / 3600)} soat`;

  if (diff < 604800)
    return `${Math.floor(diff / 86400)} kun`;

  return d.toLocaleDateString("uz-UZ");
}

async function init() {
  try {
    const data = await api("/api/me");

    me = data.user;

    if (!me) {
      showAuth();
      return;
    }

    showApp();

    await loadFeed();
  } catch {
    showAuth();
  }
}

function showAuth() {
  $("#authView")
    ?.classList
    .remove("hidden");

  $("#appView")
    ?.classList
    .add("hidden");
}

function showApp() {
  $("#authView")
    ?.classList
    .add("hidden");

  $("#appView")
    ?.classList
    .remove("hidden");

  showHome();
}

function toggleAuth(login) {
  $("#loginBox")
    ?.classList
    .toggle("hidden", !login);

  $("#registerBox")
    ?.classList
    .toggle("hidden", login);
}

$("#loginForm")?.addEventListener(
  "submit",
  async (e) => {
    e.preventDefault();

    const form = new FormData(e.target);

    try {
      const data = await api(
        "/api/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify(
            Object.fromEntries(form)
          )
        }
      );

      me = data.user;

      showApp();

      await loadFeed();

      toast("Xush kelibsiz!");
    } catch (err) {
      toast(err.message);
    }
  }
);

$("#registerForm")?.addEventListener(
  "submit",
  async (e) => {
    e.preventDefault();

    const form = new FormData(e.target);

    try {
      const data = await api(
        "/api/register",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify(
            Object.fromEntries(form)
          )
        }
      );

      me = data.user;

      showApp();

      await loadFeed();

      toast("Hisob yaratildi!");
    } catch (err) {
      toast(err.message);
    }
  }
);

async function logout() {
  try {
    await api(
      "/api/logout",
      {
        method: "POST"
      }
    );

    me = null;

    showAuth();

    toast("Hisobdan chiqildi.");
  } catch (err) {
    toast(err.message);
  }
}

function showHome() {
  $("#homePage")
    ?.classList
    .remove("hidden");

  $("#profilePage")
    ?.classList
    .add("hidden");

  $("#searchPage")
    ?.classList
    .add("hidden");
}

function goHome() {
  showHome();

  loadFeed();
}

async function loadFeed() {
  try {
    const data = await api(
      "/api/feed"
    );

    renderFeed(
      data.posts || []
    );
  } catch (err) {
    toast(err.message);
  }
}

function renderFeed(posts) {
  const feed = $("#feed");

  if (!feed) return;

  if (!posts.length) {
    feed.innerHTML = `
      <div class="empty">
        <h2>Hali postlar yo‘q</h2>

        <p>
          Birinchi postingizni yarating.
        </p>

        <button
          class="primary"
          onclick="openCreate()"
        >
          Post yaratish
        </button>
      </div>
    `;

    return;
  }

  feed.innerHTML = posts
    .map(
      (post) => `
        <article class="post">

          <div class="post-head">

            ${avatarHTML(
              post,
              "avatar"
            )}

            <div class="user-meta">

              <div
                class="username"
                onclick="openUser('${escapeHTML(
                  post.username
                )}')"
              >
                ${escapeHTML(
                  post.username
                )}
              </div>

              <div class="post-time">
                ${formatTime(
                  post.created_at
                )}
              </div>

            </div>

            ${
              me &&
              Number(post.user_id) ===
                Number(me.id)
                ? `
                  <button
                    class="more"
                    onclick="deletePost(${post.id})"
                    title="Postni o‘chirish"
                  >
                    ⋯
                  </button>
                `
                : ""
            }

          </div>

          <img
            class="post-image"
            src="${escapeHTML(
              post.image
            )}"
            alt=""
            loading="lazy"
          >

          <div class="post-actions">

            <button
              class="action ${
                post.liked
                  ? "liked"
                  : ""
              }"
              onclick="likePost(
                ${post.id},
                this
              )"
              aria-label="Yoqtirish"
            >
              ${
                post.liked
                  ? "♥"
                  : "♡"
              }
            </button>

            <button
              class="action"
              onclick="openComments(
                ${post.id}
              )"
              aria-label="Izohlar"
            >
              ♡
            </button>

            <button
              class="action"
              onclick="sharePost(
                ${post.id}
              )"
              aria-label="Ulashish"
            >
              ↗
            </button>

          </div>

          <div class="post-body">

            <div class="likes">
              ${
                Number(
                  post.likes_count || 0
                )
              } ta yoqtirish
            </div>

            ${
              post.caption
                ? `
                  <div class="caption">

                    <strong>
                      ${escapeHTML(
                        post.username
                      )}
                    </strong>

                    ${escapeHTML(
                      post.caption
                    )}

                  </div>
                `
                : ""
            }

            <div
              class="comment-preview"
              onclick="openComments(
                ${post.id}
              )"
            >
              ${
                post.comments_count
                  ? `${post.comments_count} ta izohni ko‘rish`
                  : "Izoh qoldirish"
              }
            </div>

            <form
              class="comment-form"
              onsubmit="quickComment(
                event,
                ${post.id}
              )"
            >

              <input
                name="text"
                maxlength="1000"
                placeholder="Izoh yozing..."
              >

              <button>
                Yuborish
              </button>

            </form>

          </div>

        </article>
      `
    )
    .join("");
}

async function likePost(id, button) {
  try {
    const data = await api(
      `/api/posts/${id}/like`,
      {
        method: "POST"
      }
    );

    button.classList.toggle(
      "liked",
      data.liked
    );

    button.textContent =
      data.liked
        ? "♥"
        : "♡";

    const post =
      button.closest(".post");

    if (post) {
      const likes =
        post.querySelector(".likes");

      if (likes) {
        likes.textContent =
          `${data.count} ta yoqtirish`;
      }
    }
  } catch (err) {
    toast(err.message);
  }
}

async function quickComment(
  event,
  postId
) {
  event.preventDefault();

  const form = event.target;

  const input =
    form.elements.text;

  const text =
    input.value.trim();

  if (!text) return;

  try {
    await api(
      `/api/posts/${postId}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          text
        })
      }
    );

    form.reset();

    await loadFeed();
  } catch (err) {
    toast(err.message);
  }
}

async function openComments(postId) {
  try {
    const data = await api(
      `/api/posts/${postId}/comments`
    );

    $("#modalContent").innerHTML = `
      <button
        class="modal-close"
        onclick="closeModal()"
        aria-label="Yopish"
      >
        ×
      </button>

      <div class="modal-title">
        Izohlar
      </div>

      ${
        data.comments?.length
          ? data.comments
              .map(
                (c) => `
                  <div class="comment">

                    <strong>
                      @${escapeHTML(
                        c.username
                      )}
                    </strong>

                    ${escapeHTML(
                      c.text
                    )}

                  </div>
                `
              )
              .join("")
          : `
            <div class="empty">
              Hali izoh yo‘q.
            </div>
          `
      }

      <form
        class="comment-form"
        style="margin-top:15px"
        onsubmit="modalComment(
          event,
          ${postId}
        )"
      >

        <input
          name="text"
          placeholder="Izoh yozing..."
          maxlength="1000"
        >

        <button>
          Yuborish
        </button>

      </form>
    `;

    $("#modal")
      .classList
      .remove("hidden");

  } catch (err) {
    toast(err.message);
  }
}

async function modalComment(
  event,
  postId
) {
  event.preventDefault();

  const input =
    event.target.elements.text;

  const text =
    input.value.trim();

  if (!text) return;

  try {
    await api(
      `/api/posts/${postId}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          text
        })
      }
    );

    await openComments(postId);

    await loadFeed();

  } catch (err) {
    toast(err.message);
  }
}

async function deletePost(id) {
  if (
    !confirm(
      "Bu postni o‘chirasizmi?"
    )
  ) {
    return;
  }

  try {
    await api(
      `/api/posts/${id}`,
      {
        method: "DELETE"
      }
    );

    await loadFeed();

    toast("Post o‘chirildi.");
  } catch (err) {
    toast(err.message);
  }
}

function openCreate() {
  $("#modalContent").innerHTML = `
    <button
      class="modal-close"
      onclick="closeModal()"
      aria-label="Yopish"
    >
      ×
    </button>

    <div class="modal-title">
      Yangi post
    </div>

    <form
      id="createPostForm"
    >

      <input
        id="postImage"
        name="image"
        type="file"
        accept="
          image/jpeg,
          image/png,
          image/webp,
          image/gif
        "
        required
      >

      <img
        id="preview"
        class="post-image hidden"
        style="
          max-height:350px;
          border-radius:10px;
        "
        alt="Rasm ko‘rinishi"
      >

      <textarea
        name="caption"
        maxlength="2200"
        placeholder="Caption yozing..."
      ></textarea>

      <button
        class="primary"
        type="submit"
      >
        Post qilish
      </button>

    </form>
  `;

  $("#modal")
    .classList
    .remove("hidden");

  $("#postImage")
    .addEventListener(
      "change",
      previewImage
    );

  $("#createPostForm")
    .addEventListener(
      "submit",
      createPost
    );
}

function previewImage(event) {
  const file =
    event.target.files[0];

  if (!file) return;

  const preview =
    $("#preview");

  if (preview.dataset.url) {
    URL.revokeObjectURL(
      preview.dataset.url
    );
  }

  const url =
    URL.createObjectURL(file);

  preview.src = url;

  preview.dataset.url = url;

  preview.classList.remove(
    "hidden"
  );
}

async function createPost(event) {
  event.preventDefault();

  const form = event.target;

  const data = new FormData(form);

  try {
    await api(
      "/api/posts",
      {
        method: "POST",
        body: data
      }
    );

    closeModal();

    await loadFeed();

    toast("Post joylandi!");
  } catch (err) {
    toast(err.message);
  }
}

function closeModal() {
  const modal =
    $("#modal");

  const content =
    $("#modalContent");

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }

  if (content) {
    content.innerHTML = "";
  }
}

async function openUser(username) {
  try {
    const data = await api(
      `/api/users/${encodeURIComponent(
        username
      )}`
    );

    $("#homePage")
      ?.classList
      .add("hidden");

    $("#searchPage")
      ?.classList
      .add("hidden");

    $("#profilePage")
      ?.classList
      .remove("hidden");

    const isMe =
      me &&
      Number(me.id) ===
        Number(data.user.id);

    $("#profilePage").innerHTML = `
      <div class="profile">

        <div class="profile-head">

          ${avatarHTML(
            data.user,
            "profile-avatar"
          )}

          <div class="profile-info">

            <div class="profile-name">
              ${escapeHTML(
                data.user.name
              )}
            </div>

            <div class="muted">
              @${escapeHTML(
                data.user.username
              )}
            </div>

            <div class="profile-stats">

              <div>
                <strong>
                  ${data.posts.length}
                </strong>

                <span>
                  post
                </span>
              </div>

              <div>
                <strong>
                  ${data.followers}
                </strong>

                <span>
                  followers
                </span>
              </div>

              <div>
                <strong>
                  ${data.following}
                </strong>

                <span>
                  following
                </span>
              </div>

            </div>

            ${
              data.user.bio
                ? `
                  <div>
                    ${escapeHTML(
                      data.user.bio
                    )}
                  </div>
                `
                : ""
            }

            <div class="profile-actions">

              ${
                isMe
                  ? `
                    <button
                      class="secondary"
                      onclick="openEditProfile()"
                    >
                      Profilni tahrirlash
                    </button>
                  `
                  : `
                    <button
                      class="${
                        data.isFollowing
                          ? "secondary"
                          : "primary"
                      }"
                      onclick="followUser(
                        ${data.user.id},
                        this
                      )"
                    >
                      ${
                        data.isFollowing
                          ? "Following"
                          : "Follow"
                      }
                    </button>
                  `
              }

            </div>

          </div>

        </div>

        <div class="grid">

          ${
            data.posts.length
              ? data.posts
                  .map(
                    (p) => `
                      <div
                        class="grid-item"
                        onclick="openPostImage(
                          '${escapeHTML(
                            p.image
                          )}'
                        )"
                      >

                        <img
                          src="${escapeHTML(
                            p.image
                          )}"
                          loading="lazy"
                          alt=""
                        >

                      </div>
                    `
                  )
                  .join("")
              : `
                <div
                  class="empty"
                  style="
                    grid-column:1/-1
                  "
                >
                  Postlar yo‘q
                </div>
              `
          }

        </div>

      </div>
    `;

  } catch (err) {
    toast(err.message);
  }
}

async function followUser(
  id,
  button
) {
  try {
    const data =
      await api(
        `/api/users/${id}/follow`,
        {
          method: "POST"
        }
      );

    button.textContent =
      data.following
        ? "Following"
        : "Follow";

    button.className =
      data.following
        ? "secondary"
        : "primary";

    const stat =
      $("#profilePage .profile-stats div:nth-child(2) strong");

    if (stat) {
      stat.textContent =
        data.followers;
    }

  } catch (err) {
    toast(err.message);
  }
}

async function showProfile() {
  if (me) {
    await openUser(
      me.username
    );
  }
}

function openPostImage(src) {
  $("#modalContent").innerHTML = `
    <button
      class="modal-close"
      onclick="closeModal()"
      aria-label="Yopish"
    >
      ×
    </button>

    <img
      src="${escapeHTML(src)}"
      alt=""
      style="
        width:100%;
        max-height:75vh;
        object-fit:contain;
      "
    >
  `;

  $("#modal")
    .classList
    .remove("hidden");
}

function openEditProfile() {
  $("#modalContent").innerHTML = `
    <button
      class="modal-close"
      onclick="closeModal()"
      aria-label="Yopish"
    >
      ×
    </button>

    <div class="modal-title">
      Profilni tahrirlash
    </div>

    <form
      id="profileForm"
    >

      <input
        name="name"
        maxlength="80"
        value="${escapeHTML(
          me.name
        )}"
        placeholder="Ism"
      >

      <textarea
        name="bio"
        maxlength="500"
        placeholder="Bio"
      >${escapeHTML(
        me.bio || ""
      )}</textarea>

      <input
        name="avatar"
        type="file"
        accept="
          image/jpeg,
          image/png,
          image/webp,
          image/gif
        "
      >

      <button
        class="primary"
        type="submit"
      >
        Saqlash
      </button>

    </form>
  `;

  $("#modal")
    .classList
    .remove("hidden");

  $("#profileForm")
    .addEventListener(
      "submit",
      saveProfile
    );
}

async function saveProfile(event) {
  event.preventDefault();

  const data =
    new FormData(
      event.target
    );

  try {
    const result =
      await api(
        "/api/profile",
        {
          method: "POST",
          body: data
        }
      );

    me = result.user;

    closeModal();

    await openUser(
      me.username
    );

    toast(
      "Profil yangilandi."
    );

  } catch (err) {
    toast(err.message);
  }
}

$("#searchInput")?.addEventListener(
  "input",
  debounce(
    async function () {
      const q =
        this.value.trim();

      if (!q) {
        showHome();
        return;
      }

      try {
        const data =
          await api(
            `/api/search?q=${encodeURIComponent(
              q
            )}`
          );

        $("#homePage")
          ?.classList
          .add("hidden");

        $("#profilePage")
          ?.classList
          .add("hidden");

        $("#searchPage")
          ?.classList
          .remove("hidden");

        $("#searchResults").innerHTML =
          data.users?.length
            ? data.users
                .map(
                  (u) => `
                    <div class="search-user">

                      ${avatarHTML(
                        u,
                        "avatar"
                      )}

                      <div class="search-user-info">

                        <div
                          class="username"
                          onclick="openUser(
                            '${escapeHTML(
                              u.username
                            )}'
                          )"
                        >
                          @${escapeHTML(
                            u.username
                          )}
                        </div>

                        <div class="muted">
                          ${escapeHTML(
                            u.name
                          )}
                        </div>

                      </div>

                      <button
                        class="secondary"
                        onclick="openUser(
                          '${escapeHTML(
                            u.username
                          )}'
                        )"
                      >
                        Ko‘rish
                      </button>

                    </div>
                  `
                )
                .join("")
            : `
              <div class="empty">
                Hech narsa topilmadi.
              </div>
            `;

      } catch (err) {
        toast(err.message);
      }
    },
    250
  )
);


async function loadStories() {
  try {
    const data =
      await api("/api/stories");

    renderStories(
      data.stories || []
    );
  } catch (err) {
    toast(err.message);
  }
}

function renderStories(stories) {
  const container =
    $("#stories");

  if (!container) return;

  const mine = stories.find(
    (story) => story.isMine
  );

  const others = stories.filter(
    (story) => !story.isMine
  );

  container.innerHTML = `
    <div
      class="story add-story"
      onclick="openCreateStory()"
    >
      <div class="story-avatar add">
        ${mine ? "↻" : "＋"}
      </div>

      <span>
        ${mine ? "Story qo‘shish" : "Siz"}
      </span>
    </div>

    ${
      mine
        ? `
          <div
            class="story"
            onclick="openStoryViewer(${mine.id})"
          >
            ${avatarHTML(
              mine,
              "story-avatar"
            )}

            <span>
              Siz
            </span>
          </div>
        `
        : ""
    }

    ${others
      .map(
        (story) => `
          <div
            class="story"
            onclick="openStoryViewer(${story.id})"
          >
            <div
              class="story-ring"
            >
              ${avatarHTML(
                story,
                "story-avatar"
              )}
            </div>

            <span>
              ${escapeHTML(
                story.username
              )}
            </span>
          </div>
        `
      )
      .join("")}
  `;
}

function openCreateStory() {
  $("#modalContent").innerHTML = `
    <button
      class="modal-close"
      onclick="closeModal()"
      aria-label="Yopish"
    >
      ×
    </button>

    <div class="modal-title">
      Yangi Story
    </div>

    <form id="createStoryForm">

      <input
        id="storyImage"
        name="image"
        type="file"
        accept="
          image/jpeg,
          image/png,
          image/webp,
          image/gif
        "
        required
      >

      <img
        id="storyPreview"
        class="post-image hidden"
        style="
          max-height:60vh;
          border-radius:12px;
          object-fit:contain;
        "
        alt="Story ko‘rinishi"
      >

      <button
        class="primary"
        type="submit"
      >
        Story joylash
      </button>

    </form>
  `;

  $("#modal")
    .classList
    .remove("hidden");

  $("#storyImage")
    .addEventListener(
      "change",
      previewStoryImage
    );

  $("#createStoryForm")
    .addEventListener(
      "submit",
      createStory
    );
}

function previewStoryImage(event) {
  const file =
    event.target.files[0];

  if (!file) return;

  const preview =
    $("#storyPreview");

  if (preview.dataset.url) {
    URL.revokeObjectURL(
      preview.dataset.url
    );
  }

  const url =
    URL.createObjectURL(file);

  preview.src = url;
  preview.dataset.url = url;

  preview.classList.remove(
    "hidden"
  );
}

async function createStory(event) {
  event.preventDefault();

  const form =
    event.target;

  const data =
    new FormData(form);

  try {
    await api(
      "/api/stories",
      {
        method: "POST",
        body: data
      }
    );

    closeModal();

    await loadStories();

    toast(
      "Story joylandi!"
    );
  } catch (err) {
    toast(err.message);
  }
}

async function openStoryViewer(id) {
  try {
    const data =
      await api("/api/stories");

    const story =
      data.stories.find(
        (item) =>
          Number(item.id) ===
          Number(id)
      );

    if (!story) {
      await loadStories();

      toast(
        "Bu Story muddati tugagan."
      );

      return;
    }

    const deleteButton =
      story.isMine
        ? `
          <button
            class="secondary"
            onclick="deleteStory(${story.id})"
            style="margin-top:12px"
          >
            Storyni o‘chirish
          </button>
        `
        : "";

    $("#modalContent").innerHTML = `
      <button
        class="modal-close"
        onclick="closeModal()"
        aria-label="Yopish"
      >
        ×
      </button>

      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom:12px;
        "
      >
        ${avatarHTML(
          story,
          "avatar"
        )}

        <strong>
          @${escapeHTML(
            story.username
          )}
        </strong>
      </div>

      <img
        src="${escapeHTML(
          story.image
        )}"
        alt="Story"
        style="
          display:block;
          width:100%;
          max-height:75vh;
          object-fit:contain;
          border-radius:14px;
        "
      >

      ${deleteButton}
    `;

    $("#modal")
      .classList
      .remove("hidden");

  } catch (err) {
    toast(err.message);
  }
}

async function deleteStory(id) {
  if (
    !confirm(
      "Bu Storyni o‘chirasizmi?"
    )
  ) {
    return;
  }

  try {
    await api(
      `/api/stories/${id}`,
      {
        method: "DELETE"
      }
    );

    closeModal();

    await loadStories();

    toast(
      "Story o‘chirildi."
    );
  } catch (err) {
    toast(err.message);
  }
}

function debounce(fn, delay) {
  let timer;

  return (...args) => {
    clearTimeout(timer);

    timer = setTimeout(
      () => {
        fn(...args);
      },
      delay
    );
  };
}

async function sharePost(id) {
  const url =
    `${location.origin}/#post-${id}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: "Social Lite",
        url
      });
    } else if (
      navigator.clipboard
    ) {
      await navigator.clipboard.writeText(
        url
      );

      toast(
        "Havola nusxalandi."
      );
    } else {
      toast(
        "Havolani nusxalab bo‘lmadi."
      );
    }
  } catch {
    // Foydalanuvchi ulashishni bekor qilgan.
  }
}

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape"
    ) {
      closeModal();
    }
  }
);

init();
