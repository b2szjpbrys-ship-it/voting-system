// Enhanced frontend JS with cached data, live polling, voter profile handling, and voter dashboard progress
(function(){
  const API = '/api/';
  const cache = { positions: null, candidates: {}, results: null };
  const cacheTimestamps = {};
  const CACHE_TTL = 60 * 1000;
  let resultsPoll = null;

  function now(){ return Date.now(); }

  function getCached(key){
    if(!cacheTimestamps[key] || now() - cacheTimestamps[key] > CACHE_TTL) return null;
    return cache[key];
  }

  function setCached(key, data){
    cache[key] = data;
    cacheTimestamps[key] = now();
  }

  function getVoter(){
    try {
      return JSON.parse(localStorage.getItem('voterProfile') || 'null');
    } catch {
      return null;
    }
  }

  function setVoter(profile){
    localStorage.setItem('voterProfile', JSON.stringify(profile));
  }

  function clearVoter(){
    localStorage.removeItem('voterProfile');
    window.location.href = '/login/';
  }

  function formatTime(date){
    return new Intl.DateTimeFormat([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  }

  function formatDateTime(value){
    if(!value) return '';

    try {
      return new Intl.DateTimeFormat([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function parseErrorMessage(error){
    if(!error || !error.message) return 'Request failed.';

    try {
      const data = JSON.parse(error.message);
      return data.detail || error.message;
    } catch {
      return error.message;
    }
  }

  function renderAuthStatus(){
    const el = document.getElementById('authStatus');
    if(!el) return;

    const voter = getVoter();

    if(voter){
      el.innerHTML = `
        <span>Welcome, <strong>${voter.name}</strong></span>
        <button class="btn btn-sm btn-outline-light btn-logout">Logout</button>
      `;

      const btn = el.querySelector('.btn-logout');
      if(btn) btn.addEventListener('click', clearVoter);

    } else {
      el.innerHTML = `
        <span>Guest voter</span>
        <a href="/login/" class="btn btn-sm btn-primary">Login</a>
      `;
    }
  }

  function showAlert(element, message, type='danger'){
    if(!element) return;

    element.className = `alert alert-${type}`;
    element.textContent = message;
    element.classList.remove('visually-hidden');
  }

  function hideAlert(element){
    if(!element) return;
    element.classList.add('visually-hidden');
  }

  async function fetchJSON(url, opts){
    const response = await fetch(url, opts);
    const text = await response.text();

    if(!response.ok){
      throw new Error(text || response.statusText);
    }

    return text ? JSON.parse(text) : null;
  }

  async function loadPositions(){
    const cached = getCached('positions');
    if(cached) return cached;

    const data = await fetchJSON(API + 'positions/');
    setCached('positions', data);

    return data;
  }

  async function loadCandidates(positionId){
    const cached = getCached(`candidates-${positionId}`);
    if(cached) return cached;

    const data = await fetchJSON(API + `positions/${positionId}/candidates/`);
    setCached(`candidates-${positionId}`, data);

    return data;
  }

  async function loadMyVotes(voter){
    if(!voter || !voter.token) return null;

    const data = await fetchJSON(API + 'results/', {
      method: 'GET',
      headers: {
        'Authorization': 'Token ' + voter.token
      }
    });

    return data;
  }

  async function renderPositions(){
    const container = document.getElementById('positions');
    const profile = document.getElementById('voteProfile');
    const alertBox = document.getElementById('voteAlert');

    if(!container) return;

    renderAuthStatus();

    const voter = getVoter();

    if(profile){
      profile.innerHTML = voter
        ? `<strong>${voter.name}</strong><br><span class="text-muted">${voter.phone}</span>`
        : 'You are not signed in. Please create a voter profile to continue.';
    }

    if(!voter){
      showAlert(
        alertBox,
        'Please sign in before voting. Use the login page to create your voter profile.',
        'warning'
      );
    } else {
      showAlert(
        alertBox,
        'You can vote once for each position. After voting for a position, you cannot vote again for that same position.',
        'info'
      );
    }

    container.innerHTML = '<div class="loading-card p-4 rounded-4 shadow-sm">Loading positions…</div>';

    try {
      const positions = await loadPositions();

      container.innerHTML = '';

      if(!voter){
        const loginBanner = document.createElement('div');
        loginBanner.className = 'alert alert-warning';
        loginBanner.innerHTML = 'You are not signed in. <a href="/login/">Sign in now</a> to cast your vote.';
        container.appendChild(loginBanner);
      }

      if(!Array.isArray(positions) || positions.length === 0){
        container.innerHTML += '<p class="text-muted">No positions are available at this time.</p>';
        return;
      }

      let myVotedPositionIds = [];

      if(voter && voter.token){
        try {
          const myVotes = await loadMyVotes(voter);

          if(myVotes && Array.isArray(myVotes.votes)){
            myVotedPositionIds = myVotes.votes.map(vote => vote.position_id);
          }
        } catch {
          myVotedPositionIds = [];
        }
      }

      for(const pos of positions){
        const section = document.createElement('section');
        section.className = 'position-card p-4 rounded-4 shadow-sm mb-4 bg-white';

        const alreadyVotedForPosition = myVotedPositionIds.includes(pos.id);

        section.innerHTML = `
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h5 class="mb-1">${pos.name}</h5>
              <p class="text-muted mb-0">
                ${alreadyVotedForPosition ? 'You have already voted for this position' : 'Choose one candidate'}
              </p>
            </div>
            <span class="position-label">
              ${alreadyVotedForPosition ? 'Voted' : pos.name}
            </span>
          </div>
          <div id="pos-${pos.id}" class="candidate-grid"></div>
        `;

        container.appendChild(section);

        try {
          const candidates = await loadCandidates(pos.id);
          const list = section.querySelector(`#pos-${pos.id}`);

          if(!Array.isArray(candidates) || candidates.length === 0){
            list.innerHTML = '<div class="text-muted">No candidates found.</div>';
          } else {
            candidates.forEach(c => {
              const card = document.createElement('div');
              card.className = 'candidate-card';

              const image = c.image_url
                ? `<img class="candidate-photo" src="${c.image_url}" alt="${c.name}">`
                : '';

              const description = c.description || '';
              const shortDescription = description.length > 120
                ? description.slice(0, 120) + '...'
                : description;

              const needsReadMore = description.length > 120;

              let voteLabel = 'Vote';
              let disabledAttr = '';

              if(!voter){
                voteLabel = 'Sign in to vote';
              }

              if(alreadyVotedForPosition){
                voteLabel = 'Already Voted';
                disabledAttr = 'disabled';
              }

              card.innerHTML = `
                ${image}
                <div class="candidate-card-body">
                  <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <strong>${c.name}</strong>
                      <div class="text-muted small mt-1">${c.position_name || pos.name}</div>
                    </div>
                    <button class="btn btn-sm btn-primary vote-button" ${disabledAttr}>${voteLabel}</button>
                  </div>

                  <p class="candidate-description">${shortDescription}</p>

                  ${needsReadMore ? '<button class="btn btn-link btn-sm read-more-btn">Read more</button>' : ''}
                </div>
              `;

              const voteBtn = card.querySelector('.vote-button');

              if(voteBtn && !alreadyVotedForPosition){
                voteBtn.addEventListener('click', () => {
                  submitVote(pos.id, c.id);
                });
              }

              if(needsReadMore){
                card.querySelector('.read-more-btn').addEventListener('click', (event) => {
                  event.preventDefault();

                  const desc = card.querySelector('.candidate-description');
                  const button = event.currentTarget;

                  if(button.textContent === 'Read more'){
                    desc.textContent = description;
                    button.textContent = 'Show less';
                  } else {
                    desc.textContent = shortDescription;
                    button.textContent = 'Read more';
                  }
                });
              }

              list.appendChild(card);
            });
          }

        } catch {
          const list = section.querySelector(`#pos-${pos.id}`);
          list.innerHTML = '<div class="text-danger">Unable to load candidates.</div>';
        }
      }

    } catch {
      container.innerHTML = '<div class="alert alert-danger">Unable to load positions at this time. Please refresh the page.</div>';
    }
  }

  async function submitVote(positionId, candidateId){
    const voter = getVoter();

    if(!voter){
      alert('Please log in before submitting your vote.');
      location.href = '/login/';
      return;
    }

    if(!confirm('Submit vote for this candidate?')) return;

    try {
      const payload = {
        token: voter.token,
        candidate_id: candidateId
      };

      const result = await fetchJSON(API + 'vote/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      cache.results = null;
      cache.positions = null;
      cacheTimestamps.results = null;
      cacheTimestamps.positions = null;

      if(result && result.detail){
        localStorage.setItem('voteMessage', result.detail);
      }

      if(result && result.completed_all_positions){
        localStorage.setItem(
          'voteMessage',
          'You have completed voting for all positions. You will be locked from logging in again for 5 minutes.'
        );
      }

      location.href = '/success/';

    } catch (error) {
      alert('Vote failed: ' + parseErrorMessage(error));
    }
  }

  function renderResultsData(data){
    const container = document.getElementById('results');
    if(!container) return;

    container.innerHTML = '';

    if(!data){
      container.innerHTML = '<div class="alert alert-warning">No vote information found.</div>';
      return;
    }

    if(data.mode === 'my_votes'){
      const voterName = data.voter && data.voter.name ? data.voter.name : 'Voter';
      const voterPhone = data.voter && data.voter.phone ? data.voter.phone : '';
      const totalVotes = data.total_my_votes || 0;

      const summary = document.createElement('div');
      summary.className = 'result-summary p-4 rounded-4 shadow-sm mb-4 bg-white';

      summary.innerHTML = `
        <h4 class="mb-2">My Voting Record</h4>
        <p class="text-muted mb-1">Voter: <strong>${voterName}</strong></p>
        ${voterPhone ? `<p class="text-muted mb-1">Phone: <strong>${voterPhone}</strong></p>` : ''}
        <p class="text-muted mb-0">Positions voted: <strong>${totalVotes}</strong></p>
      `;

      container.appendChild(summary);

      if(!Array.isArray(data.votes) || data.votes.length === 0){
        container.innerHTML += `
          <div class="alert alert-info">
            You have not voted yet.
            <br>
            <a href="/vote/">Go to voting page</a>
          </div>
        `;
        return;
      }

      data.votes.forEach(vote => {
        const card = document.createElement('div');
        card.className = 'result-card p-4 rounded-4 shadow-sm mb-4 bg-white';

        const image = vote.image_url
          ? `<img class="result-photo" src="${vote.image_url}" alt="${vote.candidate}">`
          : '';

        const votedAt = vote.voted_at ? formatDateTime(vote.voted_at) : '';

        card.innerHTML = `
          <div class="candidate-result-item">
            <div class="d-flex align-items-center gap-3">
              ${image}
              <div>
                <div class="text-muted small">Position</div>
                <h5 class="mb-2">${vote.position}</h5>

                <div class="text-muted small">Candidate you voted for</div>
                <strong>${vote.candidate}</strong>

                ${vote.description ? `<div class="text-muted small mt-1">${vote.description}</div>` : ''}
                ${votedAt ? `<div class="text-muted small mt-2">Voted at: ${votedAt}</div>` : ''}
              </div>
            </div>
          </div>
        `;

        container.appendChild(card);
      });

      return;
    }

    if(data.mode === 'admin_results' || Array.isArray(data.positions)){
      if(!Array.isArray(data.positions) || data.positions.length === 0){
        container.innerHTML = '<p class="text-muted">No results are available yet.</p>';
        return;
      }

      const summary = document.createElement('div');
      summary.className = 'result-summary p-4 rounded-4 shadow-sm mb-4 bg-white';

      summary.innerHTML = `
        <div class="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-start">
          <div><strong>Total registered voters:</strong> ${data.total_voters || 0}</div>
          <div><strong>Total votes cast:</strong> ${data.total_votes || 0}</div>
        </div>
      `;

      container.appendChild(summary);

      data.positions.forEach(result => {
        const card = document.createElement('div');
        card.className = 'result-card p-4 rounded-4 shadow-sm mb-4 bg-white';

        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <h5>${result.position}</h5>
              <p class="text-muted mb-0">${result.position_total_votes || 0} votes cast</p>
            </div>
          </div>
        `;

        const list = document.createElement('div');
        list.className = 'candidate-result-list';

        result.candidates.forEach(candidate => {
          const row = document.createElement('div');
          row.className = 'candidate-result-item';

          const image = candidate.image_url
            ? `<img class="result-photo" src="${candidate.image_url}" alt="${candidate.name}">`
            : '';

          row.innerHTML = `
            <div class="d-flex align-items-center gap-3">
              ${image}
              <div>
                <strong>${candidate.name}</strong>
                <div class="text-muted small">${candidate.description || ''}</div>
                <div class="text-muted small">${candidate.percent || 0}% of position votes</div>
              </div>
            </div>
            <span class="text-primary fw-semibold">${candidate.votes || 0}</span>
          `;

          list.appendChild(row);
        });

        card.appendChild(list);
        container.appendChild(card);
      });

      return;
    }

    container.innerHTML = '<div class="alert alert-warning">Unexpected results format.</div>';
  }

  async function updateResults(){
    const status = document.getElementById('lastUpdated');
    const container = document.getElementById('results');

    try {
      const voter = getVoter();

      if(!voter || !voter.token){
        if(container){
          container.innerHTML = `
            <div class="alert alert-warning">
              Please login first to view the votes you submitted.
              <br>
              <a href="/login/?next=/results/">Login here</a>
            </div>
          `;
        }

        if(status){
          status.textContent = 'Login required';
        }

        return;
      }

      const data = await loadMyVotes(voter);

      setCached('results', data);
      renderResultsData(data);

      if(status){
        status.textContent = 'Last updated: ' + formatTime(new Date());
      }

    } catch (error) {
      if(container){
        container.innerHTML = `
          <div class="alert alert-danger">
            Unable to load your votes. Please login again or try again soon.
            <br>
            <small>${parseErrorMessage(error)}</small>
          </div>
        `;
      }

      if(status){
        status.textContent = 'Unable to update results';
      }
    }
  }

  function renderResults(){
    renderAuthStatus();

    const container = document.getElementById('results');
    if(!container) return;

    container.innerHTML = '<div class="loading-card p-4 rounded-4 shadow-sm">Loading your votes…</div>';

    updateResults();

    if(resultsPoll){
      clearInterval(resultsPoll);
    }

    resultsPoll = setInterval(updateResults, 12000);
  }

  function initLogin(){
    const form = document.getElementById('loginForm');
    const alertBox = document.getElementById('loginAlert');

    if(!form) return;

    const nextPath = new URLSearchParams(window.location.search).get('next') || '/';
    const existing = getVoter();

    if(existing){
      const targetLabel = nextPath === '/' ? 'home page' : 'the requested page';

      showAlert(
        alertBox,
        `Existing profile loaded for ${existing.name}. You may update it and continue. You will return to ${targetLabel}.`,
        'info'
      );
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();

      hideAlert(alertBox);

      const name = document.getElementById('loginName').value.trim();
      const phone = document.getElementById('loginPhone').value.trim();

      if(name.length < 2){
        showAlert(alertBox, 'Please enter your full name.');
        return;
      }

      const phonePattern = /^\+255[6-9]\d{8}$/;

      if(!phonePattern.test(phone)){
        showAlert(
          alertBox,
          'Phone must start with +255 and contain 9 digits after the country code.'
        );
        return;
      }

      try {
        const data = await fetchJSON(API + 'login/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, phone }),
        });

        if(data.token){
          setVoter({
            name: data.name,
            phone: data.phone,
            token: data.token
          });

          location.href = nextPath;
        } else {
          showAlert(alertBox, 'Unable to log in: no token returned.');
        }

      } catch (error) {
        showAlert(alertBox, parseErrorMessage(error) || 'Login failed.');
      }
    });
  }

  async function initHome(){
    renderAuthStatus();

    const voter = getVoter();

    const welcomeTitle = document.getElementById('dashboardWelcome');
    const progressPercent = document.getElementById('progressPercent');
    const progressText = document.getElementById('progressText');
    const progressMessage = document.getElementById('progressMessage');
    const circle = document.getElementById('dashboardCircleProgress');

    if(welcomeTitle && voter){
      welcomeTitle.textContent = `Welcome, ${voter.name} 👋`;
    }

    if(!voter || !voter.token){
      if(progressPercent) progressPercent.textContent = '0%';
      if(progressText) progressText.textContent = '0 of 0';
      if(progressMessage) progressMessage.textContent = 'Please login first to see your voting progress.';

      if(circle){
        circle.style.background = `
          radial-gradient(circle at center, #ffffff 52%, transparent 53%),
          conic-gradient(#00a6b3 0deg, #e5e7eb 0deg)
        `;
      }

      return;
    }

    try {
      const positions = await loadPositions();
      const myVotes = await loadMyVotes(voter);

      const totalPositions = Array.isArray(positions) ? positions.length : 0;
      const votedPositions = myVotes && myVotes.total_my_votes ? myVotes.total_my_votes : 0;

      const percent = totalPositions > 0
        ? Math.round((votedPositions / totalPositions) * 100)
        : 0;

      const degrees = Math.round((percent / 100) * 360);

      if(progressPercent) progressPercent.textContent = `${percent}%`;
      if(progressText) progressText.textContent = `${votedPositions} of ${totalPositions}`;

      if(progressMessage){
        if(totalPositions === 0){
          progressMessage.textContent = 'No voting positions are available yet.';
        } else if(votedPositions === 0){
          progressMessage.textContent = 'You haven’t voted for any position yet.';
        } else if(votedPositions < totalPositions){
          progressMessage.textContent = 'You have started voting. Continue until all positions are completed.';
        } else {
          progressMessage.textContent = 'You have completed voting for all positions.';
        }
      }

      if(circle){
        circle.style.background = `
          radial-gradient(circle at center, #ffffff 52%, transparent 53%),
          conic-gradient(#00a6b3 ${degrees}deg, #e5e7eb ${degrees}deg)
        `;
      }

    } catch {
      if(progressMessage){
        progressMessage.textContent = 'Unable to load voting progress. Please refresh the page.';
      }
    }
  }

  function initSuccess(){
    renderAuthStatus();

    const note = document.getElementById('successNote');
    const voter = getVoter();
    const message = localStorage.getItem('voteMessage');

    if(note){
      if(message){
        note.textContent = message;
        localStorage.removeItem('voteMessage');
      } else {
        note.textContent = voter
          ? `Vote recorded for ${voter.name} (${voter.phone}).`
          : 'Vote recorded successfully.';
      }
    }
  }

  window.pageInit = function(page){
    if(!page){
      renderAuthStatus();
      return;
    }

    if(page === 'vote'){
      renderPositions();
    } else if(page === 'results'){
      renderResults();
    } else if(page === 'login'){
      initLogin();
    } else if(page === 'home'){
      initHome();
    } else if(page === 'success'){
      initSuccess();
    }
  };
})();