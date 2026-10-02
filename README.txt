MISHNEX TECHNOLOGIES — WEBART ORBIT V3

Pages
- index.html
- about.html
- services.html
- technology.html
- work.html
- team.html
- contact.html

Implemented changes
- Home hero keeps four rotating concentric rings, now with only 8 icon-only technology logos: React, JavaScript, Node.js, Python, Next.js, Java, MongoDB and PostgreSQL. Technology names were removed.
- Home Leadership & Core Team preview removed.
- Home testimonials removed.
- Client Showcase is present on every page, runs faster, loops continuously and has a 3D perspective/tilt treatment. Hover pauses it.
- Customer Reviews are present on every page except Home, with a continuous infinite slider that pauses only while the cursor/focus is over the review area and resumes afterward.
- Owner/team page retains: Vishal Kumar — Founder & CEO; Ankit Kumar — Founder; Vivek Kumar — Core IT Head; Md Ohab — Core IT Head; Satyam Bhardwaj — Core Finance Head.
- Navbar now has Company, Services and Technology dropdown menus plus circular social-media icon buttons.
- Home/contact enquiry forms have visible labels above every field and live red validation while typing/changing values.
- Numeric counters animate from 0 when scrolled into view and use circular progress rings. Numeric counters on About are also animated.
- Section spacing was reduced so adjacent sections do not have excessive empty gaps.
- WhatsApp and Back-to-Top controls remain site-wide.
- Mishnex logo background is processed as transparent PNG for the animated logo treatment.

Run locally
1. Open Terminal in this folder.
2. Run: python3 -m http.server 8765
3. Open: http://localhost:8765/

Important
The enquiry form performs browser-side validation and shows a validation success message. It does not claim that an email was delivered. Connect the form to the real backend/FormSubmit endpoint before production use.

Social icons
The circular icons are visually wired into the navbar, but their href values are placeholders (#) until the exact official Mishnex social profile URLs are supplied.
