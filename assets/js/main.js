const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Scroll reveal
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });
$$('.reveal').forEach((el) => revealObserver.observe(el));

// Mobile navigation + dropdown menus
const menuBtn = $('.menu');
const navLinks = $('.navlinks');
menuBtn?.addEventListener('click', () => navLinks?.classList.toggle('mobile-open'));
$$('.nav-dropdown').forEach((dropdown) => {
  const btn = $('.nav-drop-btn', dropdown);
  btn?.addEventListener('click', (event) => {
    event.stopPropagation();
    $$('.nav-dropdown').forEach((d) => { if (d !== dropdown) d.classList.remove('open'); });
    dropdown.classList.toggle('open');
  });
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.nav')) $$('.nav-dropdown').forEach((d) => d.classList.remove('open'));
});
$$('.navlinks a').forEach((a) => a.addEventListener('click', () => navLinks?.classList.remove('mobile-open')));

// Back to top
const topBtn = $('.top-btn');
window.addEventListener('scroll', () => topBtn?.classList.toggle('show', window.scrollY > 500), { passive: true });
topBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// WhatsApp
$$('[data-whatsapp]').forEach((button) => button.addEventListener('click', () => {
  window.open('https://wa.me/917319798299?text=Hello%20Mishnex%20Technologies,%20I%20would%20like%20to%20discuss%20a%20project.', '_blank', 'noopener');
}));

// Animated circular counters
const counterObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const value = $('.counter-value', entry.target);
    const ring = $('.counter-ring', entry.target);
    if (!value || !ring || value.dataset.animated === 'true') return;
    value.dataset.animated = 'true';
    const target = Number(value.dataset.target || 0);
    const suffix = value.dataset.suffix || '';
    const duration = target > 500 ? 2100 : 1500;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const current = Math.floor(target * ease(progress));
      value.textContent = current.toLocaleString('en-IN') + suffix;
      ring.style.setProperty('--progress', `${360 * progress}deg`);
      if (progress < 1) requestAnimationFrame(tick);
      else value.textContent = target.toLocaleString('en-IN') + suffix;
    };
    requestAnimationFrame(tick);
    observer.unobserve(entry.target);
  });
}, { threshold: 0.35 });
$$('.stat').forEach((stat) => { if ($('.counter-value', stat)) counterObserver.observe(stat); });

