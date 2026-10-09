const modules={overview:['Owner Overview','',''],leads:['CRM Leads','Manage incoming customer enquiries, assignments and follow-ups.','♧'],quotations:['Quotations','Create proposals, track approvals and manage exceptional discounts.','▤'],projects:['Projects','Track project milestones, ownership and client delivery.','▣'],staff:['Staff & Roles','Manage team accounts and role-based permissions.','♙'],payments:['Payments','Review advance payments, manual verification and approval history.','◇'],accounting:['Accounting','Track invoices, expenses and financial records.','▥'],reports:['Reports','View operational and financial summaries.','▥'],settings:['Settings','Configure company preferences and access policies.','⚙']};
const nav=document.getElementById('adminNav'),overview=document.getElementById('overview'),modulePanel=document.getElementById('modulePanel'),sidebar=document.getElementById('sidebar'),toggle=document.getElementById('menuToggle');
nav.addEventListener('click',event=>{const button=event.target.closest('[data-section]');if(!button)return;const key=button.dataset.section,item=modules[key];if(!item)return;nav.querySelectorAll('button').forEach(el=>el.classList.toggle('active',el===button));document.getElementById('pageTitle').textContent=item[0];overview.classList.toggle('active',key==='overview');modulePanel.classList.toggle('active',key!=='overview');if(key!=='overview'){document.getElementById('moduleHeading').textContent=item[0];document.getElementById('moduleDescription').textContent=item[1];document.getElementById('moduleIcon').textContent=item[2]}sidebar.classList.remove('open');toggle.setAttribute('aria-expanded','false');if(typeof staffPanel!=='undefined')staffPanel.hidden=key!=='staff';if(typeof leadPanel!=='undefined')leadPanel.hidden=key!=='leads';const placeholder=document.querySelector('#modulePanel .module-state');if(placeholder)placeholder.hidden=key==='staff'||key==='leads';if(key==='staff')loadStaffPanel();if(key==='leads')loadLeadPanel()});
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
  document.querySelector('#overview .empty')?.replaceChildren();
  leadListRequestId++;
  leadResults.replaceChildren();
  staffList.replaceChildren();
  staffStatus.textContent = '';
  leadFeedback.textContent = '';
  credentialBox.hidden = true;
  credentialValue.textContent = '';
  staffPanel.hidden = true;
  leadPanel.hidden = true;
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
  const requestToken = ownerAccessToken;
  const response = await fetch(apiOrigin + '/api/admin/leads', {
    headers: { Authorization: 'Bearer ' + ownerAccessToken }
  });
  if (requestToken !== ownerAccessToken) return;
  if (response.status === 401 || response.status === 403) { signOut(); return; }
  if (!response.ok) return;
  const result = await response.json();
  if (requestToken !== ownerAccessToken) return;
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
  const requestToken = ownerAccessToken;
  document.querySelector('#modulePanel .module-state').hidden = true;
  staffList.replaceChildren();
  staffStatus.textContent = 'Loading staff...';
  try {
    const result = await staffRequest('/');
    if(requestToken!==ownerAccessToken)return;
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
          const requestToken = ownerAccessToken;
          if (!requestToken) return;
          reset.disabled = true;
          credentialBox.hidden = true;
          try {
            const result = await staffRequest('/' + encodeURIComponent(member.user_id) + '/reset-password', { method:'POST' });
            if (requestToken !== ownerAccessToken) return;
            credentialValue.textContent = result.temporaryPassword;
            credentialBox.hidden = false;
            staffStatus.textContent = result.warning;
          } catch (error) { if (requestToken === ownerAccessToken) staffStatus.textContent = error.message; }
          finally { reset.disabled = false; }
        });
        row.appendChild(reset);
        const deactivate = document.createElement('button');
        deactivate.type = 'button';
        deactivate.textContent = 'Deactivate';
        deactivate.setAttribute('aria-label', 'Deactivate ' + member.full_name);
        deactivate.addEventListener('click', async () => {
          if (!confirm('Deactivate ' + member.full_name + '? They will lose staff access.')) return;
          const requestToken = ownerAccessToken;
          if (!requestToken) return;
          deactivate.disabled = true;
          credentialBox.hidden = true;
          credentialValue.textContent = '';
          try {
            await staffRequest('/' + encodeURIComponent(member.user_id) + '/deactivate', { method:'POST' });
            if (requestToken !== ownerAccessToken) return;
            await loadStaffPanel();
            if (requestToken !== ownerAccessToken) return;
            staffStatus.textContent = 'Employee deactivated.';
          } catch (error) { if (requestToken === ownerAccessToken) staffStatus.textContent = error.message; }
          finally { deactivate.disabled = false; }
        });
        row.appendChild(deactivate);
      }
      staffList.appendChild(row);
    });
  } catch (error) { if(requestToken===ownerAccessToken)staffStatus.textContent = error.message; }
}
staffForm.addEventListener('submit', async event => {
  event.preventDefault();
  const requestToken = ownerAccessToken;
  if (!requestToken) return;
  const submit = staffForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  credentialBox.hidden = true;
  staffStatus.textContent = 'Creating employee...';
  try {
    const fields = new FormData(staffForm);
    const result = await staffRequest('/', { method:'POST', body:JSON.stringify(Object.fromEntries(fields)) });
    if (requestToken !== ownerAccessToken) return;
    staffForm.reset();
    await loadStaffPanel();
    if (requestToken !== ownerAccessToken) return;
    credentialValue.textContent = result.temporaryPassword;
    credentialBox.hidden = false;
    staffStatus.textContent = result.warning;
  } catch (error) { if (requestToken === ownerAccessToken) staffStatus.textContent = error.message; }
  finally { submit.disabled = false; }
});

