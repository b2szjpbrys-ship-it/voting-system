// JAGWA SPORTS Voting System Frontend JS
(function () {
  const API = "/api/";

  const cache = {
    positions: null,
    results: null
  };

  const candidateCache = {};
  const cacheTimestamps = {};
  const CACHE_TTL = 60 * 1000;
  let resultsPoll = null;

  function now() {
    return Date.now();
  }

  function safe(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCached(key) {
    if (!cacheTimestamps[key]) return null;

    if (now() - cacheTimestamps[key] > CACHE_TTL) {
      return null;
    }

    if (key.startsWith("candidates-")) {
      return candidateCache[key];
    }

    return cache[key];
  }

  function setCached(key, data) {
    if (key.startsWith("candidates-")) {
      candidateCache[key] = data;
    } else {
      cache[key] = data;
    }

    cacheTimestamps[key] = now();
  }

  function clearCache() {
    cache.positions = null;
    cache.results = null;

    Object.keys(candidateCache).forEach(function (key) {
      delete candidateCache[key];
    });

    Object.keys(cacheTimestamps).forEach(function (key) {
      delete cacheTimestamps[key];
    });
  }

  function getVoter() {
    try {
      return JSON.parse(localStorage.getItem("voterProfile") || "null");
    } catch {
      return null;
    }
  }

  function setVoter(profile) {
    localStorage.setItem("voterProfile", JSON.stringify(profile));
  }

  function clearVoter() {
    localStorage.removeItem("voterProfile");
    localStorage.removeItem("voteMessage");
    clearCache();
    window.location.href = "/login/";
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "";

    try {
      return new Intl.DateTimeFormat([], {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function parseErrorMessage(error) {
    if (!error) return "Request failed.";

    if (error.data && error.data.detail) {
      return error.data.detail;
    }

    if (!error.message) {
      return "Request failed.";
    }

    try {
      const data = JSON.parse(error.message);
      return data.detail || data.message || error.message;
    } catch {
      return error.message;
    }
  }

  function showAlert(element, message, type = "danger") {
    if (!element) return;

    element.className = `alert alert-${type}`;
    element.textContent = message;
    element.classList.remove("visually-hidden");
  }

  function hideAlert(element) {
    if (!element) return;
    element.classList.add("visually-hidden");
  }

  async function fetchJSON(url, opts = {}) {
    const response = await fetch(url, opts);
    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const error = new Error(
        typeof data === "string"
          ? data
          : data.detail || data.message || response.statusText
      );

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return data;
  }

  async function loadPositions() {
    const cached = getCached("positions");
    if (cached) return cached;

    const data = await fetchJSON(API + "positions/");
    setCached("positions", data);

    return data;
  }

  async function loadCandidates(positionId) {
    const key = `candidates-${positionId}`;
    const cached = getCached(key);

    if (cached) return cached;

    const data = await fetchJSON(API + `positions/${positionId}/candidates/`);
    setCached(key, data);

    return data;
  }

  async function loadMyVotes(voter) {
    if (!voter || !voter.token) return null;

    return await fetchJSON(API + "results/", {
      method: "GET",
      headers: {
        "Authorization": "Token " + voter.token
      }
    });
  }

  function renderAuthStatus() {
    const el = document.getElementById("authStatus");
    if (!el) return;

    const voter = getVoter();

    if (voter) {
      el.innerHTML = `
        <div class="voter-mini-profile">
          <div class="voter-mini-info">
            <strong>${safe(voter.name)}</strong>
            <small>${safe(voter.phone)}</small>
          </div>
        </div>

        <button class="btn-logout" type="button">Logout</button>
      `;

      const btn = el.querySelector(".btn-logout");
      if (btn) {
        btn.addEventListener("click", clearVoter);
      }
    } else {
      el.innerHTML = `
        <span class="guest-text">Guest voter</span>
        <a href="/login/" class="btn btn-sm btn-primary">Login</a>
      `;
    }
  }

  function candidateImageHTML(candidate) {
    if (candidate && candidate.image_url) {
      return `
        <img
          class="candidate-photo"
          src="${safe(candidate.image_url)}"
          alt="${safe(candidate.name)}"
          loading="lazy"
        >
      `;
    }

    return `<div class="candidate-photo no-image">No Image</div>`;
  }

  function resultImageHTML(item) {
    if (item && item.image_url) {
      return `
        <img
          class="result-photo"
          src="${safe(item.image_url)}"
          alt="${safe(item.candidate || item.name)}"
          loading="lazy"
        >
      `;
    }

    return `<div class="result-photo no-image">No Image</div>`;
  }

  async function getVotedPositionIds(voter) {
    if (!voter || !voter.token) return [];

    try {
      const data = await loadMyVotes(voter);

      if (data && Array.isArray(data.votes)) {
        return data.votes.map(function (vote) {
          return vote.position_id;
        });
      }

      return [];
    } catch (error) {
      if (
        error.data &&
        error.data.locked &&
        Array.isArray(error.data.voted_position_ids)
      ) {
        return error.data.voted_position_ids;
      }

      return [];
    }
  }

  async function renderPositions() {
    const container = document.getElementById("positions");
    const profile = document.getElementById("voteProfile");
    const alertBox = document.getElementById("voteAlert");

    if (!container) return;

    renderAuthStatus();

    const voter = getVoter();

    if (profile) {
      if (voter) {
        profile.innerHTML = `
          <div class="voter-profile-card">
            <div class="voter-profile-left">
              <div class="voter-profile-text">
                <h3>${safe(voter.name)}</h3>
                <p>${safe(voter.phone)}</p>
              </div>
            </div>

            <div class="voter-profile-actions">
              <span class="voter-profile-badge">Logged in voter</span>
              <button class="btn-logout profile-logout-btn" type="button">Logout</button>
            </div>
          </div>
        `;

        const logoutBtn = profile.querySelector(".profile-logout-btn");
        if (logoutBtn) {
          logoutBtn.addEventListener("click", clearVoter);
        }
      } else {
        profile.innerHTML = `
          <div class="vote-locked-card">
            <h3>Login Required</h3>
            <p>You are not signed in. Please login to continue voting.</p>
            <a href="/login/?next=/vote/">Login Now</a>
          </div>
        `;
      }
    }

    if (!voter) {
      showAlert(
        alertBox,
        "Please sign in before voting. Use the login page to create your voter profile.",
        "warning"
      );
    } else {
      showAlert(
        alertBox,
        "You can vote once for each position. After voting for a position, you cannot vote again for that same position.",
        "info"
      );
    }

    container.innerHTML = `
      <div class="loading-card">
        Loading positions…
      </div>
    `;

    try {
      const positions = await loadPositions();

      container.innerHTML = "";

      if (!voter) {
        const loginBanner = document.createElement("div");
        loginBanner.className = "alert alert-warning";
        loginBanner.innerHTML = `
          You are not signed in.
          <a href="/login/?next=/vote/">Sign in now</a> to cast your vote.
        `;
        container.appendChild(loginBanner);
      }

      if (!Array.isArray(positions) || positions.length === 0) {
        container.innerHTML += `
          <p class="text-muted">No positions are available at this time.</p>
        `;
        return;
      }

      let myVotedPositionIds = await getVotedPositionIds(voter);

      for (const pos of positions) {
        const section = document.createElement("section");
        section.className = "position-card";

        const alreadyVotedForPosition = myVotedPositionIds.includes(pos.id);

        section.innerHTML = `
          <div class="position-card-header">
            <div>
              <h5>${safe(pos.name)}</h5>
              <p>
                ${alreadyVotedForPosition ? "You have already voted for this position" : "Choose one candidate"}
              </p>
            </div>

            <span class="position-label">
              ${alreadyVotedForPosition ? "Voted" : safe(pos.name)}
            </span>
          </div>

          <div id="pos-${pos.id}" class="candidate-grid"></div>
        `;

        container.appendChild(section);

        try {
          const candidates = await loadCandidates(pos.id);
          const list = section.querySelector(`#pos-${pos.id}`);

          if (!Array.isArray(candidates) || candidates.length === 0) {
            list.innerHTML = `<div class="text-muted">No candidates found.</div>`;
          } else {
            candidates.forEach(function (c) {
              const card = document.createElement("div");
              card.className = "candidate-card";

              const description = c.description || "";
              const shortDescription = description.length > 120
                ? description.slice(0, 120) + "..."
                : description;

              const needsReadMore = description.length > 120;

              let voteLabel = "Vote";
              let disabledAttr = "";

              if (!voter) {
                voteLabel = "Sign in to vote";
              }

              if (alreadyVotedForPosition) {
                voteLabel = "Already Voted";
                disabledAttr = "disabled";
              }

              card.innerHTML = `
                ${candidateImageHTML(c)}

                <div class="candidate-card-body">
                  <div class="candidate-topline">
                    <div>
                      <strong>${safe(c.name)}</strong>
                      <div class="candidate-position">${safe(c.position_name || pos.name)}</div>
                    </div>

                    <button class="vote-button" type="button" ${disabledAttr}>
                      ${voteLabel}
                    </button>
                  </div>

                  <p class="candidate-description">${safe(shortDescription)}</p>

                  ${needsReadMore ? '<button class="read-more-btn" type="button">Read more</button>' : ""}
                </div>
              `;

              const voteBtn = card.querySelector(".vote-button");

              if (voteBtn && !alreadyVotedForPosition) {
                voteBtn.addEventListener("click", function () {
                  submitVote(pos.id, c.id);
                });
              }

              if (needsReadMore) {
                const readMoreBtn = card.querySelector(".read-more-btn");

                readMoreBtn.addEventListener("click", function (event) {
                  event.preventDefault();

                  const desc = card.querySelector(".candidate-description");
                  const button = event.currentTarget;

                  if (button.textContent === "Read more") {
                    desc.textContent = description;
                    button.textContent = "Show less";
                  } else {
                    desc.textContent = shortDescription;
                    button.textContent = "Read more";
                  }
                });
              }

              list.appendChild(card);
            });
          }
        } catch {
          const list = section.querySelector(`#pos-${pos.id}`);
          list.innerHTML = `<div class="text-danger">Unable to load candidates.</div>`;
        }
      }
    } catch {
      container.innerHTML = `
        <div class="alert alert-danger">
          Unable to load positions at this time. Please refresh the page.
        </div>
      `;
    }
  }

  async function submitVote(positionId, candidateId) {
    const voter = getVoter();

    if (!voter) {
      alert("Please log in before submitting your vote.");
      window.location.href = "/login/?next=/vote/";
      return;
    }

    if (!confirm("Submit vote for this candidate?")) return;

    try {
      const payload = {
        token: voter.token,
        candidate_id: candidateId
      };

      const result = await fetchJSON(API + "vote/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      clearCache();

      if (result && result.completed_all_positions) {
        localStorage.setItem(
          "voteMessage",
          "You have completed voting for all positions. You can now view My Votes."
        );

        window.location.href = "/success/";
        return;
      }

      alert("Vote recorded. Continue voting for the remaining positions.");

      renderPositions();

    } catch (error) {
      alert("Vote failed: " + parseErrorMessage(error));
    }
  }

  function renderResultsData(data) {
    const container = document.getElementById("results");
    if (!container) return;

    container.innerHTML = "";

    if (!data) {
      container.innerHTML = `
        <div class="alert alert-warning">No vote information found.</div>
      `;
      return;
    }

    if (data.mode === "my_votes") {
      const voterName = data.voter && data.voter.name ? data.voter.name : "Voter";
      const voterPhone = data.voter && data.voter.phone ? data.voter.phone : "";
      const totalVotes = data.total_my_votes || 0;

      const summary = document.createElement("div");
      summary.className = "result-summary";

      summary.innerHTML = `
        <h4>My Voting Record</h4>
        <p>Voter: <strong>${safe(voterName)}</strong></p>
        ${voterPhone ? `<p>Phone: <strong>${safe(voterPhone)}</strong></p>` : ""}
        <p>Positions voted: <strong>${totalVotes}</strong></p>
      `;

      container.appendChild(summary);

      if (!Array.isArray(data.votes) || data.votes.length === 0) {
        container.innerHTML += `
          <div class="alert alert-info">
            You have not voted yet.
            <br>
            <a href="/vote/">Go to voting page</a>
          </div>
        `;
        return;
      }

      data.votes.forEach(function (vote) {
        const card = document.createElement("div");
        card.className = "result-card";

        const votedAt = vote.voted_at ? formatDateTime(vote.voted_at) : "";

        card.innerHTML = `
          <div class="candidate-result-item">
            <div class="candidate-result-left">
              ${resultImageHTML(vote)}

              <div>
                <div class="result-label">Position</div>
                <h5>${safe(vote.position)}</h5>

                <div class="result-label">Candidate you voted for</div>
                <strong>${safe(vote.candidate)}</strong>

                ${vote.description ? `<div class="result-description">${safe(vote.description)}</div>` : ""}
                ${votedAt ? `<div class="result-date">Voted at: ${safe(votedAt)}</div>` : ""}
              </div>
            </div>
          </div>
        `;

        container.appendChild(card);
      });

      return;
    }

    container.innerHTML = `
      <div class="alert alert-warning">Unexpected results format.</div>
    `;
  }

  function renderLockedResults(data) {
    const container = document.getElementById("results");
    const status = document.getElementById("lastUpdated");

    const voted = data && data.voted_positions ? data.voted_positions : 0;
    const total = data && data.total_positions ? data.total_positions : 0;

    if (container) {
      container.innerHTML = `
        <div class="vote-locked-card">
          <h3>Results Locked</h3>
          <p>You must vote for all positions before viewing My Votes.</p>
          <p>
            Progress:
            <strong>${voted}</strong> of <strong>${total}</strong> positions completed.
          </p>
          <a href="/vote/">Continue Voting</a>
        </div>
      `;
    }

    if (status) {
      status.textContent = `Results locked: ${voted} of ${total} completed`;
    }
  }

  async function updateResults() {
    const status = document.getElementById("lastUpdated");
    const container = document.getElementById("results");

    try {
      const voter = getVoter();

      if (!voter || !voter.token) {
        if (container) {
          container.innerHTML = `
            <div class="vote-locked-card">
              <h3>Login Required</h3>
              <p>Please login first to view the votes you submitted.</p>
              <a href="/login/?next=/results/">Login Here</a>
            </div>
          `;
        }

        if (status) {
          status.textContent = "Login required";
        }

        return;
      }

      const data = await loadMyVotes(voter);

      setCached("results", data);
      renderResultsData(data);

      if (status) {
        status.textContent = "Last updated: " + formatTime(new Date());
      }
    } catch (error) {
      if (error.data && error.data.locked) {
        renderLockedResults(error.data);
        return;
      }

      if (container) {
        container.innerHTML = `
          <div class="alert alert-danger">
            Unable to load your votes. Please login again or try again soon.
            <br>
            <small>${safe(parseErrorMessage(error))}</small>
          </div>
        `;
      }

      if (status) {
        status.textContent = "Unable to update results";
      }
    }
  }

  function renderResults() {
    renderAuthStatus();

    const container = document.getElementById("results");
    if (!container) return;

    container.innerHTML = `
      <div class="loading-card">
        Loading your votes…
      </div>
    `;

    updateResults();

    if (resultsPoll) {
      clearInterval(resultsPoll);
    }

    resultsPoll = setInterval(updateResults, 12000);
  }

  function initLogin() {
    const form = document.getElementById("loginForm");
    const alertBox = document.getElementById("loginAlert");

    if (!form) return;

    const nextPath = new URLSearchParams(window.location.search).get("next") || "/";
    const existing = getVoter();

    if (existing) {
      const targetLabel = nextPath === "/" ? "home page" : "the requested page";

      showAlert(
        alertBox,
        `Existing profile loaded for ${existing.name}. You may update it and continue. You will return to ${targetLabel}.`,
        "info"
      );
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      hideAlert(alertBox);

      const nameInput =
        document.getElementById("loginName") ||
        document.getElementById("name");

      const phoneInput =
        document.getElementById("loginPhone") ||
        document.getElementById("phone");

      const name = nameInput ? nameInput.value.trim() : "";
      const phone = phoneInput ? phoneInput.value.trim() : "";

      if (name.length < 2) {
        showAlert(alertBox, "Please enter your full name.");
        return;
      }

      const phonePattern = /^\+255[6-9]\d{8}$/;

      if (!phonePattern.test(phone)) {
        showAlert(
          alertBox,
          "Phone must start with +255 and contain 9 digits after the country code."
        );
        return;
      }

      try {
        const data = await fetchJSON(API + "login/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name, phone })
        });

        if (data.token) {
          setVoter({
            name: data.name,
            phone: data.phone,
            token: data.token
          });

          window.location.href = nextPath;
        } else {
          showAlert(alertBox, "Unable to log in: no token returned.");
        }
      } catch (error) {
        showAlert(alertBox, parseErrorMessage(error) || "Login failed.");
      }
    });
  }

  async function initHome() {
    renderAuthStatus();

    const voter = getVoter();

    const welcomeTitle = document.getElementById("dashboardWelcome");
    const progressPercent = document.getElementById("progressPercent");
    const progressText = document.getElementById("progressText");
    const progressMessage = document.getElementById("progressMessage");
    const circle = document.getElementById("dashboardCircleProgress");

    if (welcomeTitle && voter) {
      welcomeTitle.textContent = `Welcome, ${voter.name} 👋`;
    }

    if (!voter || !voter.token) {
      if (progressPercent) progressPercent.textContent = "0%";
      if (progressText) progressText.textContent = "0 of 0";
      if (progressMessage) progressMessage.textContent = "Please login first to see your voting progress.";

      if (circle) {
        circle.style.background = `
          radial-gradient(circle at center, #ffffff 52%, transparent 53%),
          conic-gradient(#00a6b3 0deg, #e5e7eb 0deg)
        `;
      }

      return;
    }

    try {
      const positions = await loadPositions();
      let votedPositions = 0;

      try {
        const myVotes = await loadMyVotes(voter);
        votedPositions = myVotes && myVotes.total_my_votes ? myVotes.total_my_votes : 0;
      } catch (error) {
        if (error.data && error.data.locked) {
          votedPositions = error.data.voted_positions || 0;
        } else {
          throw error;
        }
      }

      const totalPositions = Array.isArray(positions) ? positions.length : 0;

      const percent = totalPositions > 0
        ? Math.round((votedPositions / totalPositions) * 100)
        : 0;

      const degrees = Math.round((percent / 100) * 360);

      if (progressPercent) progressPercent.textContent = `${percent}%`;
      if (progressText) progressText.textContent = `${votedPositions} of ${totalPositions}`;

      if (progressMessage) {
        if (totalPositions === 0) {
          progressMessage.textContent = "No voting positions are available yet.";
        } else if (votedPositions === 0) {
          progressMessage.textContent = "You haven’t voted for any position yet.";
        } else if (votedPositions < totalPositions) {
          progressMessage.textContent = "You have started voting. Continue until all positions are completed.";
        } else {
          progressMessage.textContent = "You have completed voting for all positions.";
        }
      }

      if (circle) {
        circle.style.background = `
          radial-gradient(circle at center, #ffffff 52%, transparent 53%),
          conic-gradient(#00a6b3 ${degrees}deg, #e5e7eb ${degrees}deg)
        `;
      }
    } catch {
      if (progressMessage) {
        progressMessage.textContent = "Unable to load voting progress. Please refresh the page.";
      }
    }
  }

  function initSuccess() {
    renderAuthStatus();

    const note = document.getElementById("successNote");
    const voter = getVoter();
    const message = localStorage.getItem("voteMessage");

    if (note) {
      if (message) {
        note.textContent = message;
        localStorage.removeItem("voteMessage");
      } else {
        note.textContent = voter
          ? `Vote recorded for ${voter.name} (${voter.phone}).`
          : "Vote recorded successfully.";
      }
    }
  }

  async function canViewResultsOrRedirect(actionName) {
    const voter = getVoter();

    if (!voter || !voter.token) {
      alert("You are not logged in.");
      window.location.href = "/login/?next=/results/";
      return false;
    }

    try {
      return await loadMyVotes(voter);
    } catch (error) {
      if (error.data && error.data.locked) {
        const voted = error.data.voted_positions || 0;
        const total = error.data.total_positions || 0;

        alert(`You must vote for all positions before ${actionName}. Progress: ${voted} of ${total}`);
        window.location.href = "/vote/";
        return false;
      }

      throw error;
    }
  }

  function initDownloadMyVotesButton() {
    const btn = document.getElementById("downloadMyVotes");
    if (!btn || btn.dataset.bound === "1") return;

    btn.dataset.bound = "1";

    btn.addEventListener("click", async function () {
      try {
        const data = await canViewResultsOrRedirect("downloading results");
        if (!data) return;

        const votes = data && Array.isArray(data.votes) ? data.votes : [];

        if (!votes.length) {
          alert("No votes found to download.");
          return;
        }

        let csv = "Position,Candidate,Voted At\n";

        votes.forEach(function (v) {
          const position = String(v.position || "").replaceAll('"', '""');
          const candidate = String(v.candidate || "").replaceAll('"', '""');
          const votedAt = String(v.voted_at || "").replaceAll('"', '""');

          csv += `"${position}","${candidate}","${votedAt}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "my-jagwa-votes.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
      } catch {
        alert("Download failed. Please try again.");
      }
    });
  }

  function initPrintMyVotesButton() {
    const btn = document.getElementById("printMyVotes");
    if (!btn || btn.dataset.bound === "1") return;

    btn.dataset.bound = "1";

    btn.addEventListener("click", async function () {
      try {
        const data = await canViewResultsOrRedirect("printing results");
        if (!data) return;

        window.print();
      } catch {
        alert("Print failed. Please try again.");
      }
    });
  }

  window.pageInit = function (page) {
    if (!page) {
      renderAuthStatus();
      return;
    }

    if (page === "vote") {
      renderPositions();
    } else if (page === "results") {
      renderResults();
      initDownloadMyVotesButton();
      initPrintMyVotesButton();
    } else if (page === "login") {
      initLogin();
    } else if (page === "home") {
      initHome();
    } else if (page === "success") {
      initSuccess();
    }
  };
})();