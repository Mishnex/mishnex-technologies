const modules={overview:['Owner Overview','',''],leads:['CRM Leads','Manage incoming customer enquiries, assignments and follow-ups.','♧'],quotations:['Quotations','Create proposals, track approvals and manage exceptional discounts.','▤'],projects:['Projects','Track project milestones, ownership and client delivery.','▣'],staff:['Staff & Roles','Manage team accounts and role-based permissions.','♙'],payments:['Payments','Review advance payments, manual verification and approval history.','◇'],accounting:['Accounting','Track invoices, expenses and financial records.','▥'],reports:['Reports','View operational and financial summaries.','▥'],settings:['Settings','Configure company preferences and access policies.','⚙']};
const nav=document.getElementById('adminNav'),overview=document.getElementById('overview'),modulePanel=document.getElementById('modulePanel'),sidebar=document.getElementById('sidebar'),toggle=document.getElementById('menuToggle');
nav.addEventListener('click',event=>{const button=event.target.closest('[data-section]');if(!button)return;const key=button.dataset.section,item=modules[key];if(!item)return;nav.querySelectorAll('button').forEach(el=>el.classList.toggle('active',el===button));document.getElementById('pageTitle').textContent=item[0];overview.classList.toggle('active',key==='overview');modulePanel.classList.toggle('active',key!=='overview');if(key!=='overview'){document.getElementById('moduleHeading').textContent=item[0];document.getElementById('moduleDescription').textContent=item[1];document.getElementById('moduleIcon').textContent=item[2]}sidebar.classList.remove('open');toggle.setAttribute('aria-expanded','false');if(key==='staff')loadStaffPanel();else if(typeof staffPanel!=='undefined')staffPanel.hidden=true});
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
  credentialBox.hidden = true;
  credentialValue.textContent = '';
  staffPanel.hidden = true;
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

const staffPanel = document.createElement('section');
staffPanel.id = 'staffManager';
staffPanel.hidden = true;
staffPanel.style.marginTop = '24px';
document.getElementById('modulePanel').appendChild(staffPanel);
const staffHeading = document.createElement('h3');
staffHeading.textContent = 'Employee accounts · Owner only';
staffPanel.appendChild(staffHeading);
const staffInfo = document.createElement('p');
staffInfo.textContent = 'Create staff without invitation emails. Copy the temporary password securely and ask the employee to change it before staff access is enabled.';
staffPanel.appendChild(staffInfo);
const staffForm = document.createElement('form');
staffForm.innerHTML = '<label>Full name <input name="fullName" minlength="2" maxlength="120" required></label> <label>Email address (Gmail / Yahoo / Outlook) <input name="email" type="email" maxlength="254" required></label> <label>Role <select name="role"><option value="sales">Sales</option><option value="developer">Developer</option><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="super_admin">Super Admin</option></select></label> <button type="submit">Create employee</button>';
staffPanel.appendChild(staffForm);
const staffStatus = document.createElement('p');
staffStatus.setAttribute('role','status');
staffPanel.appendChild(staffStatus);
const credentialBox = document.createElement('div');
credentialBox.hidden = true;
const credentialLabel = document.createElement('strong');
credentialLabel.textContent = 'One-time temporary password: ';
const credentialValue = document.createElement('code');
const credentialCopy = document.createElement('button');
credentialCopy.type = 'button';
credentialCopy.textContent = 'Copy password';
credentialCopy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(credentialValue.textContent); staffStatus.textContent = 'Copied. Share privately and securely.'; }
  catch { staffStatus.textContent = 'Copy failed. Select the displayed password manually.'; }
});
credentialBox.append(credentialLabel,credentialValue,document.createTextNode(' '),credentialCopy);
staffPanel.appendChild(credentialBox);
const staffList = document.createElement('div');
staffPanel.appendChild(staffList);
async function staffRequest(path, options = {}) {
  const response = await fetch(apiOrigin + '/api/admin/staff' + path, {
    ...options, headers: { 'Authorization': 'Bearer ' + ownerAccessToken, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Staff operation failed (' + response.status + ').');
  return data;
}
async function loadStaffPanel() {
  staffPanel.hidden = false;
  document.querySelector('#modulePanel .module-state').hidden = true;
  staffList.replaceChildren();
  staffStatus.textContent = 'Loading staff...';
  try {
    const result = await staffRequest('/');
    staffStatus.textContent = '';
    if (!result.staff.length) { staffList.textContent = 'No employees added yet.'; return; }
    result.staff.forEach(member => {
      const row = document.createElement('p');
      const info = document.createElement('span');
      info.textContent = [member.full_name,member.email,member.role,member.is_active ? 'Active' : 'Disabled'].join(' · ') + ' ';
      row.appendChild(info);
      if (member.is_active) {
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Reset password';
        reset.addEventListener('click', async () => {
          if (!confirm('Generate a new temporary password for ' + member.email + '?')) return;
          reset.disabled = true;
          credentialBox.hidden = true;
          try {
            const result = await staffRequest('/' + encodeURIComponent(member.user_id) + '/reset-password', { method:'POST' });
            credentialValue.textContent = result.temporaryPassword;
            credentialBox.hidden = false;
            staffStatus.textContent = result.warning;
          } catch (error) { staffStatus.textContent = error.message; }
          finally { reset.disabled = false; }
        });
        row.appendChild(reset);
      }
      staffList.appendChild(row);
    });
  } catch (error) { staffStatus.textContent = error.message; }
}
staffForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = staffForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  credentialBox.hidden = true;
  staffStatus.textContent = 'Creating employee...';
  try {
    const fields = new FormData(staffForm);
    const result = await staffRequest('/', { method:'POST', body:JSON.stringify(Object.fromEntries(fields)) });
    staffForm.reset();
    await loadStaffPanel();
    credentialValue.textContent = result.temporaryPassword;
    credentialBox.hidden = false;
    staffStatus.textContent = result.warning;
  } catch (error) { staffStatus.textContent = error.message; }
  finally { submit.disabled = false; }
});