const leadPanel=document.createElement('section');
leadPanel.id='ownerLeadManager';
leadPanel.hidden=true;
leadPanel.style.marginTop='24px';
document.getElementById('modulePanel').appendChild(leadPanel);
const leadTitle=document.createElement('h3');
leadTitle.textContent='Customer enquiries · Owner only';
const leadFilter=document.createElement('select');
leadFilter.setAttribute('aria-label','Filter leads by status');
for(const value of ['','new','contacted','qualified','proposal','won','lost','closed']){
  const option=document.createElement('option');
  option.value=value;
  option.textContent=value||'All statuses';
  leadFilter.appendChild(option);
}
const leadRefresh=document.createElement('button');
leadRefresh.type='button';
leadRefresh.textContent='Refresh leads';
const leadFeedback=document.createElement('p');
leadFeedback.setAttribute('role','status');
const leadResults=document.createElement('div');
let leadListRequestId=0;
leadPanel.append(leadTitle,leadFilter,document.createTextNode(' '),leadRefresh,leadFeedback,leadResults);
leadFilter.addEventListener('change',()=>loadLeadPanel());
leadRefresh.addEventListener('click',()=>loadLeadPanel());
async function loadLeadPanel(){
  if(!ownerAccessToken)return;
  const requestToken=ownerAccessToken;
  const requestId=++leadListRequestId;
  leadPanel.hidden=false;
  document.querySelector('#modulePanel .module-state').hidden=true;
  leadResults.replaceChildren();
  leadFeedback.textContent='Loading enquiries...';
  try{
    const query=leadFilter.value?'?status='+encodeURIComponent(leadFilter.value):'';
    const response=await fetch(apiOrigin+'/api/admin/leads'+query,{
      headers:{Authorization:'Bearer '+ownerAccessToken}
    });
    if(requestToken!==ownerAccessToken||requestId!==leadListRequestId)return;
    if(response.status===401||response.status===403){signOut();return;}
    const data=await response.json();
    if(requestToken!==ownerAccessToken||requestId!==leadListRequestId)return;
    if(!response.ok)throw new Error(data.error||'Unable to load enquiries.');
    const leads=Array.isArray(data.leads)?data.leads:[];
    leadFeedback.textContent=leads.length+' enquiries (up to 50 latest).';
    for(const lead of leads){
      const item=document.createElement('article');
      item.className='card';
      const title=document.createElement('h4');
      title.textContent=lead.name||'Unnamed enquiry';
      const details=document.createElement('p');
      details.textContent=[lead.email,lead.service,lead.status||'Unknown status'].filter(Boolean).join(' · ');
      item.append(title,details);
      const historyButton=document.createElement('button');
      historyButton.type='button';
      historyButton.textContent='View follow-up history';
      const history=document.createElement('div');
      history.hidden=true;
      historyButton.addEventListener('click',async()=>{
        const requestToken=ownerAccessToken;
        if(!requestToken)return;
        if(!history.hidden){history.hidden=true;return;}
        history.replaceChildren();
        history.textContent='Loading follow-up history...';
        history.hidden=false;
        historyButton.disabled=true;
        try{
          const response=await fetch(apiOrigin+'/api/admin/lead-workflow/'+encodeURIComponent(lead.id)+'/activity',{
            headers:{Authorization:'Bearer '+ownerAccessToken}
          });
          if(requestToken!==ownerAccessToken)return;
          if(response.status===401||response.status===403){signOut();return;}
          const data=await response.json().catch(()=>({}));
          if(requestToken!==ownerAccessToken)return;
          if(requestToken!==ownerAccessToken)return;
          if(response.status===503){
            history.textContent='Follow-up history is not enabled yet. Existing leads remain available.';
          }else if(!response.ok){
            history.textContent=data.error||'Unable to load follow-up history.';
          }else{
            history.replaceChildren();
            const records=Array.isArray(data.activity)?data.activity:[];
            if(!records.length)history.textContent='No follow-up history yet.';
            for(const record of records){
              const entry=document.createElement('p');
              const timestamp=record.created_at?new Date(record.created_at).toLocaleString():'';
              entry.textContent=[timestamp,record.from_status+' → '+record.to_status,record.note].filter(Boolean).join(' · ');
              history.appendChild(entry);
            }
          }
        }catch(error){if(requestToken===ownerAccessToken)history.textContent='Unable to load follow-up history.';}
        finally{historyButton.disabled=false;}
      });
      const updateForm=document.createElement('form');
      updateForm.style.marginTop='12px';
      const statusSelect=document.createElement('select');
      statusSelect.setAttribute('aria-label','New lead status');
      const allowedLeadTransitions={
        new:['contacted','qualified','lost'],
        contacted:['qualified','lost'],
        qualified:['proposal','lost'],
        proposal:['won','lost'],
        won:[],lost:[],closed:[]
      };
      function refreshLeadStatusOptions(){
        const current=lead.status;
        statusSelect.replaceChildren();
        if(!Object.hasOwn(allowedLeadTransitions,current)){
          const option=document.createElement('option');
          option.textContent='Unknown status — refresh required';
          option.value='';
          statusSelect.appendChild(option);
          statusSelect.disabled=true;
          return;
        }
        statusSelect.disabled=false;
        for(const status of [current,...allowedLeadTransitions[current]]){
          const option=document.createElement('option');
          option.value=status;
          option.textContent=status;
          statusSelect.appendChild(option);
        }
        statusSelect.value=current;
      }
      refreshLeadStatusOptions();
      const noteInput=document.createElement('textarea');
      noteInput.placeholder='Follow-up note (required if status stays the same)';
      noteInput.maxLength=2000;
      noteInput.rows=2;
      noteInput.setAttribute('aria-label','Follow-up note');
      const saveButton=document.createElement('button');
      saveButton.type='submit';
      saveButton.textContent='Save follow-up';
      const updateFeedback=document.createElement('p');
      updateFeedback.setAttribute('role','status');
      updateForm.append(statusSelect,noteInput,saveButton,updateFeedback);
      updateForm.addEventListener('submit',async(event)=>{
        event.preventDefault();
        const requestToken=ownerAccessToken;
        if(!requestToken)return;
        if(statusSelect.disabled)return;
        saveButton.disabled=true;
        updateFeedback.textContent='Saving...';
        try{
          const payload={status:statusSelect.value};
          if(noteInput.value.trim())payload.note=noteInput.value.trim();
          const response=await fetch(apiOrigin+'/api/admin/lead-workflow/'+encodeURIComponent(lead.id)+'/status',{
            method:'PATCH',
            headers:{Authorization:'Bearer '+ownerAccessToken,'Content-Type':'application/json'},
            body:JSON.stringify(payload)
          });
          if(response.status===401||response.status===403){signOut();return;}
          const data=await response.json().catch(()=>({}));
          if(response.status===503){
            updateFeedback.textContent='Lead updates are not enabled yet. No changes saved.';
          }else if(!response.ok){
            updateFeedback.textContent=data.error||'Unable to save follow-up.';
          }else{
            updateFeedback.textContent='Follow-up saved.';
            lead.status=data.status;
            refreshLeadStatusOptions();
            details.textContent=[lead.email,lead.service,lead.status].filter(Boolean).join(' · ');
            noteInput.value='';
            history.hidden=true;
          }
        }catch(error){if(requestToken===ownerAccessToken)updateFeedback.textContent='Unable to save follow-up.';}
        finally{saveButton.disabled=false;}
      });
      item.append(historyButton,history,updateForm);
      leadResults.appendChild(item);
    }
  }catch(error){if(requestToken===ownerAccessToken&&requestId===leadListRequestId)leadFeedback.textContent=error.message||'Unable to load enquiries.';}
}
