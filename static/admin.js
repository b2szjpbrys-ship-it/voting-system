document.addEventListener("DOMContentLoaded", function () {
  const API_BASE = "/api";

  const adminKeyInput = document.getElementById("adminKey");

  const posForm = document.getElementById("posForm");
  const positionName = document.getElementById("positionName");
  const positionsList = document.getElementById("positionsList");

  const candidateForm = document.getElementById("candidateForm");
  const candidateName = document.getElementById("candidateName");
  const candidatePosition = document.getElementById("candidatePosition");
  const candidateImage = document.getElementById("candidateImage");
  const candidatesList = document.getElementById("candidatesList");

  const loadUsersBtn = document.getElementById("loadUsers");
  const usersList = document.getElementById("usersList");

  const getWinnersBtn = document.getElementById("getWinners");
  const winnersBox = document.getElementById("winners");

  const resetElectionBtn = document.getElementById("resetElection");

  function getAdminKey() {
    const key = adminKeyInput ? adminKeyInput.value.trim() : "";
    return key || "adminsecret";
  }

  async function apiFetch(path, opts = {}) {
    const key = getAdminKey();

    opts.headers = opts.headers || {};
    opts.headers["X-Admin-Key"] = key;

    if (!opts.method) {
      opts.method = "GET";
    }

    const separator = path.includes("?") ? "&" : "?";
    const url = API_BASE + path + separator + "admin_key=" + encodeURIComponent(key);

    const res = await fetch(url, opts);
    const text = await res.text();

    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = text;
    }

    if (!res.ok) {
      console.error("API ERROR:", data);
      throw new Error(
        typeof data === "string"
          ? data
          : data.detail || data.message || "Request failed"
      );
    }

    return data;
  }

  function showError(error) {
    console.error(error);
    alert(error.message || "Something went wrong");
  }

  function escapeHTML(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadPositions() {
    try {
      const data = await apiFetch("/positions/");

      candidatePosition.innerHTML = "";
      positionsList.innerHTML = "";

      if (!Array.isArray(data) || data.length === 0) {
        positionsList.innerHTML = "<li>No positions found</li>";
        candidatePosition.innerHTML = "<option value=''>No positions</option>";
        return;
      }

      data.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        candidatePosition.appendChild(opt);

        const li = document.createElement("li");
        li.textContent = `${p.name} (id: ${p.id})`;
        positionsList.appendChild(li);
      });
    } catch (error) {
      showError(error);
    }
  }

  async function loadCandidates() {
    try {
      const data = await apiFetch("/admin/candidates/");

      candidatesList.innerHTML = "";

      if (!Array.isArray(data) || data.length === 0) {
        candidatesList.innerHTML = "<li>No candidates found</li>";
        return;
      }

      data.forEach((c) => {
        const li = document.createElement("li");

        const imageHTML = c.image_url
          ? `<img src="${escapeHTML(c.image_url)}" alt="${escapeHTML(c.name)}" style="width:80px;height:80px;object-fit:cover;border-radius:12px;margin-right:10px;">`
          : `<div style="width:80px;height:80px;border-radius:12px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:12px;margin-right:10px;">No Image</div>`;

        li.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;">
            <div style="display:flex;align-items:center;gap:10px;">
              ${imageHTML}
              <div>
                <strong>${escapeHTML(c.name)}</strong><br>
                <small>${escapeHTML(c.position_name || "")}</small><br>
                <small>ID: ${c.id} | Votes: ${c.votes_count || 0}</small>
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" data-id="${c.id}" class="upload">Upload Image</button>
              <button type="button" data-id="${c.id}" class="delete">Delete</button>
            </div>
          </div>
        `;

        candidatesList.appendChild(li);
      });
    } catch (error) {
      showError(error);
    }
  }

  async function addPosition(e) {
    e.preventDefault();

    const name = positionName.value.trim();

    if (!name) {
      alert("Position name required");
      return;
    }

    try {
      await apiFetch("/admin/positions/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name,
          description: ""
        })
      });

      positionName.value = "";
      await loadPositions();

      alert("Position added successfully");
    } catch (error) {
      showError(error);
    }
  }

  async function uploadCandidateImage(candidateId, file) {
    if (!candidateId || !file) return;

    const form = new FormData();
    form.append("candidate_id", candidateId);
    form.append("image", file);

    await apiFetch("/admin/upload-image/", {
      method: "POST",
      body: form
    });
  }

  async function addCandidate(e) {
    e.preventDefault();

    const name = candidateName.value.trim();
    const position_id = candidatePosition.value;
    const file = candidateImage.files[0];

    if (!name || !position_id) {
      alert("Candidate name and position required");
      return;
    }

    try {
      const candidate = await apiFetch("/admin/candidates/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name,
          position_id: position_id,
          description: "",
          image_url: ""
        })
      });

      if (file) {
        if (!candidate || !candidate.id) {
          alert("Candidate created, but image upload failed because candidate ID was not returned.");
        } else {
          await uploadCandidateImage(candidate.id, file);
        }
      }

      candidateName.value = "";
      candidateImage.value = "";

      await loadCandidates();

      alert("Candidate added successfully");
    } catch (error) {
      showError(error);
    }
  }

  async function loadUsers() {
    try {
      const data = await apiFetch("/admin/users/");

      usersList.innerHTML = "";

      if (!Array.isArray(data) || data.length === 0) {
        usersList.innerHTML = "<li>No users found</li>";
        return;
      }

      data.forEach((u) => {
        const li = document.createElement("li");
        li.textContent = `${u.name} (${u.phone}) - voted: ${u.has_voted}`;
        usersList.appendChild(li);
      });
    } catch (error) {
      showError(error);
    }
  }

  async function showWinners() {
    try {
      const data = await apiFetch("/admin/winners/");

      winnersBox.innerHTML = "";

      if (!Array.isArray(data) || data.length === 0) {
        winnersBox.innerHTML = "<p>No winners found yet.</p>";
        return;
      }

      data.forEach((winner) => {
        const card = document.createElement("div");
        card.className = "winner-card";

        const image = winner.image_url
          ? `<img src="${escapeHTML(winner.image_url)}" alt="${escapeHTML(winner.candidate)}">`
          : `<div class="winner-placeholder">No Image</div>`;

        card.innerHTML = `
          ${image}
          <div class="winner-info">
            <small>Position</small>
            <h3>${escapeHTML(winner.position)}</h3>

            <small>Leading Candidate</small>
            <h4>${escapeHTML(winner.candidate)}</h4>

            <span>${winner.votes || 0} votes</span>
          </div>
        `;

        winnersBox.appendChild(card);
      });
    } catch (error) {
      showError(error);
    }
  }

  async function resetElection() {
    if (!confirm("Reset election? This deletes all votes.")) {
      return;
    }

    try {
      const data = await apiFetch("/admin/reset/", {
        method: "POST"
      });

      alert(data.detail || data.message || "Election reset successfully");

      await loadCandidates();
      await loadUsers();
    } catch (error) {
      showError(error);
    }
  }

  async function deleteCandidate(candidateId) {
    if (!confirm("Delete candidate?")) {
      return;
    }

    try {
      await apiFetch(`/admin/candidates/${candidateId}/`, {
        method: "DELETE"
      });

      await loadCandidates();
      alert("Candidate deleted successfully");
    } catch (error) {
      showError(error);
    }
  }

  function openUploadDialog(candidateId) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.addEventListener("change", async function () {
      const file = input.files[0];

      if (!file) return;

      try {
        await uploadCandidateImage(candidateId, file);
        await loadCandidates();
        alert("Image uploaded successfully");
      } catch (error) {
        showError(error);
      }
    });

    input.click();
  }

  if (posForm) {
    posForm.addEventListener("submit", addPosition);
  }

  if (candidateForm) {
    candidateForm.addEventListener("submit", addCandidate);
  }

  if (loadUsersBtn) {
    loadUsersBtn.addEventListener("click", loadUsers);
  }

  if (getWinnersBtn) {
    getWinnersBtn.addEventListener("click", showWinners);
  }

  if (resetElectionBtn) {
    resetElectionBtn.addEventListener("click", resetElection);
  }

  if (candidatesList) {
    candidatesList.addEventListener("click", async function (ev) {
      const target = ev.target;

      if (target.matches(".delete")) {
        const id = target.dataset.id;
        await deleteCandidate(id);
      }

      if (target.matches(".upload")) {
        const id = target.dataset.id;
        openUploadDialog(id);
      }
    });
  }

  loadPositions().then(loadCandidates);
});
