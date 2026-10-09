const modules={overview:['Owner Overview','',''],leads:['CRM Leads','Manage incoming customer enquiries, assignments and follow-ups.','♧'],quotations:['Quotations','Create proposals, track approvals and manage exceptional discounts.','▤'],projects:['Projects','Track project milestones, ownership and client delivery.','▣'],staff:['Staff & Roles','Manage team accounts and role-based permissions.','♙'],payments:['Payments','Review advance payments, manual verification and approval history.','◇'],accounting:['Accounting','Track invoices, expenses and financial records.','▥'],reports:['Reports','View operational and financial summaries.','▥'],settings:['Settings','Configure company preferences and access policies.','⚙']};
const nav=document.getElementById('adminNav'),overview=document.getElementById('overview'),modulePanel=document.getElementById('modulePanel'),sidebar=document.getElementById('sidebar'),toggle=document.getElementById('menuToggle');
nav.addEventListener('click',event=>{const button=event.target.closest('[data-section]');if(!button)return;const key=button.dataset.section,item=modules[key];if(!item)return;nav.querySelectorAll('button').forEach(el=>el.classList.toggle('active',el===button));document.getElementById('pageTitle').textContent=item[0];overview.classList.toggle('active',key==='overview');modulePanel.classList.toggle('active',key!=='overview');if(key!=='overview'){document.getElementById('moduleHeading').textContent=item[0];document.getElementById('moduleDescription').textContent=item[1];document.getElementById('moduleIcon').textContent=item[2]}sidebar.classList.remove('open');toggle.setAttribute('aria-expanded','false')});
toggle.addEventListener('click',()=>{const open=sidebar.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open))});
let ownerAccessToken = null;
const loginForm = document.getElementById('ownerLoginForm');
const loginMessage = document.getElementById('loginMessage');
const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const apiOrigin = 'https://mishnex-crm-api.onrender.com';
function signOut() {
  ownerAccessToken = null;
  adminApp.hidden = true;
  loginScreen.hidden = false;
  loginForm.reset();
  loginMessage.textContent = '';
  document.getElementById('liveLeads')?.remove();
}
document.getElementById('signOutButton').addEventListener('click', signOut);
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.getElementById('loginSubmit');
  submit.disabled = true;
  loginMessage.textContent = 'Checking credentials...';
  try {
    const response = await fetch(apiOrigin + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('ownerEmail').value.trim(),
        password: document.getElementById('ownerPassword').value
      })
    });
    const result = await response.json();
    if (!response.ok || !result.accessToken) throw new Error(result.error || 'Unable to sign in.');
    ownerAccessToken = result.accessToken;
    loginScreen.hidden = true;
    adminApp.hidden = false;
    loginForm.reset();
    loginMessage.textContent = '';
    await loadLeads();
  } catch (error) {
    loginMessage.textContent = error.message || 'Sign in failed.';
  } finally { submit.disabled = false; }
});
async function loadLeads() {
  if (!ownerAccessToken) return;
  const response = await fetch(apiOrigin + '/api/admin/leads', {
    headers: { Authorization: 'Bearer ' + ownerAccessToken }
  });
  if (response.status === 401 || response.status === 403) { signOut(); return; }
  if (!response.ok) return;
  const result = await response.json();
  const container = document.querySelector('#overview .empty');
  if (!container) return;
  container.replaceChildren();
  const heading = document.createElement('strong');
  heading.textContent = 'Recent CRM enquiries';
  container.appendChild(heading);
  if (!Array.isArray(result.leads) || result.leads.length === 0) {
    const note = document.createElement('p');
    note.textContent = 'No enquiries have been received yet.';
    container.appendChild(note);
    return;
  }
  result.leads.slice(0, 8).forEach(lead => {
    const item = document.createElement('p');
    item.textContent = [lead.name, lead.service, lead.email].filter(Boolean).join(' · ');
    container.appendChild(item);
  });
}