// Live form validation
function setupForm(form) {
  const fields = {
    name: { err: 'nameErr', validate: (v) => /^[A-Za-z][A-Za-z .'-]{1,49}$/.test(v), message: 'Name can contain letters and spaces only.' },
    email: { err: 'emailErr', validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), message: 'Please enter a valid email address.' },
    phone: { err: 'phoneErr', validate: (v) => /^\d{10}$/.test(v), message: 'Mobile number must contain exactly 10 digits.' },
    service: { err: 'serviceErr', validate: (v) => Boolean(v), message: 'Please select a service.' },
    requirement: { err: 'requirementErr', validate: (v) => v.length >= 10, message: 'Please describe your requirement in at least 10 characters.' }
  };

  const getError = (name) => $(`#${fields[name].err}`, form);
  const getInput = (name) => $(`[name="${name}"]`, form);

  const clearState = (name) => {
    const input = getInput(name), error = getError(name);
    input?.classList.remove('invalid', 'valid');
    if (error) error.textContent = '';
  };
  const validateField = (name, force = false) => {
    const input = getInput(name), error = getError(name);
    if (!input) return true;
    const value = input.value.trim();
    if (!value && !force) { clearState(name); return true; }
    const valid = fields[name].validate(value);
    input.classList.toggle('invalid', !valid);
    input.classList.toggle('valid', valid);
    if (error) error.textContent = valid ? '' : fields[name].message;
    return valid;
  };

  Object.keys(fields).forEach((name) => {
    const input = getInput(name);
    if (!input) return;
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => validateField(name, false));
    input.addEventListener('blur', () => validateField(name, true));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const ok = Object.keys(fields).every((name) => validateField(name, true));
    const success = $('#formSuccess', form);
    if (!ok) {
      if (success) success.style.display = 'none';
      return;
    }
    if (form.closest('body') && location.pathname.toLowerCase().includes('contact')) {
      const modal = $('#successModal');
      if (modal) { modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
      form.reset();
    }
    if (success) success.style.display = 'none';
  });
}
$$('.lead-form').forEach(setupForm);

// Continuous infinite testimonial slider. It pauses only while the cursor/focus is over the review area.
$$('.testimonials').forEach((section) => {
  const viewport = $('.t-viewport', section);
  const track = $('.t-track', section);
  if (!viewport || !track) return;
  const original = [...track.children];
  if (original.length < 2) return;
  original.forEach((card) => track.appendChild(card.cloneNode(true)));
  let offset = 0;
  let paused = false;
  let last = performance.now();
  const speed = () => window.innerWidth < 600 ? 0.16 : 0.22;
  const halfWidth = () => track.scrollWidth / 2;
  const frame = (now) => {
    const dt = Math.min(now - last, 40);
    last = now;
    if (!paused) {
      offset += speed() * dt;
      const limit = halfWidth();
      if (offset >= limit) offset -= limit;
      track.style.transform = `translate3d(${-offset}px,0,0)`;
    }
    requestAnimationFrame(frame);
  };
  const pause = () => { paused = true; };
  const resume = () => { paused = false; last = performance.now(); };
  viewport.addEventListener('mouseenter', pause);
  viewport.addEventListener('mouseleave', resume);
  viewport.addEventListener('focusin', pause);
  viewport.addEventListener('focusout', resume);

  // Manual arrows: temporarily pause and move by one card, then resume.
  const moveManual = (direction) => {
    paused = true;
    const card = $('.review', track);
    const step = (card?.getBoundingClientRect().width || 360) + 20;
    offset += direction * step;
    const limit = halfWidth();
    if (offset < 0) offset += limit;
    if (offset >= limit) offset -= limit;
    track.style.transition = 'transform .45s cubic-bezier(.22,.8,.2,1)';
    track.style.transform = `translate3d(${-offset}px,0,0)`;
    setTimeout(() => { track.style.transition = ''; resume(); }, 500);
  };
  $('.circle[data-prev]', section)?.addEventListener('click', () => moveManual(-1));
  $('.circle[data-next]', section)?.addEventListener('click', () => moveManual(1));
  requestAnimationFrame(frame);
});

// Contact form: prefilled WhatsApp message and email handoff.
function buildLeadMessage(form) {
  const data = new FormData(form);
  return [
    'Hello Mishnex Technologies, I would like to discuss a project.', '',
    `Name: ${data.get('name') || '-'}`,
    `Mobile: ${data.get('phone') || '-'}`,
    `Email: ${data.get('email') || '-'}`,
    `Service: ${data.get('service') || '-'}`,
    `Estimated Budget: ${data.get('budget') || 'Not decided'}`,
    `Preferred Call Time: ${data.get('calltime') || 'ASAP / Next available'}`,
    `Project Message: ${data.get('requirement') || '-'}`
  ].join('\n');
}
$$('.whatsapp-form-btn').forEach((button) => button.addEventListener('click', () => {
  const form = button.closest('form');
  if (!form) return;
  window.open(`https://wa.me/917319798299?text=${encodeURIComponent(buildLeadMessage(form))}`, '_blank', 'noopener');
}));

// Project Builder live estimate.
const builder = $('.builder');
if (builder) {
  let currency = 'usd';
  const featurePrices = { usd: 50, inr: 4800 };
  const symbols = { usd: '$', inr: '₹' };
  const format = (value) => Number(value).toLocaleString('en-IN');
  const updateBuilder = () => {
    const active = $('.business.active', builder) || $('.business', builder);
    const base = Number(active?.dataset[currency === 'usd' ? 'baseUsd' : 'baseInr'] || 0);
    const selected = $$('.feature-list input:checked', builder).length;
    const total = base + selected * featurePrices[currency];
    $$('[data-price="base"]', builder).forEach((el) => el.textContent = `${symbols[currency]}${format(base)}`);
    $$('[data-price="feature"]', builder).forEach((el) => el.textContent = `+${symbols[currency]}${format(featurePrices[currency])}`);
    const totalEl = $('#estimateTotal', builder);
    if (totalEl) totalEl.textContent = currency === 'usd' ? `$${format(total)} USD` : `₹${format(total)} INR`;
  };
  $$('.currency-toggle button', builder).forEach((button) => button.addEventListener('click', () => {
    currency = button.dataset.currency;
    $$('.currency-toggle button', builder).forEach((b) => b.classList.toggle('active', b === button));
    updateBuilder();
  }));
  $$('.business', builder).forEach((button) => button.addEventListener('click', () => {
    $$('.business', builder).forEach((b) => b.classList.remove('active'));
    button.classList.add('active'); updateBuilder();
  }));
  $$('.feature-list input', builder).forEach((input) => input.addEventListener('change', updateBuilder));
  updateBuilder();
}

// Contact success confirmation modal.
const successModal = $('#successModal');
if (successModal) {
  const closeSuccess = () => { successModal.classList.remove('show'); successModal.setAttribute('aria-hidden','true'); };
  $('.success-close', successModal)?.addEventListener('click', closeSuccess);
  successModal.addEventListener('click', (e) => { if (e.target === successModal) closeSuccess(); });
}

// Home page: show the contact form automatically after 10 seconds.
(() => {
  const popup = document.getElementById('contactPopup');
  if (!popup) return;
  const openPopup = () => {
    popup.classList.add('show');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('popup-open');
  };
  const closePopup = () => {
    popup.classList.remove('show');
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('popup-open');
  };
  const timer = window.setTimeout(openPopup, 10000);
  popup.querySelectorAll('[data-popup-close]').forEach((el) => el.addEventListener('click', closePopup));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && popup.classList.contains('show')) closePopup();
  });
  window.addEventListener('beforeunload', () => window.clearTimeout(timer));
})();
